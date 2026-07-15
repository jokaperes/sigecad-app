/**
 * Testa o ciclo do sentinela com fakes (sem rede/token/device). Roda com:
 *   npx tsx app/tests/cycle.test.ts
 */
import type { PollClient, Periodo } from "../src/core/client";
import type { Notas, Turma } from "../src/core/types";
import { runSentinelCycle } from "../src/sentinel/cycle";
import type { CycleStorage, Reporter, TurmaState } from "../src/sentinel/cycle";

const PERIODOS: Periodo[] = [
  { id: 222, nome: "2026/1", data_inicio: "2026-03-01", data_fim: "2026-07-31" },
];

// Cliente fake: devolve turmas + notas conforme o "cenário" atual (mutável).
function fakeClient(getNotas: () => Notas): PollClient {
  const turmas: Turma[] = [
    {
      id: 1, matricula_id: 99, codigo: "07008721", turma: "T1",
      disciplina: "ANÁLISE", resultado: "MAT", faltas: 2, tem_notas: true,
    },
  ];
  return {
    async periodos() { return PERIODOS; },
    async turmas() { return turmas; },
    async notas() { return getNotas(); },
  };
}

function memStorage(): CycleStorage & { dump: Record<string, TurmaState> } {
  const dump: Record<string, TurmaState> = {};
  return {
    dump,
    async getTurmaState(code) { return dump[code] ?? null; },
    async setTurmaState(code, s) { dump[code] = s; },
  };
}

function recordingReporter(): Reporter & { calls: any[] } {
  const calls: any[] = [];
  return { calls, async report(p) { calls.push(p); } };
}

let fails = 0;
async function check(name: string, fn: () => Promise<void>) {
  try { await fn(); console.log(`  ok   ${name}`); }
  catch (e) { fails++; console.log(`  FAIL ${name}: ${(e as Error).message}`); }
}
function assert(c: unknown, m = "assert falhou") { if (!c) throw new Error(m); }

// nota A1 nao publicada
const NAO_PUB: Notas = { notas: [{ nome: "A1", valor: null, publicar: false }] };
// nota A1 publicada com valores DIFERENTES (dois alunos)
const PUB_ALUNO_A: Notas = { notas: [{ nome: "A1", valor: 8.0, publicar: true }] };
const PUB_ALUNO_B: Notas = { notas: [{ nome: "A1", valor: 6.0, publicar: true }] };

async function main() {
await check("baseline nao reporta", async () => {
  const storage = memStorage();
  const reporter = recordingReporter();
  const res = await runSentinelCycle(
    { client: fakeClient(() => NAO_PUB), storage, reporter },
    ["07008721::T1"],
  );
  assert(reporter.calls.length === 0, "baseline nao deveria reportar");
  assert(res.length === 0, "baseline sem eventos");
  assert(storage.dump["07008721::T1"], "baseline deveria salvar estado");
});

await check("publicacao reporta NOTA PUBLICADA", async () => {
  const storage = memStorage();
  const reporter = recordingReporter();
  const deps = { client: fakeClient(() => NAO_PUB), storage, reporter };
  await runSentinelCycle(deps, ["07008721::T1"]); // baseline
  // agora publica:
  const res = await runSentinelCycle(
    { client: fakeClient(() => PUB_ALUNO_A), storage, reporter },
    ["07008721::T1"],
  );
  assert(reporter.calls.length === 1, `esperava 1 report, veio ${reporter.calls.length}`);
  assert(
    reporter.calls[0].events.some((e: string) => e.includes("NOTA PUBLICADA")),
    JSON.stringify(reporter.calls[0].events),
  );
  assert(res[0].reported === true);
});

await check("dois devices -> MESMO stateHash (quorum funciona)", async () => {
  // aluno A e aluno B, mesma turma, nota publicada com valores diferentes.
  const shOf = async (notas: Notas) => {
    const storage = memStorage();
    const reporter = recordingReporter();
    const deps = { client: fakeClient(() => NAO_PUB), storage, reporter };
    await runSentinelCycle(deps, ["07008721::T1"]); // baseline de cada device
    await runSentinelCycle(
      { client: fakeClient(() => notas), storage, reporter },
      ["07008721::T1"],
    );
    return reporter.calls[0].stateHash as string;
  };
  const shA = await shOf(PUB_ALUNO_A);
  const shB = await shOf(PUB_ALUNO_B);
  assert(shA === shB, `stateHash divergiu: A=${shA} B=${shB}`);
});

await check("sem cutucar turma especifica -> descobre todas", async () => {
  const storage = memStorage();
  const reporter = recordingReporter();
  const deps = { client: fakeClient(() => NAO_PUB), storage, reporter };
  await runSentinelCycle(deps); // baseline, sem passar turmaCodes
  const res = await runSentinelCycle(
    { client: fakeClient(() => PUB_ALUNO_A), storage, reporter },
  );
  assert(res.length === 1 && res[0].turmaCode === "07008721::T1", JSON.stringify(res));
});

await check("falha ao reportar nao avanca estado local", async () => {
  const storage = memStorage();
  await runSentinelCycle(
    { client: fakeClient(() => NAO_PUB), storage, reporter: recordingReporter() },
    ["07008721::T1"],
  );
  const before = JSON.stringify(storage.dump["07008721::T1"]);
  const failing: Reporter = { async report() { throw new Error("offline"); } };
  let failed = false;
  try {
    await runSentinelCycle(
      { client: fakeClient(() => PUB_ALUNO_A), storage, reporter: failing },
      ["07008721::T1"],
    );
  } catch {
    failed = true;
  }
  assert(failed, "o ciclo deveria propagar a falha de rede");
  assert(JSON.stringify(storage.dump["07008721::T1"]) === before, "estado avançou e perderia o retry");
});

console.log(`\n${5 - fails}/5 passaram`);
process.exit(fails ? 1 : 0);
}

main();
