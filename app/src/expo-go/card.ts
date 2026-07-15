import type { PortalRequest } from "./client";
import { DataValidationError } from "./validation";

export interface CardTransaction {
  date: string;
  time: string;
  type: string;
  value: string;
  merchant: string;
}

export interface StudentCard {
  name: string | null;
  course: string | null;
  active: string | null;
  cardLast4: string | null;
  version: string | null;
  ruBalance: string | null;
  canteenBalance: string | null;
  photoDataUrl: string | null;
  ruTransactions: CardTransaction[];
  canteenTransactions: CardTransaction[];
}

/** Card/profile data stays in React memory and is never written to storage. */
export async function loadStudentCard(request: PortalRequest): Promise<StudentCard> {
  return parseStudentCard(await request("card"));
}

export function parseStudentCard(value: unknown): StudentCard {
  const item = object(value, "cartão");
  return {
    name: optionalString(item.name, 300),
    course: optionalString(item.course, 300),
    active: optionalString(item.active, 80),
    cardLast4: optionalCardLast4(item.cardLast4),
    version: optionalString(item.version, 60),
    ruBalance: optionalMoney(item.ruBalance),
    canteenBalance: optionalMoney(item.canteenBalance),
    photoDataUrl: optionalPhoto(item.photoDataUrl),
    ruTransactions: parseTransactions(item.ruTransactions, "RU"),
    canteenTransactions: parseTransactions(item.canteenTransactions, "Cantina"),
  };
}

function parseTransactions(value: unknown, label: string): CardTransaction[] {
  if (!Array.isArray(value) || value.length > 40) {
    throw new DataValidationError(`Extrato ${label} inválido.`);
  }
  return value.map((row) => {
    const item = object(row, `movimentação ${label}`);
    return {
      date: requiredString(item.date, 30, "data"),
      time: optionalString(item.time, 20) ?? "",
      type: optionalString(item.type, 80) ?? "Movimentação",
      value: optionalString(item.value, 60) ?? "—",
      merchant: optionalString(item.merchant, 160) ?? "",
    };
  });
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new DataValidationError(`Formato inválido para ${label}.`);
  }
  return value as Record<string, unknown>;
}

function optionalString(value: unknown, max: number): string | null {
  if (value === null || value === undefined || value === "") return null;
  return requiredString(value, max, "texto");
}

function requiredString(value: unknown, max: number, label: string): string {
  if (typeof value !== "string") throw new DataValidationError(`${label} inválido.`);
  const parsed = value.trim();
  if (!parsed || parsed.length > max || /[\u0000-\u001f]/.test(parsed)) {
    throw new DataValidationError(`${label} inválido.`);
  }
  return parsed;
}

function optionalCardLast4(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || !/^\d{4}$/.test(value)) {
    throw new DataValidationError("Final do cartão inválido.");
  }
  return value;
}

function optionalMoney(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || !/^R\$\s\d[\d.,]*[,.]\d{2}$/.test(value) || value.length > 40) {
    throw new DataValidationError("Saldo inválido.");
  }
  return value;
}

function optionalPhoto(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (
    typeof value !== "string" || value.length > 900_000 ||
    !/^data:image\/(?:jpeg|png);base64,[A-Za-z0-9+/]+=*$/.test(value)
  ) {
    throw new DataValidationError("Foto inválida.");
  }
  return value;
}
