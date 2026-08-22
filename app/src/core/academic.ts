import { currentPeriod, type Periodo, type PollClient } from "./client";
import { buildSnapshot } from "./snapshot";
import type { Items, Labels, Notas, Turma } from "./types";

export interface AcademicAssessment {
  name: string;
  value: number | string | null;
  published: boolean;
}

export interface AcademicCourse {
  enrollmentId: number;
  code: string;
  name: string;
  section: string;
  result: string | null;
  absences: number | null;
  absenceLimit: number | null;
  totalHours: number | null;
  approvalAverage: number | string | null;
  finalGrade: number | string | null;
  formula: string | null;
  assessments: AcademicAssessment[];
}

export interface AcademicOverview {
  period: Periodo;
  courses: AcademicCourse[];
  items: Items;
  labels: Labels;
  checkedAt: string;
}

/**
 * Fetches one complete foreground view without persisting grade values. The
 * optional delay is injectable so tests stay instant while production remains
 * polite to the university portal.
 */
export async function loadAcademicOverview(
  client: PollClient,
  delay: (index: number) => Promise<void> = politeDelay,
): Promise<AcademicOverview> {
  const period = currentPeriod(await client.periodos());
  const turmas = await client.turmas(period.id);
  const notesByEnrollment: Record<number, Notas> = {};
  let noteRequestIndex = 0;

  for (const course of turmas) {
    if (!course.tem_notas) continue;
    if (noteRequestIndex > 0) await delay(noteRequestIndex);
    notesByEnrollment[course.matricula_id] = await client.notas(course.matricula_id);
    noteRequestIndex += 1;
  }

  return buildAcademicOverview(period, turmas, notesByEnrollment);
}

export function buildAcademicOverview(
  period: Periodo,
  turmas: Turma[],
  notesByEnrollment: Record<number, Notas>,
): AcademicOverview {
  const { items, labels } = buildSnapshot(turmas, notesByEnrollment);
  return {
    period,
    courses: turmas.map((course) => toAcademicCourse(course, notesByEnrollment)),
    items,
    labels,
    checkedAt: new Date().toISOString(),
  };
}

function toAcademicCourse(
  course: Turma,
  notesByEnrollment: Record<number, Notas>,
): AcademicCourse {
  const notes = notesByEnrollment[course.matricula_id]?.notas ?? [];
  return {
    enrollmentId: course.matricula_id,
    code: course.codigo,
    name: course.disciplina,
    section: course.turma,
    result: course.resultado,
    absences: course.faltas,
    absenceLimit: course.limite_faltas ?? null,
    totalHours: course.ch_total ?? null,
    approvalAverage: notesByEnrollment[course.matricula_id]?.media_aprovacao ?? null,
    finalGrade: notesByEnrollment[course.matricula_id]?.nota_final ?? null,
    formula: notesByEnrollment[course.matricula_id]?.formula ?? null,
    assessments: notes.map((assessment) => ({
      name: assessment.nome,
      value: assessment.valor,
      published: assessment.publicar,
    })),
  };
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const politeDelay = () => sleep(350 + Math.random() * 650);
