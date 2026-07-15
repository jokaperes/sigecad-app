import { sha256hex } from "./sha256";

/**
 * Reproduz o `str(v)` do Python para os tipos que aparecem no snapshot,
 * garantindo que o hash bata com `sigecad._h`:
 *   None -> "None", True -> "True", False -> "False", resto -> String(v).
 */
export function pyStr(v: unknown): string {
  if (v === null || v === undefined) return "None";
  if (v === true) return "True";
  if (v === false) return "False";
  return String(v);
}

/** Espelha `_h(v)` de sigecad.py: sha256(str(v))[:16]. */
export function h(v: unknown): string {
  return sha256hex(pyStr(v)).slice(0, 16);
}
