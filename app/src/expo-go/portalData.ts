import type { AcademicCourse, AcademicOverview } from "../core/academic";
import type { PortalRequest, PortalStartupResponses } from "./client";
import { isFinishedCourse } from "./academicStatus";
import { DataValidationError } from "./validation";

export interface AbsenceEntry {
  date: string;
  time: string;
}

export interface ScheduleEntry {
  day: number;
  slot: string;
  course: string;
  section: string;
  room: string;
  building: string;
  unit: string;
  professor: string;
}

export interface EnrollmentEntry {
  id: number;
  code: string;
  course: string;
  section: string;
  requestedAt: string | null;
  status: "Deferida" | "Em análise" | "Cancelada";
  stage: string;
}

export interface HistoryCourse {
  id: number;
  term: string;
  code: string;
  name: string;
  hours: number | null;
  grade: number | string | null;
  result: string | null;
  absences: number | null;
  type: string | null;
  evaluation: string | null;
}

export type CourseTypeFilter = "all" | "OBR" | "OPT" | "ELT";

export interface OfficialTypeAverage {
  type: "OBR" | "OPT" | "ELT";
  label: string;
  average: number;
  count: number;
}

export interface CurriculumCourse {
  id: number;
  code: string;
  name: string;
  hours: number | null;
  type: string | null;
  status: "done" | "current" | "pending";
}

export interface Workload {
  requiredDone: number;
  requiredTotal: number;
  optionalDone: number;
  optionalTotal: number;
  extensionDone: number;
  extensionTotal: number;
  totalDone: number;
  totalRequired: number;
}

export interface AcademicProfile {
  name: string | null;
  rga: string | null;
  course: string | null;
  faculty: string | null;
  facultyCode: string | null;
  admission: string | null;
  status: string | null;
  progress: number | null;
  structure: string | null;
}

export interface EnrollmentWindow {
  id: number;
  label: string;
  startsAt: string;
  endsAt: string;
}

export interface PortalData {
  absences: Record<string, AbsenceEntry[]>;
  schedule: ScheduleEntry[];
  enrollments: EnrollmentEntry[];
  history: HistoryCourse[];
  curriculum: CurriculumCourse[];
  workload: Workload | null;
  profile: AcademicProfile | null;
  enrollmentWindows: EnrollmentWindow[];
  unavailable: string[];
}

/**
 * The history screen's `/rest/chcursada` totals are the authoritative course
 * completion source. The profile percentage is only a fast startup fallback
 * until that secondary response arrives.
 */
export function resolveCourseProgress(
  profileProgress: number | null | undefined,
  workload: Workload | null | undefined,
): number | null {
  if (workload && workload.totalRequired > 0) {
    const percent = workload.totalDone / workload.totalRequired * 100;
    if (Number.isFinite(percent)) return Math.max(0, Math.min(100, percent));
  }
  return typeof profileProgress === "number" && Number.isFinite(profileProgress)
    ? Math.max(0, Math.min(100, profileProgress))
    : null;
}

type JsonObject = Record<string, unknown>;

async function fetchOptional<T>(
  request: PortalRequest,
  unavailable: string[],
  label: string,
  kind: Parameters<PortalRequest>[0],
  id: number | undefined,
  parser: (value: unknown) => T,
): Promise<T | null> {
  try {
    return parser(await request(kind, id));
  } catch {
    unavailable.push(label);
    return null;
  }
}

/** Highest priority: identity while the WebView is still on the academic origin. */
export async function loadPortalIdentity(
  request: PortalRequest,
): Promise<PortalData> {
  const unavailable: string[] = [];
  const profile = await fetchOptional(
    request, unavailable, "perfil acadêmico", "dadosacademico", undefined, parseProfile,
  );
  return { ...emptyPortalData(), profile, unavailable };
}

/** Current-period data required before the full Home replaces priority loading. */
export async function loadPortalCurrent(
  request: PortalRequest,
  overview: AcademicOverview,
  base: PortalData,
): Promise<PortalData> {
  const unavailable = [...base.unavailable];
  const [schedule, windows] = await Promise.all([
    fetchOptional(request, unavailable, "horários", "horarios", overview.period.id, parseSchedule),
    fetchOptional(request, unavailable, "operações acadêmicas", "notificacoes", undefined, parseEnrollmentWindows),
  ]);
  return {
    ...base,
    schedule: schedule ?? [],
    enrollmentWindows: windows ?? [],
    unavailable: [...new Set(unavailable)],
  };
}

/** Builds the optional Home data returned by the coordinated startup batch. */
export function portalDataFromStartup(responses: PortalStartupResponses): PortalData {
  const unavailable: string[] = [];
  const settled = <T>(
    result: PromiseSettledResult<unknown>,
    label: string,
    parser: (value: unknown) => T,
  ): T | null => {
    if (result.status === "rejected") {
      unavailable.push(label);
      return null;
    }
    try {
      return parser(result.value);
    } catch {
      unavailable.push(label);
      return null;
    }
  };
  return {
    ...emptyPortalData(),
    profile: settled(responses.profile, "perfil acadêmico", parseProfile),
    schedule: settled(responses.schedule, "horários", parseSchedule) ?? [],
    enrollmentWindows: settled(
      responses.enrollmentWindows,
      "operações acadêmicas",
      parseEnrollmentWindows,
    ) ?? [],
    unavailable,
  };
}

/** Secondary screens; safe to hydrate after the complete Home is visible. */
export async function loadPortalExtras(
  request: PortalRequest,
  overview: AcademicOverview,
  base: PortalData,
): Promise<PortalData> {
  const unavailable = [...base.unavailable];
  const fixedPromise = Promise.all([
    fetchOptional(request, unavailable, "histórico", "historico", undefined, parseHistory),
    fetchOptional(request, unavailable, "matrícula", "matriculas", overview.period.id, parseEnrollments),
    fetchOptional(request, unavailable, "estrutura curricular", "estrutura", undefined, parseStructure),
    fetchOptional(request, unavailable, "carga horária", "chcursada", undefined, parseWorkload),
    fetchOptional(request, unavailable, "situação das disciplinas", "cursadascursando", undefined, parseCourseStates),
  ]);
  const absencesPromise = Promise.all(overview.courses.filter((course) => !isFinishedCourse(course)).map(async (course) => {
    const entries = await fetchOptional(
      request, unavailable, `faltas de ${course.code}`, "faltas", enrollmentId(course), parseAbsences,
    );
    return [courseKey(course), entries ?? []] as const;
  }));
  const [[history, enrollments, structure, workload, courseStates], absenceResults] =
    await Promise.all([fixedPromise, absencesPromise]);
  const resolvedProfile = base.profile
    ? { ...base.profile, admission: resolveAdmission(base.profile.admission, history ?? []) }
    : null;
  return {
    ...base,
    absences: Object.fromEntries(absenceResults),
    enrollments: enrollments ?? [],
    history: history ?? [],
    curriculum: applyCourseStates(structure?.courses ?? [], courseStates),
    workload,
    profile: structure && resolvedProfile
      ? { ...resolvedProfile, structure: resolvedProfile.structure ?? structure.structure, faculty: resolvedProfile.faculty ?? structure.faculty }
      : resolvedProfile,
    unavailable: [...new Set(unavailable)],
  };
}

export async function loadPortalData(
  request: PortalRequest,
  overview: AcademicOverview,
): Promise<PortalData> {
  const identity = await loadPortalIdentity(request);
  const current = await loadPortalCurrent(request, overview, identity);
  return loadPortalExtras(request, overview, current);
}

function enrollmentId(course: AcademicCourse): number {
  const id = course.enrollmentId;
  if (!Number.isSafeInteger(id) || (id ?? 0) <= 0) {
    throw new DataValidationError("Matrícula da disciplina indisponível.");
  }
  return id!;
}

export function courseKey(course: Pick<AcademicCourse, "code" | "section">): string {
  return `${course.code}::${course.section}`;
}

export function emptyPortalData(): PortalData {
  return {
    absences: {},
    schedule: [],
    enrollments: [],
    history: [],
    curriculum: [],
    workload: null,
    profile: null,
    enrollmentWindows: [],
    unavailable: [],
  };
}

function parseAbsences(value: unknown): AbsenceEntry[] {
  return array(value, 120, "meses de faltas").flatMap((month) => {
    const item = object(month, "mês de faltas");
    return array(item.faltas ?? [], 100, "faltas").map((row) => {
      const absence = object(row, "falta");
      return {
        date: optionalText(absence.data, 40) ?? "Data não informada",
        time: optionalText(absence.hora, 30) ?? "",
      };
    });
  }).slice(0, 500);
}

function parseSchedule(value: unknown): ScheduleEntry[] {
  const days = ["segunda", "terca", "quarta", "quinta", "sexta", "sabado"] as const;
  return array(value, 40, "horários").flatMap((row) => {
    const slot = object(row, "faixa de horário");
    return days.flatMap((day, index) => array(slot[day] ?? [], 30, day).map((raw) => {
      const item = object(raw, "aula");
      return {
        day: index + 1,
        slot: optionalText(item.horario, 60) ?? optionalText(slot.horario, 60) ?? "Horário não informado",
        course: optionalText(item.disciplina, 300) ?? "Disciplina",
        section: optionalText(item.turma, 80) ?? "",
        room: optionalText(item.sala, 120) ?? "",
        building: optionalText(item.predio, 120) ?? "",
        unit: optionalText(item.unidade, 120) ?? "",
        professor: optionalText(item.professor, 200) ?? "",
      };
    }));
  }).slice(0, 200);
}

function parseEnrollments(value: unknown): EnrollmentEntry[] {
  return array(value, 200, "matrículas").map((raw) => {
    const item = object(raw, "matrícula");
    const situation = optionalNumber(item.situacao) ?? 0;
    const cancelled = Boolean(item.data_cancelamento || item.data_remocao);
    return {
      id: positiveInteger(item.id, "ID da matrícula"),
      code: optionalText(item.codigo, 80) ?? "—",
      course: optionalText(item.disciplina, 300) ?? "Disciplina",
      section: optionalText(item.turma, 80) ?? "",
      requestedAt: optionalText(item.data_solicitacao ?? item.data_matricula, 80),
      status: cancelled ? "Cancelada" : situation === 1 ? "Deferida" : "Em análise",
      stage: optionalText(item.etapa, 80) ?? "",
    };
  });
}

function parseHistory(value: unknown): HistoryCourse[] {
  return array(value, 100, "semestres do histórico").flatMap((raw) => {
    const term = object(raw, "semestre do histórico");
    const fallbackTerm = optionalText(term.ano_semestre, 30) ?? "Período";
    return array(term.historico ?? [], 100, "disciplinas do histórico").map((entry) => {
      const item = object(entry, "disciplina do histórico");
      const year = optionalNumber(item.ano);
      const semester = optionalNumber(item.semestre);
      return {
        id: positiveInteger(item.id, "ID do histórico"),
        term: year && semester ? `${year}/${semester}` : fallbackTerm,
        code: optionalText(item.codigo_disciplina, 80) ?? "—",
        name: optionalText(item.nome_disciplina, 300) ?? "Disciplina",
        hours: optionalNumber(item.ch_total),
        grade: optionalScalar(item.nota),
        result: optionalText(item.resultado, 120),
        absences: optionalNumber(item.faltas),
        type: optionalText(item.tipo_disciplina, 100),
        evaluation: optionalText(item.avaliacao, 40),
      };
    });
  }).slice(0, 800);
}

function parseStructure(value: unknown): { courses: CurriculumCourse[]; structure: string | null; faculty: string | null } {
  const root = object(value, "estrutura curricular");
  const courses = array(root.grades ?? [], 1000, "grade curricular").map((raw) => {
    const item = object(raw, "disciplina da estrutura");
    return {
      id: positiveInteger(item.disciplina_id ?? item.id, "ID da disciplina"),
      code: optionalText(item.codigo_disciplina, 80) ?? "—",
      name: optionalText(item.nome_disciplina, 300) ?? "Disciplina",
      hours: optionalNumber(item.ch_total),
      type: optionalText(item.tipo_disciplina, 100),
      status: "pending" as const,
    };
  });
  return {
    courses,
    structure: optionalText(root.estrutura, 120),
    faculty: optionalText(root.faculdade, 200),
  };
}

function parseCourseStates(value: unknown): { done: Set<number>; current: Set<number> } {
  const root = object(value, "situação das disciplinas");
  const ids = (key: string) => new Set(array(root[key] ?? [], 1000, key).map((raw) => {
    const item = object(raw, key);
    return positiveInteger(item.disciplina_id, "ID da disciplina");
  }));
  return { done: ids("cursadas"), current: ids("cursando") };
}

function applyCourseStates(
  courses: CurriculumCourse[],
  states: { done: Set<number>; current: Set<number> } | null,
): CurriculumCourse[] {
  if (!states) return courses;
  return courses.map((course) => ({
    ...course,
    status: states.done.has(course.id) ? "done" : states.current.has(course.id) ? "current" : "pending",
  }));
}

function parseWorkload(value: unknown): Workload {
  const item = object(value, "carga horária");
  return {
    requiredDone: optionalNumber(item.ch_obr_academico) ?? 0,
    requiredTotal: optionalNumber(item.ch_obr_curso) ?? 0,
    optionalDone: optionalNumber(item.ch_opt_academico) ?? 0,
    optionalTotal: optionalNumber(item.ch_opt_curso) ?? 0,
    extensionDone: optionalNumber(item.ch_ext_academico) ?? 0,
    extensionTotal: optionalNumber(item.ch_ext_curso) ?? 0,
    totalDone: optionalNumber(item.ch_total_academico) ?? 0,
    totalRequired: optionalNumber(item.ch_total_curso) ?? 0,
  };
}

function parseProfile(value: unknown): AcademicProfile {
  const item = object(value, "dados acadêmicos");
  const structureYear = optionalText(item.estrutura_ano, 20);
  const structureNumber = optionalText(item.estrutura_numero, 20);
  const rga = optionalText(item.rga, 100);
  return {
    name: optionalText(item.nome, 300),
    rga,
    course: optionalText(item.curso, 300),
    faculty: optionalText(item.faculdade, 300),
    facultyCode: optionalText(item.sigla_faculdade, 40),
    admission: admissionFromRga(rga),
    status: optionalText(item.ultima_ocorrencia, 200),
    progress: boundedPercent(item.percentual_concluido),
    structure: [structureYear, structureNumber].filter(Boolean).join("/") || null,
  };
}

function admissionFromRga(rga: string | null): string | null {
  const explicit = rga?.match(/^((?:19|20)\d{2})\.([12])/);
  if (explicit) return `${explicit[1]}/${explicit[2]}`;
  const numeric = rga?.match(/^((?:19|20)\d{2})\d{10}$/);
  return numeric?.[1] ?? null;
}

const COURSE_TYPE_LABELS: Record<"OBR" | "OPT" | "ELT", string> = {
  OBR: "OBR",
  OPT: "OPT",
  ELT: "ELT",
};

export function normalizeCourseType(
  type: string | null | undefined,
): "OBR" | "OPT" | "ELT" | "LEG" | null {
  const value = (type ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim();
  if (!value) return null;
  if (value === "OBR" || value.startsWith("OBRIG")) return "OBR";
  if (value === "OPT" || value.startsWith("OPTAT")) return "OPT";
  if (value === "ELT" || value.startsWith("ELET")) return "ELT";
  if (value === "LEG") return "LEG";
  return null;
}

export function matchesCourseType(
  type: string | null | undefined,
  filter: CourseTypeFilter,
): boolean {
  if (filter === "all") return true;
  return normalizeCourseType(type) === filter;
}

export function officialAveragesByType(history: HistoryCourse[]): OfficialTypeAverage[] {
  const buckets: Record<"OBR" | "OPT" | "ELT", number[]> = { OBR: [], OPT: [], ELT: [] };
  for (const course of history) {
    const kind = normalizeCourseType(course.type);
    if (kind !== "OBR" && kind !== "OPT" && kind !== "ELT") continue;
    if (/conceito/i.test(course.evaluation ?? "")) continue;
    const grade = numericHistoryGrade(course.grade);
    if (grade === null) continue;
    buckets[kind].push(grade);
  }
  const result: OfficialTypeAverage[] = [];
  for (const type of ["OBR", "OPT", "ELT"] as const) {
    const grades = buckets[type];
    if (!grades.length) continue;
    const sum = grades.reduce((total, value) => total + value, 0);
    result.push({
      type,
      label: COURSE_TYPE_LABELS[type],
      average: Math.round(sum / grades.length * 100) / 100,
      count: grades.length,
    });
  }
  return result;
}

function numericHistoryGrade(value: number | string | null | undefined): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

export function resolveAdmission(candidate: string | null, history: HistoryCourse[]): string | null {
  if (candidate && /^(?:19|20)\d{2}\/[12]$/.test(candidate)) return candidate;
  const year = candidate?.match(/^((?:19|20)\d{2})$/)?.[1];
  const terms = history.map((item) => item.term)
    .filter((term) => /^(?:19|20)\d{2}\/[12]$/.test(term))
    .sort();
  if (year) return terms.find((term) => term.startsWith(`${year}/`)) ?? year;
  return terms[0] ?? null;
}

function parseEnrollmentWindows(value: unknown): EnrollmentWindow[] {
  const root = object(value, "notificações");
  return array(root.operacoes ?? [], 100, "operações").map((raw) => {
    const item = object(raw, "operação");
    return {
      id: positiveInteger(item.id, "ID da operação"),
      label: enrollmentWindowLabel(optionalText(item.etapa_matricula, 160)),
      startsAt: joinDateTime(item.data_inicio, item.hora_inicio),
      endsAt: joinDateTime(item.data_fim, item.hora_fim),
    };
  });
}

function enrollmentWindowLabel(value: string | null): string {
  if (!value) return "Matrícula";
  const stage = value.match(/^MATR[IÍ]CULA\s*ETAPA\s*(\d+)$/i);
  if (stage) return `Matrícula · etapa ${stage[1]}`;
  if (value === value.toLocaleUpperCase("pt-BR")) {
    const lower = value.toLocaleLowerCase("pt-BR");
    return lower.charAt(0).toLocaleUpperCase("pt-BR") + lower.slice(1);
  }
  return value;
}

function joinDateTime(date: unknown, time: unknown): string {
  return [optionalText(date, 40), optionalText(time, 30)].filter(Boolean).join(" ");
}

function array(value: unknown, max: number, label: string): unknown[] {
  if (!Array.isArray(value) || value.length > max) throw new DataValidationError(`Formato inválido para ${label}.`);
  return value;
}

function object(value: unknown, label: string): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new DataValidationError(`Formato inválido para ${label}.`);
  }
  return value as JsonObject;
}

function optionalText(value: unknown, max: number): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" && typeof value !== "number") return null;
  const parsed = String(value).replace(/\s+/g, " ").trim();
  if (!parsed || parsed.length > max || /[\u0000-\u001f]/.test(parsed)) return null;
  return parsed;
}

function optionalNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function optionalScalar(value: unknown): number | string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return optionalText(value, 100);
}

function positiveInteger(value: unknown, label: string): number {
  const parsed = optionalNumber(value);
  if (!parsed || !Number.isSafeInteger(parsed)) throw new DataValidationError(`${label} inválido.`);
  return parsed;
}

function boundedPercent(value: unknown): number | null {
  const parsed = optionalNumber(value);
  return parsed !== null && parsed <= 100 ? parsed : null;
}
