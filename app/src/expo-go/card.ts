import type { PortalRequest } from "./client";
import { DataValidationError } from "./validation";

export interface CardTransaction {
  date: string;
  time: string;
  type: string;
  value: string;
  merchant: string;
}

export type PhotoStatus =
  | "ok"
  | "not-found"
  | "invalid-url"
  | "http-error"
  | "too-large"
  | "invalid-image"
  | "read-error"
  | "render-error"
  | "not-requested";

export type PhotoVariant = "original" | "2048" | "1024" | "portal";

export interface StudentCard {
  name: string | null;
  course: string | null;
  active: string | null;
  cardLast4: string | null;
  /** Full card number kept in React memory only, exclusively for Code 128. */
  barcodeValue: string | null;
  version: string | null;
  ruBalance: string | null;
  canteenBalance: string | null;
  photoDataUrl: string | null;
  photoStatus: PhotoStatus;
  photoWidth: number | null;
  photoHeight: number | null;
  photoVariant: PhotoVariant | null;
  page: number;
  ruTransactions: CardTransaction[];
  canteenTransactions: CardTransaction[];
}

/** Card/profile data stays in React memory and is never written to storage. */
export async function loadStudentCard(request: PortalRequest): Promise<StudentCard> {
  return loadStudentCardPage(request, 1);
}

export async function loadStudentCardSummary(request: PortalRequest): Promise<StudentCard> {
  return parseStudentCard(await request("card-summary"));
}

export async function loadStudentCardPage(request: PortalRequest, page: number): Promise<StudentCard> {
  if (!Number.isSafeInteger(page) || page < 1 || page > 50) {
    throw new DataValidationError("Página de extrato inválida.");
  }
  return parseStudentCard(await request("card", page));
}

/** Keeps already hydrated in-memory media/extracts while a new summary arrives. */
export function mergeStudentCardSummary(
  current: StudentCard | null,
  summary: StudentCard,
): StudentCard {
  if (!current) return summary;
  return {
    ...current,
    name: summary.name ?? current.name,
    course: summary.course ?? current.course,
    active: summary.active ?? current.active,
    cardLast4: summary.cardLast4 ?? current.cardLast4,
    barcodeValue: summary.barcodeValue ?? current.barcodeValue,
    version: summary.version ?? current.version,
    ruBalance: summary.ruBalance ?? current.ruBalance,
    canteenBalance: summary.canteenBalance ?? current.canteenBalance,
  };
}

export function parseStudentCard(value: unknown): StudentCard {
  const item = object(value, "cartão");
  const photoDataUrl = optionalPhoto(item.photoDataUrl);
  const photoStatus = optionalPhotoStatus(item.photoStatus, photoDataUrl);
  const photoWidth = optionalPhotoDimension(item.photoWidth);
  const photoHeight = optionalPhotoDimension(item.photoHeight);
  const photoVariant = optionalPhotoVariant(item.photoVariant);
  const hasPhotoMetadata = photoWidth !== null && photoHeight !== null && photoVariant !== null;
  if (Boolean(photoDataUrl) !== hasPhotoMetadata) {
    throw new DataValidationError("Metadados da foto são inconsistentes.");
  }
  return {
    name: optionalString(item.name, 300),
    course: optionalString(item.course, 300),
    active: optionalString(item.active, 80),
    cardLast4: optionalCardLast4(item.cardLast4),
    barcodeValue: optionalBarcodeValue(item.barcodeValue),
    version: optionalString(item.version, 60),
    ruBalance: optionalMoney(item.ruBalance),
    canteenBalance: optionalMoney(item.canteenBalance),
    photoDataUrl,
    photoStatus,
    photoWidth,
    photoHeight,
    photoVariant,
    page: optionalPage(item.page),
    ruTransactions: parseTransactions(item.ruTransactions, "RU"),
    canteenTransactions: parseTransactions(item.canteenTransactions, "Cantina"),
  };
}

function optionalPhotoDimension(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 10000) {
    throw new DataValidationError("Dimensão da foto inválida.");
  }
  return parsed;
}

function optionalPhotoVariant(value: unknown): PhotoVariant | null {
  if (value === null || value === undefined || value === "") return null;
  const allowed: PhotoVariant[] = ["original", "2048", "1024", "portal"];
  if (typeof value !== "string" || !allowed.includes(value as PhotoVariant)) {
    throw new DataValidationError("Origem da foto inválida.");
  }
  return value as PhotoVariant;
}

function optionalPhotoStatus(value: unknown, photo: unknown): PhotoStatus {
  if (value === null || value === undefined || value === "") {
    return typeof photo === "string" && photo ? "ok" : "not-found";
  }
  const allowed: PhotoStatus[] = [
    "ok", "not-found", "invalid-url", "http-error", "too-large",
    "invalid-image", "read-error", "render-error", "not-requested",
  ];
  if (typeof value !== "string" || !allowed.includes(value as PhotoStatus)) {
    throw new DataValidationError("Status da foto inválido.");
  }
  const status = value as PhotoStatus;
  if ((status === "ok") !== Boolean(photo)) {
    throw new DataValidationError("Foto e status são inconsistentes.");
  }
  return status;
}

function optionalPage(value: unknown): number {
  if (value === null || value === undefined || value === "") return 1;
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 50) {
    throw new DataValidationError("Página de extrato inválida.");
  }
  return parsed;
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

function optionalBarcodeValue(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || !/^\d{6,24}$/.test(value)) {
    throw new DataValidationError("Código de barras do cartão inválido.");
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
