import { createHash } from "node:crypto";

export const MAX_TURMAS_PER_USER = 100;
export const MAX_EVENTS = 10;

export class InputValidationError extends Error {}

export function normalizeTurmaCodes(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > MAX_TURMAS_PER_USER) {
    throw new InputValidationError(`turmas deve ter no máximo ${MAX_TURMAS_PER_USER} itens.`);
  }
  const out = [...new Set(value.map((t) => (typeof t === "string" ? t.trim() : "")))];
  if (out.some((t) => {
    const parts = t.split("::");
    return t.length > 100 || t.includes("/") || /[\u0000-\u001f]/.test(t) ||
      parts.length !== 2 || parts.some((p) => !p);
  })) {
    throw new InputValidationError("Código de turma inválido.");
  }
  return out;
}

export function normalizeEvents(value: unknown): string[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_EVENTS) {
    throw new InputValidationError(`events deve ter entre 1 e ${MAX_EVENTS} itens.`);
  }
  const events = value.map((event) => (typeof event === "string" ? event.trim() : ""));
  if (events.some((event) =>
    !event || event.length > 240 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(event)
  )) {
    throw new InputValidationError("Evento inválido.");
  }
  return events;
}

export function normalizeEmail(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") throw new InputValidationError("Email inválido.");
  const email = value.trim();
  if (email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new InputValidationError("Email inválido.");
  }
  return email;
}

export function reportId(turmaCode: string, uid: string): string {
  return createHash("sha256").update(`${turmaCode}\0${uid}`).digest("hex");
}

export function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value ?? fallback);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function effectiveQuorum(configured: number, eligibleDevices: number): number {
  return Math.max(1, Math.min(configured, eligibleDevices));
}
