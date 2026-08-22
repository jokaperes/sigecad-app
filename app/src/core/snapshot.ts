import { h, pyStr } from "./hash";
import { sha256hex } from "./sha256";
import type { Items, Labels, Notas, Turma } from "./types";


export function turmaCode(t: Pick<Turma, "codigo" | "turma">): string {
  return `${t.codigo}::${t.turma}`;
}


export function buildSnapshot(
  turmas: Turma[],
  notasByMatricula: Record<number, Notas>,
): { items: Items; labels: Labels } {
  const items: Items = {};
  const labels: Labels = {};
  for (const t of turmas) {
    const base = turmaCode(t);
    const label = `${t.disciplina} (${t.turma})`;

    items[`${base}::resultado`] = { hash: h(t.resultado ?? null), publicar: null };
    labels[`${base}::resultado`] = `${label} — resultado`;

    items[`${base}::faltas`] = { hash: h(t.faltas ?? null), publicar: null };
    labels[`${base}::faltas`] = `${label} — faltas`;

    if (t.tem_notas) {
      const n = notasByMatricula[t.matricula_id];
      for (const av of n?.notas ?? []) {
        const key = `${base}::${av.nome}`;
        items[key] = {
          hash: h(`${pyStr(av.valor)}|${pyStr(av.publicar)}`),
          publicar: av.publicar ? 1 : 0,
        };
        labels[key] = `${label} — ${av.nome}`;
      }
    }
  }
  return { items, labels };
}


export function turmaGradeItems(
  items: Items,
  labels: Labels,
  code: string,
): { items: Items; labels: Labels } {
  const sub: Items = {};
  const lab: Labels = {};
  const prefix = code + "::";
  for (const [k, v] of Object.entries(items)) {
    if (
      k.startsWith(prefix) &&
      !(k.endsWith("::faltas") || k.endsWith("::resultado"))
    ) {
      const pub = v.publicar;
      sub[k] = { hash: h(pub), publicar: pub };
      lab[k] = labels[k];
    }
  }
  return { items: sub, labels: lab };
}


export function turmaCodesOf(items: Items): string[] {
  const set = new Set<string>();
  for (const key of Object.keys(items)) {
    const parts = key.split("::");
    if (parts.length >= 3) set.add(`${parts[0]}::${parts[1]}`);
  }
  return [...set];
}


export function stateHash(items: Items): string {
  const parts = Object.keys(items)
    .sort()
    .map((k) => `${k}=${items[k].hash}`);
  return sha256hex(parts.join(";"));
}
