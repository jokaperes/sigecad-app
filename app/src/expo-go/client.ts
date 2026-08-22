import { currentPeriod, type Periodo, type PollClient } from "../core/client";
import { buildAcademicOverview, type AcademicOverview } from "../core/academic";
import type { Notas, Turma } from "../core/types";
import type { BridgeKind } from "./bridge";
import { parseNotas, parsePeriodos, parseTurmas } from "./validation";

export type PortalRequest = (
  kind: BridgeKind,
  numericId?: number,
) => Promise<unknown>;

export interface PortalBatchItem {
  kind: BridgeKind;
  numericId?: number;
}

export type PortalBatchRequest = (
  items: PortalBatchItem[],
) => Promise<PromiseSettledResult<unknown>[]>;

export interface PortalStartupResponses {
  profile: PromiseSettledResult<unknown>;
  schedule: PromiseSettledResult<unknown>;
  enrollmentWindows: PromiseSettledResult<unknown>;
}

export interface AcademicStartup {
  overview: AcademicOverview;

  courses: Turma[];
  portal: PortalStartupResponses;
}

export interface AcademicNotesHydration {
  overview: AcademicOverview;

  complete: boolean;
}


export function createBatchedPortalRequest(requestBatch: PortalBatchRequest): PortalRequest {
  let queue: Array<{
    item: PortalBatchItem;
    resolve(value: unknown): void;
    reject(error: unknown): void;
  }> = [];
  let scheduled = false;

  const flush = async () => {
    scheduled = false;
    const current = queue;
    queue = [];
    try {
      const results = await requestBatch(current.map((entry) => entry.item));
      current.forEach((entry, index) => {
        const result = results[index];
        if (result?.status === "fulfilled") entry.resolve(result.value);
        else entry.reject(result?.reason ?? new Error("Consulta acadêmica incompleta."));
      });
    } catch (cause) {
      current.forEach((entry) => entry.reject(cause));
    }
  };

  return (kind, numericId) => new Promise<unknown>((resolve, reject) => {
    queue.push({ item: { kind, numericId }, resolve, reject });
    if (!scheduled) {
      scheduled = true;
      void Promise.resolve().then(flush);
    }
  });
}


export async function loadAcademicOverviewFast(
  request: PortalRequest,
  requestBatch: PortalBatchRequest,
): Promise<AcademicOverview> {
  const periods = parsePeriodos(await request("periodos"));
  const period = currentPeriod(periods);
  const courses = parseTurmas(await request("turmas", period.id));
  const withNotes = courses.filter((course) => course.tem_notas);
  const results = await requestBatch(withNotes.map((course) => ({
    kind: "notas",
    numericId: course.matricula_id,
  })));
  const notesByEnrollment: Record<number, Notas> = {};
  results.forEach((result, index) => {
    if (result.status === "rejected") throw result.reason;
    notesByEnrollment[withNotes[index].matricula_id] = parseNotas(result.value);
  });
  return buildAcademicOverview(period, courses, notesByEnrollment);
}


export async function loadAcademicStartupFast(
  request: PortalRequest,
  requestBatch: PortalBatchRequest,
): Promise<AcademicStartup> {
  const periods = parsePeriodos(await request("periodos"));
  const period = currentPeriod(periods);
  const base = await requestBatch([
    { kind: "dadosacademico" },
    { kind: "turmas", numericId: period.id },
    { kind: "horarios", numericId: period.id },
    { kind: "notificacoes" },
  ]);
  const coursesResponse = base[1];
  if (!coursesResponse || coursesResponse.status === "rejected") {
    throw coursesResponse?.reason ?? new Error("Disciplinas indisponíveis.");
  }
  const courses = parseTurmas(coursesResponse.value);
  const missing = (label: string): PromiseRejectedResult => ({
    status: "rejected",
    reason: new Error(`${label} indisponível.`),
  });
  return {
    overview: buildAcademicOverview(period, courses, {}),
    courses,
    portal: {
      profile: base[0] ?? missing("Perfil"),
      schedule: base[2] ?? missing("Horários"),
      enrollmentWindows: base[3] ?? missing("Operações acadêmicas"),
    },
  };
}


export async function hydrateAcademicNotes(
  request: PortalRequest,
  startup: Pick<AcademicStartup, "overview" | "courses">,
): Promise<AcademicNotesHydration> {
  const withNotes = startup.courses.filter((course) => course.tem_notas);
  const results = await Promise.allSettled(withNotes.map((course) =>
    request("notas", course.matricula_id)
  ));
  const notesByEnrollment: Record<number, Notas> = {};
  let complete = true;
  results.forEach((result, index) => {
    if (result.status === "rejected") {
      complete = false;
      return;
    }
    try {
      notesByEnrollment[withNotes[index].matricula_id] = parseNotas(result.value);
    } catch {
      complete = false;
    }
  });
  return {
    overview: buildAcademicOverview(
      startup.overview.period,
      startup.courses,
      notesByEnrollment,
    ),
    complete,
  };
}


export class ExpoGoPollClient implements PollClient {
  constructor(private readonly request: PortalRequest) {}

  async periodos(): Promise<Periodo[]> {
    return parsePeriodos(await this.request("periodos"));
  }

  async turmas(periodId: number): Promise<Turma[]> {
    assertPositiveId(periodId);
    return parseTurmas(await this.request("turmas", periodId));
  }

  async notas(enrollmentId: number): Promise<Notas> {
    assertPositiveId(enrollmentId);
    return parseNotas(await this.request("notas", enrollmentId));
  }
}

function assertPositiveId(value: number): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error("Identificador acadêmico inválido.");
  }
}
