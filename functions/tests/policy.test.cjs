const test = require("node:test");
const assert = require("node:assert/strict");
const {
  effectiveQuorum,
  normalizeEmail,
  normalizeEvents,
  normalizeTurmaCodes,
  positiveInteger,
  reportId,
} = require("../lib/policy.js");

test("normaliza e deduplica turmas", () => {
  assert.deepEqual(normalizeTurmaCodes([" COD::T1 ", "COD::T1"]), ["COD::T1"]);
  assert.throws(() => normalizeTurmaCodes(["../segredo::T1"]));
  assert.throws(() => normalizeTurmaCodes(["SEM-TURMA"]));
});

test("valida eventos reportados", () => {
  assert.deepEqual(normalizeEvents([" Nota publicada "]), ["Nota publicada"]);
  assert.throws(() => normalizeEvents([]));
  assert.throws(() => normalizeEvents(["x".repeat(241)]));
});

test("normaliza email opcional", () => {
  assert.equal(normalizeEmail(null), null);
  assert.equal(normalizeEmail(" aluno@example.com "), "aluno@example.com");
  assert.throws(() => normalizeEmail("sem-arroba"));
});

test("quorum cai para devices realmente elegiveis", () => {
  assert.equal(effectiveQuorum(2, 5), 2);
  assert.equal(effectiveQuorum(2, 1), 1);
  assert.equal(effectiveQuorum(2, 0), 1);
});

test("config e ids sao deterministas", () => {
  assert.equal(positiveInteger("0", 2), 2);
  assert.equal(positiveInteger("3", 2), 3);
  assert.equal(reportId("COD::T1", "uid"), reportId("COD::T1", "uid"));
  assert.equal(reportId("COD::T1", "uid").length, 64);
});
