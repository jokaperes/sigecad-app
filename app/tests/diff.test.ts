/**
 * Port de tests/test_diff.py (Python) → TS. Roda com:
 *   npx tsx app/tests/diff.test.ts
 * Verifica paridade comportamental do core portado com sigecad.py.
 */
import { diff } from "../src/core/diff";
import { h } from "../src/core/hash";
import { turmaGradeItems } from "../src/core/snapshot";
import type { Items, Labels, Publicar } from "../src/core/types";
import { SigecadClient } from "../src/core/client";
import { sha256hex } from "../src/core/sha256";

const item = (hash: string, publicar: Publicar = null) => ({ hash, publicar });

const LABELS: Labels = {
  "07008721::P1::A1": "ANÁLISE (P1) — A1",
  "07008721::P1::A2": "ANÁLISE (P1) — A2",
  "07008721::P1::faltas": "ANÁLISE (P1) — faltas",
  "07008721::P1::resultado": "ANÁLISE (P1) — resultado",
};

let fails = 0;
function check(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ok   ${name}`);
  } catch (e) {
    fails++;
    console.log(`  FAIL ${name}: ${(e as Error).message}`);
  }
}
function assert(cond: unknown, msg = "assert falhou") {
  if (!cond) throw new Error(msg);
}

check("baseline_sem_eventos", () => {
  const next: Items = {
    "07008721::P1::faltas": item("a"),
    "07008721::P1::resultado": item("b"),
  };
  assert(diff({}, next, LABELS).length === 0);
});

check("nova_avaliacao", () => {
  const ev = diff({}, { "07008721::P1::A1": item("x", 0) }, LABELS);
  assert(ev.length === 1 && ev[0].includes("Nova avaliação"), JSON.stringify(ev));
});

check("nota_publicada", () => {
  const old: Items = { "07008721::P1::A1": item("x", 0) };
  const next: Items = { "07008721::P1::A1": item("y", 1) };
  const ev = diff(old, next, LABELS);
  assert(ev.some((e) => e.includes("NOTA PUBLICADA")), JSON.stringify(ev));
});

check("nota_alterada_ja_publicada", () => {
  const old: Items = { "07008721::P1::A1": item("x", 1) };
  const next: Items = { "07008721::P1::A1": item("z", 1) };
  const ev = diff(old, next, LABELS);
  assert(ev.some((e) => e.includes("Nota alterada")), JSON.stringify(ev));
});

check("faltas_e_resultado", () => {
  const old: Items = {
    "07008721::P1::faltas": item("a"),
    "07008721::P1::resultado": item("b"),
  };
  const next: Items = {
    "07008721::P1::faltas": item("a2"),
    "07008721::P1::resultado": item("b2"),
  };
  const ev = diff(old, next, LABELS);
  assert(ev.some((e) => e.includes("Faltas atualizadas")), JSON.stringify(ev));
  assert(ev.some((e) => e.includes("Resultado alterado")), JSON.stringify(ev));
});

check("sem_mudanca", () => {
  const snap: Items = { "07008721::P1::A1": item("x", 1) };
  assert(diff(snap, { ...snap }, LABELS).length === 0);
});

check("sentinela_rotacao_nao_gera_falso_positivo", () => {
  const labels: Labels = { "07008721::T1::A1": "X (T1) — A1" };
  const itemsA: Items = { "07008721::T1::A1": item(h("8.0|True"), 1) };
  const itemsB: Items = { "07008721::T1::A1": item(h("6.0|True"), 1) };
  const { items: subA, labels: labA } = turmaGradeItems(itemsA, labels, "07008721::T1");
  const { items: subB } = turmaGradeItems(itemsB, labels, "07008721::T1");
  assert(diff(subA, subB, labA).length === 0, "troca de sentinela gerou evento");
});

check("sentinela_detecta_publicacao", () => {
  const labels: Labels = { "07008721::T1::A1": "X (T1) — A1" };
  const antes: Items = { "07008721::T1::A1": item(h("None|False"), 0) };
  const depois: Items = { "07008721::T1::A1": item(h("6.0|True"), 1) };
  const { items: sub0, labels: lab0 } = turmaGradeItems(antes, labels, "07008721::T1");
  const { items: sub1 } = turmaGradeItems(depois, labels, "07008721::T1");
  const ev = diff(sub0, sub1, lab0);
  assert(ev.some((e) => e.includes("NOTA PUBLICADA")), JSON.stringify(ev));
});

check("hash_nao_expoe_valor", () => {
  const digest = h("9.5|True");
  assert(!digest.includes("9.5") && digest.length === 16, digest);
});

check("rejeita_cookie_injetado", () => {
  let rejected = false;
  try { new SigecadClient("OTHER=value"); } catch { rejected = true; }
  assert(rejected, "aceitou cookie de outro tipo");
});

check("sha256_vetor_conhecido", () => {
  assert(
    sha256hex("abc") === "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    "sha256 incompatível",
  );
});

const total = 11;
console.log(`\n${total - fails}/${total} passaram`);
process.exit(fails ? 1 : 0);
