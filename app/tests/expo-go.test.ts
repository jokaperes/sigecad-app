import { loadAcademicOverview } from "../src/core/academic";
import {
  BRIDGE_CHANNEL,
  CARD_BRIDGE_BOOTSTRAP,
  MAX_BRIDGE_MESSAGE_BYTES,
  PortalBridgeError,
  buildBridgeCommand,
  parseBridgeResponse,
} from "../src/expo-go/bridge";
import { parseStudentCard } from "../src/expo-go/card";
import { ExpoGoPollClient } from "../src/expo-go/client";
import { DataValidationError, parseNotas, parsePeriodos, parseTurmas } from "../src/expo-go/validation";

let failures = 0;
let total = 0;

async function check(name: string, test: () => void | Promise<void>) {
  total += 1;
  try {
    await test();
    console.log(`  ok   ${name}`);
  } catch (cause) {
    failures += 1;
    console.log(`  FAIL ${name}: ${cause instanceof Error ? cause.message : String(cause)}`);
  }
}

function assert(condition: unknown, message = "assert falhou"): asserts condition {
  if (!condition) throw new Error(message);
}

function rejects(fn: () => unknown, type: new (...args: never[]) => Error) {
  try {
    fn();
  } catch (cause) {
    assert(cause instanceof type, `erro inesperado: ${String(cause)}`);
    return;
  }
  throw new Error("operação perigosa foi aceita");
}

async function main() {
await check("bridge aceita somente envelope esperado", () => {
  const response = parseBridgeResponse(JSON.stringify({
    channel: BRIDGE_CHANNEL,
    id: "req-42",
    ok: true,
    status: 200,
    data: [{ id: 1 }],
  }));
  assert(response.id === "req-42" && response.ok && response.status === 200);
});

await check("bridge rejeita canal e JSON desconhecidos", () => {
  rejects(() => parseBridgeResponse("not-json"), PortalBridgeError);
  rejects(() => parseBridgeResponse(JSON.stringify({
    channel: "attacker",
    id: "req-1",
    ok: true,
    status: 200,
  })), PortalBridgeError);
});

await check("bridge limita tamanho de mensagem", () => {
  rejects(() => parseBridgeResponse("x".repeat(MAX_BRIDGE_MESSAGE_BYTES + 1)), PortalBridgeError);
});

await check("comando de bridge não aceita ID nem parâmetro injetável", () => {
  const command = buildBridgeCommand("req-7", "turmas", 12);
  assert(command.includes('"numericId":12'));
  rejects(() => buildBridgeCommand("req-1);alert(1)//", "periodos"), Error);
  rejects(() => buildBridgeCommand("req-1", "notas", -1), Error);
  assert(buildBridgeCommand("req-8", "card").includes('"kind":"card"'));
});

await check("ponte de cartão deriva recursos da página e nunca lê cookie", () => {
  assert(CARD_BRIDGE_BOOTSTRAP.includes("visualiza_pessoa"));
  assert(CARD_BRIDGE_BOOTSTRAP.includes("listagem_extrato_ajax_ru"));
  assert(CARD_BRIDGE_BOOTSTRAP.includes("listagem_extrato_ajax_cantina"));
  assert(!CARD_BRIDGE_BOOTSTRAP.includes("document.cookie"));
  assert(!CARD_BRIDGE_BOOTSTRAP.includes("request.statusId"));
  assert(!CARD_BRIDGE_BOOTSTRAP.includes("request.resourceHash"));
});

await check("validadores normalizam respostas reais", () => {
  const periods = parsePeriodos([{ id: "9", ano: 2026, semestre: 1, data_inicio: "2026-01-01T00:00:00" }]);
  const courses = parseTurmas([{
    id: "3",
    matricula_id: 44,
    codigo: 700,
    turma: "T1",
    disciplina: "Segurança",
    resultado: null,
    faltas: "2",
    limite_faltas: 18,
    tem_notas: 1,
  }]);
  const notes = parseNotas({ notas: [{ nome: "P1", valor: 9.5, publicar: 1 }] });
  assert(periods[0].id === 9 && periods[0].nome === "2026/1");
  assert(courses[0].faltas === 2 && courses[0].tem_notas);
  assert(notes.notas[0].publicar && notes.notas[0].valor === 9.5);
});

await check("validadores recusam payloads abusivos", () => {
  rejects(() => parsePeriodos(new Array(101).fill({ id: 1, nome: "X" })), DataValidationError);
  rejects(() => parseTurmas([{ id: 1, matricula_id: 2, codigo: "X", turma: "T", disciplina: "\u0000", tem_notas: false }] ), DataValidationError);
  rejects(() => parseNotas({ notas: [{ nome: "P1", valor: "x".repeat(101), publicar: true }] }), DataValidationError);
});

await check("cliente acadêmico usa apenas as três operações REST permitidas", async () => {
  const calls: string[] = [];
  const client = new ExpoGoPollClient(async (kind, id) => {
    calls.push(`${kind}:${id ?? ""}`);
    if (kind === "periodos") return [{ id: 1, nome: "2026/1" }];
    if (kind === "turmas") return [];
    return { notas: [] };
  });
  await client.periodos();
  await client.turmas(1);
  await client.notas(2);
  assert(calls.join(",") === "periodos:,turmas:1,notas:2", calls.join(","));
});

await check("cartão aceita somente dados sanitizados e número mascarado", () => {
  const card = parseStudentCard({
    name: "ALUNO TESTE",
    course: "COMPUTAÇÃO",
    active: "Sim",
    cardLast4: "0466",
    version: "Via 1",
    ruBalance: "R$ 5,80",
    canteenBalance: "R$ 4,00",
    photoDataUrl: "data:image/png;base64,iVBORw0KGgo=",
    ruTransactions: [{ date: "15/07/2026", time: "12:30", type: "Débito", value: "R$ 1,00", merchant: "RU" }],
    canteenTransactions: [],
  });
  assert(card.cardLast4 === "0466" && card.ruTransactions[0].merchant === "RU");
  rejects(() => parseStudentCard({
    cardLast4: "2022000466",
    ruTransactions: [],
    canteenTransactions: [],
  }), DataValidationError);
});

await check("cartão limita extrato e rejeita imagem externa", () => {
  rejects(() => parseStudentCard({
    photoDataUrl: "https://attacker.invalid/photo.jpg",
    ruTransactions: [],
    canteenTransactions: [],
  }), DataValidationError);
  rejects(() => parseStudentCard({
    ruTransactions: new Array(41).fill({ date: "15/07/2026" }),
    canteenTransactions: [],
  }), DataValidationError);
});

await check("visão mostra nota em memória mas snapshot persiste só hash", async () => {
  const sensitiveGrade = "9.75-SENSITIVE";
  const overview = await loadAcademicOverview({
    async periodos() {
      return [{ id: 10, nome: "2026/1", data_inicio: "2020-01-01", data_fim: "2099-12-31" }];
    },
    async turmas() {
      return [{
        id: 1,
        matricula_id: 99,
        codigo: "0700",
        turma: "T1",
        disciplina: "Testes",
        resultado: null,
        faltas: 1,
        limite_faltas: 18,
        tem_notas: true,
      }];
    },
    async notas() {
      return { notas: [{ nome: "P1", valor: sensitiveGrade, publicar: true }] };
    },
  }, async () => undefined);

  assert(overview.courses[0].assessments[0].value === sensitiveGrade);
  const persistedShape = JSON.stringify({ items: overview.items, labels: overview.labels });
  assert(!persistedShape.includes(sensitiveGrade), "snapshot vazou o valor da nota");
  assert(Object.values(overview.items).every((item) => /^[a-f0-9]{16}$/.test(item.hash)));
});

console.log(`\n${total - failures}/${total} passaram`);
process.exit(failures ? 1 : 0);
}

void main();
