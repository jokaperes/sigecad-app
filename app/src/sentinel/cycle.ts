/**
 * Ciclo do sentinela — o "cérebro" que o silent push aciona no device.
 *
 * Fluxo (espelha run_sentinel_once de server/poller.py, mas rodando NO device
 * com o token local): poll -> recorta cada turma -> diff contra o estado local
 * guardado -> se mudou, reporta { turmaCode, stateHash, events } ao servidor.
 * NUNCA envia token nem nota; o servidor só recebe hash opaco + eventos.
 */
import { collectSnapshot } from "../core/client";
import type { PollClient } from "../core/client";
import { diff } from "../core/diff";
import { stateHash, turmaCodesOf, turmaGradeItems } from "../core/snapshot";
import type { Items, Labels } from "../core/types";

export interface TurmaState {
  items: Items;
  labels: Labels;
}

/** Persistência local do último estado por turma (AsyncStorage no device). */
export interface CycleStorage {
  getTurmaState(code: string): Promise<TurmaState | null>;
  setTurmaState(code: string, state: TurmaState): Promise<void>;
}

/** Envia o report ao backend (callable reportEvent, com selo App Check). */
export interface Reporter {
  report(payload: {
    turmaCode: string;
    stateHash: string;
    events: string[];
  }): Promise<void>;
}

export interface CycleDeps {
  client: PollClient;
  storage: CycleStorage;
  reporter: Reporter;
}

export interface CycleResult {
  turmaCode: string;
  events: string[];
  stateHash: string;
  reported: boolean;
}

/**
 * Roda um ciclo. `turmaCodes` = turmas cutucadas pelo silent push; se omitido,
 * checa todas as turmas do aluno. Baseline (primeira vez que vê a turma) só
 * salva, sem reportar — evita "Nova avaliação" falso pra todo mundo.
 */
export async function runSentinelCycle(
  deps: CycleDeps,
  turmaCodes?: string[],
): Promise<CycleResult[]> {
  const { items, labels } = await collectSnapshot(deps.client);
  const codes = turmaCodes ?? turmaCodesOf(items);
  const results: CycleResult[] = [];

  for (const code of codes) {
    const cur = turmaGradeItems(items, labels, code);
    if (Object.keys(cur.items).length === 0) continue; // turma sem avaliações ainda

    const prev = await deps.storage.getTurmaState(code);
    const events = diff(prev?.items ?? {}, cur.items, cur.labels);
    const sh = stateHash(cur.items);

    const reported = Boolean(prev) && events.length > 0;
    if (reported) {
      await deps.reporter.report({ turmaCode: code, stateHash: sh, events });
    }
    // Só avança o estado depois de reportar. Se a rede falhar, o próximo silent
    // push tenta o mesmo evento novamente; o backend deduplica por stateHash.
    await deps.storage.setTurmaState(code, cur);
    if (reported || (prev && events.length)) {
      results.push({ turmaCode: code, events, stateHash: sh, reported });
    }
  }
  return results;
}
