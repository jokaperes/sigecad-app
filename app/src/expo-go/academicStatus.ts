import type { AcademicCourse } from "../core/academic";
import type { ScheduleEntry } from "./portalData";

const FINISHED_RESULTS = new Set(["AP", "RP", "APE", "RPF"]);

/** MAT remains active; only known final SIGECAD results close the discipline. */
export function isFinishedCourse(course: Pick<AcademicCourse, "result">): boolean {
  const code = course.result?.trim().toUpperCase().split(/[\s-]+/)[0] ?? "";
  return FINISHED_RESULTS.has(code);
}

/**
 * Hides a schedule row only when every matching enrollment is finished. This
 * avoids hiding an active section when names are duplicated or section is absent.
 */
export function activeScheduleEntries(
  entries: ScheduleEntry[],
  courses: AcademicCourse[],
): ScheduleEntry[] {
  return entries.filter((entry) => {
    const name = comparableCourseName(entry.course);
    const section = entry.section.trim().toUpperCase();
    const matches = courses.filter((course) => comparableCourseName(course.name) === name &&
      (!section || !course.section || course.section.trim().toUpperCase() === section));
    return !matches.length || matches.some((course) => !isFinishedCourse(course));
  });
}

function comparableCourseName(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().toUpperCase();
}
