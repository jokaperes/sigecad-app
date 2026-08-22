import type { AcademicCourse } from "../core/academic";
import type { ScheduleEntry } from "./portalData";

const FINISHED_RESULTS = new Set(["AP", "RP", "APE", "RPF"]);


export function isFinishedCourse(course: Pick<AcademicCourse, "result">): boolean {
  const code = course.result?.trim().toUpperCase().split(/[\s-]+/)[0] ?? "";
  return FINISHED_RESULTS.has(code);
}


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
