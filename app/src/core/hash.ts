import { sha256hex } from "./sha256";


export function pyStr(v: unknown): string {
  if (v === null || v === undefined) return "None";
  if (v === true) return "True";
  if (v === false) return "False";
  return String(v);
}


export function h(v: unknown): string {
  return sha256hex(pyStr(v)).slice(0, 16);
}
