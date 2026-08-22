import type { ScheduleEntry } from "../portalData";

function slotMinutes(slot: string): number[] {
  return [...slot.matchAll(/(\d{1,2}):(\d{2})/g)]
    .map((match) => Number(match[1]) * 60 + Number(match[2]));
}

export function currentSchedule(entries: ScheduleEntry[], now = new Date()): ScheduleEntry | null {
  const minutes = now.getHours() * 60 + now.getMinutes();
  return entries.find((entry) => {
    if (entry.day !== now.getDay()) return false;
    const [start, explicitEnd] = slotMinutes(entry.slot);
    const end = explicitEnd ?? ((start ?? 9999) + 120);
    return start !== undefined && start <= minutes && minutes < end;
  }) ?? null;
}

export function nextSchedule(
  entries: ScheduleEntry[],
  current: ScheduleEntry | null,
  now = new Date(),
): ScheduleEntry | null {
  const day = now.getDay();
  const minutes = now.getHours() * 60 + now.getMinutes();
  const start = (entry: ScheduleEntry) => slotMinutes(entry.slot)[0] ?? 9999;
  const daysAhead = (entry: ScheduleEntry) => entry.day === day
    ? (start(entry) > minutes ? 0 : 7)
    : (entry.day - day + 7) % 7;
  return entries.filter((entry) => entry !== current)
    .sort((a, b) => daysAhead(a) - daysAhead(b) || start(a) - start(b))[0] ?? null;
}
