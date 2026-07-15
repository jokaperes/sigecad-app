import type { Periodo } from "../core/client";
import type { Notas, Turma } from "../core/types";

export class DataValidationError extends Error {}

type JsonObject = Record<string, unknown>;

export function parsePeriodos(value: unknown): Periodo[] {
  const rows = limitedArray(value, 100, "períodos");
  return rows.map((row, index) => {
    const item = object(row, `período ${index + 1}`);
    const id = positiveInteger(item.id, "ID do período");
    const fallbackName = [item.ano, item.semestre].filter(isPrimitive).join("/");
    const name = item.nome ?? item.descricao ?? (fallbackName || `Período ${id}`);
    return {
      id,
      nome: shortString(name, "nome do período"),
      data_inicio: optionalDate(item.data_inicio),
      data_fim: optionalDate(item.data_fim),
    };
  });
}

export function parseTurmas(value: unknown): Turma[] {
  const rows = limitedArray(value, 200, "turmas");
  return rows.map((row, index) => {
    const item = object(row, `turma ${index + 1}`);
    const hasGrades = Boolean(item.tem_notas);
    const enrollment = positiveInteger(item.matricula_id, "matrícula da turma");
    return {
      id: positiveInteger(item.id, "ID da turma"),
      matricula_id: enrollment,
      codigo: shortString(item.codigo, "código da turma"),
      turma: shortString(item.turma, "identificador da turma"),
      disciplina: shortString(item.disciplina, "disciplina"),
      resultado: nullableString(item.resultado, "resultado"),
      faltas: nullableNumber(item.faltas, "faltas"),
      limite_faltas: nullableNumber(item.limite_faltas, "limite de faltas"),
      tem_notas: hasGrades,
    };
  });
}

export function parseNotas(value: unknown): Notas {
  const root = object(value, "resposta de notas");
  const rows = limitedArray(root.notas ?? [], 100, "avaliações");
  return {
    notas: rows.map((row, index) => {
      const item = object(row, `avaliação ${index + 1}`);
      const rawValue = item.valor;
      if (
        rawValue !== null && rawValue !== undefined &&
        typeof rawValue !== "number" && typeof rawValue !== "string"
      ) {
        throw new DataValidationError("Valor de avaliação inválido.");
      }
      if (typeof rawValue === "string" && rawValue.length > 100) {
        throw new DataValidationError("Valor de avaliação excede o limite.");
      }
      return {
        nome: shortString(item.nome ?? "Avaliação", "nome da avaliação"),
        valor: rawValue ?? null,
        publicar: item.publicar === true || item.publicar === 1,
      };
    }),
  };
}

function limitedArray(value: unknown, max: number, label: string): unknown[] {
  if (!Array.isArray(value) || value.length > max) {
    throw new DataValidationError(`Formato inválido para ${label}.`);
  }
  return value;
}

function object(value: unknown, label: string): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new DataValidationError(`Formato inválido para ${label}.`);
  }
  return value as JsonObject;
}

function positiveInteger(value: unknown, label: string): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new DataValidationError(`${label} inválido.`);
  }
  return parsed;
}

function nullableNumber(value: unknown, label: string): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new DataValidationError(`${label} inválido.`);
  }
  return parsed;
}

function shortString(value: unknown, label: string): string {
  if (typeof value !== "string" && typeof value !== "number") {
    throw new DataValidationError(`${label} inválido.`);
  }
  const parsed = String(value).trim();
  if (!parsed || parsed.length > 300 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(parsed)) {
    throw new DataValidationError(`${label} inválido.`);
  }
  return parsed;
}

function nullableString(value: unknown, label: string): string | null {
  if (value === null || value === undefined || value === "") return null;
  return shortString(value, label);
}

function optionalDate(value: unknown): string | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  const parsed = shortString(value, "data do período");
  return /^\d{4}-\d{2}-\d{2}/.test(parsed) ? parsed.slice(0, 10) : undefined;
}

function isPrimitive(value: unknown): value is string | number {
  return typeof value === "string" || typeof value === "number";
}
