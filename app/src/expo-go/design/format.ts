const LOWERCASE_NAME_PARTICLES = new Set(["da", "das", "de", "do", "dos", "e"]);
const LOWERCASE_ACADEMIC_PARTICLES = new Set([...LOWERCASE_NAME_PARTICLES, "em"]);

/** Normalizes portal all-caps names for display without changing stored data. */
export function formatPersonName(value: string | null | undefined): string | null {
  const normalized = value?.trim().replace(/\s+/g, " ");
  if (!normalized) return null;
  return normalized
    .toLocaleLowerCase("pt-BR")
    .split(" ")
    .map((word, index) => {
      if (index > 0 && LOWERCASE_NAME_PARTICLES.has(word)) return word;
      return word.charAt(0).toLocaleUpperCase("pt-BR") + word.slice(1);
    })
    .join(" ");
}

/** Converts portal all-caps academic labels while preserving acronyms/roman numerals. */
export function formatAcademicName(value: string | null | undefined): string | null {
  const normalized = value?.trim().replace(/\s+/g, " ");
  if (!normalized) return null;
  if (normalized !== normalized.toLocaleUpperCase("pt-BR")) return normalized;
  return normalized.split(" ").map((word, index) => {
    const lower = word.toLocaleLowerCase("pt-BR");
    if (index > 0 && LOWERCASE_ACADEMIC_PARTICLES.has(lower)) return lower;
    if (/^[IVXLCDM]+$/.test(word) || /^[A-Z0-9]{1,3}$/.test(word)) return word;
    return lower.charAt(0).toLocaleUpperCase("pt-BR") + lower.slice(1);
  }).join(" ");
}

export function formatCourseName(value: string | null | undefined): string | null {
  const normalized = value?.trim().replace(/\s+/g, " ")
    .replace(/^\d{2,}\s*[-–—]\s*/, "");
  if (!normalized) return null;
  return normalized.split(/\s+[-–—]\s+/)
    .map((part) => formatAcademicName(part) ?? part)
    .join(" · ");
}

/** Keeps the complete schedule interval visible in compact Home summaries. */
export function formatScheduleSlot(value: string | null | undefined): string | null {
  const normalized = value?.trim().replace(/\s+/g, " ");
  if (!normalized) return null;
  const times = [...normalized.matchAll(/(\d{1,2}:\d{2})/g)].map((match) => match[1]);
  return times.length >= 2 ? `${times[0]}–${times[1]}` : normalized;
}

/** Labels a room explicitly without changing the value received from the portal. */
export function formatScheduleRoom(value: string | null | undefined): string | null {
  const normalized = value?.trim().replace(/\s+/g, " ");
  if (!normalized) return null;
  return /^sala\b/i.test(normalized) ? normalized : `Sala ${normalized}`;
}

export function nextClassContext(day: number, today = new Date().getDay()): string {
  if (day === today) return "PRÓXIMA AULA · HOJE";
  if (day === (today + 1) % 7) return "PRÓXIMA AULA · AMANHÃ";
  return `PRÓXIMA AULA · ${["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"][day] ?? "—"}`;
}

export function hasPublishedValue(value: {
  published: boolean;
  value: number | string | null;
}): boolean {
  if (!value.published || value.value === null || value.value === undefined) return false;
  if (typeof value.value === "number") return Number.isFinite(value.value);
  const normalized = value.value.trim().replace(",", ".");
  return normalized !== "" && Number.isFinite(Number(normalized));
}

export function courseDisplayValue(course: {
  finalGrade: number | string | null;
  assessments: Array<{ published: boolean; value: number | string | null }>;
}): number | string | null {
  const official = { published: true, value: course.finalGrade };
  if (hasPublishedValue(official)) return course.finalGrade;
  const published = course.assessments.filter(hasPublishedValue);
  return published.length ? published[published.length - 1].value : null;
}

export function publishedAssessmentsCount(courses: Array<{
  assessments: Array<{ published: boolean; value: number | string | null }>;
}>): number {
  return courses.reduce(
    (total, course) => total + course.assessments.filter(hasPublishedValue).length,
    0,
  );
}
