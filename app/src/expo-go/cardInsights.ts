import type { CardTransaction } from "./card";

export type SpendingSource = "ru" | "canteen";

export const CANTEEN_MEAL_CENTS = 200;

export interface CardSpendingInsight {
  balanceCents: number | null;
  typicalCents: number | null;
  estimatedUses: number | null;
  exactTopUpCents: number | null;
  usesAfterTopUp: number | null;
  sampleSize: number;
}


export function buildSpendingInsight(
  balance: string | null | undefined,
  transactions: CardTransaction[],
  source: SpendingSource,
): CardSpendingInsight {
  const balanceCents = parseMoneyCents(balance);
  const debits = transactions
    .filter((item) => !isCredit(item))
    .map((item) => parseMoneyCents(item.value))
    .filter((value): value is number => value !== null && value > 0);
  const typicalCents = source === "ru" ? mode(debits) : CANTEEN_MEAL_CENTS;
  if (balanceCents === null || typicalCents === null) {
    return {
      balanceCents,
      typicalCents,
      estimatedUses: null,
      exactTopUpCents: null,
      usesAfterTopUp: null,
      sampleSize: debits.length,
    };
  }
  const estimatedUses = Math.floor(balanceCents / typicalCents);
  const remainder = balanceCents % typicalCents;
  const exactTopUpCents = remainder === 0 ? 0 : typicalCents - remainder;
  return {
    balanceCents,
    typicalCents,
    estimatedUses,
    exactTopUpCents,
    usesAfterTopUp: Math.floor((balanceCents + exactTopUpCents) / typicalCents),
    sampleSize: debits.length,
  };
}

export function parseMoneyCents(value: string | null | undefined): number | null {
  if (!value) return null;
  const compact = value.replace(/[\sR$−–—]/g, "").replace(/[^0-9,.-]/g, "");
  if (!/[0-9]/.test(compact)) return null;
  const decimalComma = compact.lastIndexOf(",") > compact.lastIndexOf(".");
  const normalized = decimalComma
    ? compact.replace(/\./g, "").replace(",", ".")
    : compact.replace(/,/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? Math.round(Math.abs(parsed) * 100) : null;
}

export function formatMoneyCents(value: number | null): string {
  return value === null
    ? "—"
    : (value / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function isCredit(item: CardTransaction): boolean {
  const text = `${item.type} ${item.merchant}`.toLocaleLowerCase("pt-BR");
  return /^\s*\+/.test(item.value) || /recarga|cr[eé]dito|entrada|estorno|devolu/.test(text);
}

function mode(values: number[]): number | null {
  if (!values.length) return null;
  const counts = new Map<number, number>();
  let best = values[0];
  let bestCount = 0;
  for (const value of values) {
    const count = (counts.get(value) ?? 0) + 1;
    counts.set(value, count);
    if (count > bestCount) {
      best = value;
      bestCount = count;
    }
  }
  return best;
}
