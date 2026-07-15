import { h, pyStr } from "./hash";
import { sha256hex } from "./sha256";
import type { Items, Labels, Notas, Turma } from "./types";

/** Identidade estável de uma turma: 'codigo::turma'. Espelha `turma_code`. */
export function turmaCode(t: Pick<Turma, "codigo" | "turma">): string {
  return `${t.codigo}::${t.turma}`;
}

/**
 * Implementação CANÔNICA do snapshot (espelha `snapshot` de sigecad.py).
 * Recebe as turmas e um mapa matricula_id -> /rest/notas já coletados (o poll
 * fica separado em client.ts pra manter isto puro/testável).
 * key = 'codigo::turma::campo', campo em {resultado, faltas, A1, A2, ...}.
 */
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

/**
 * Recorta as avaliações de UMA turma para o modelo sentinela. Rehasheia usando
 * SÓ `publicar` (fato turma-wide) — o valor da nota é pessoal do sentinela, e
 * incluí-lo dispararia "Nota alterada" falso a cada troca de sentinela.
 * Espelha `turma_grade_items` de sigecad.py.
 */
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

/** 'codigo::turma::campo' -> lista de 'codigo::turma' distintas no snapshot. */
export function turmaCodesOf(items: Items): string[] {
  const set = new Set<string>();
  for (const key of Object.keys(items)) {
    const parts = key.split("::");
    if (parts.length >= 3) set.add(`${parts[0]}::${parts[1]}`);
  }
  return [...set];
}

/**
 * Digest canônico de um conjunto de items (chaves ordenadas). O device manda
 * este `stateHash` ao servidor: o quórum concorda por igualdade de string, sem
 * precisar duplicar a lógica de `diff` no backend. Não expõe nota (é hash de hash).
 */
export function stateHash(items: Items): string {
  const parts = Object.keys(items)
    .sort()
    .map((k) => `${k}=${items[k].hash}`);
  return sha256hex(parts.join(";"));
}
