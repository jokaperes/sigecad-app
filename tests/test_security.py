import hmac
import json
import os
import stat
import tempfile
import unittest

import sigecad


class SecurityTests(unittest.TestCase):
    def test_hmac_rfc4231(self):
        digest = hmac.new(b"\x0b" * 20, b"Hi There", "sha256").hexdigest()
        self.assertEqual(
            digest,
            "b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7",
        )

    def test_state_nao_guarda_rotulo_nem_codigo(self):
        with tempfile.TemporaryDirectory() as directory:
            path = os.path.join(directory, "state.json")
            items = {"07008721::P1::A1": {"hash": "abc", "publicar": 1}}
            labels = {"07008721::P1::A1": "ANÁLISE (P1) — A1"}
            sigecad.save_state(items, labels, path)
            with open(path, encoding="utf-8") as handle:
                raw = handle.read()
            data = json.loads(raw)
            self.assertEqual(data["v"], 2)
            self.assertNotIn("labels", data)
            self.assertNotIn("ANÁLISE", raw)
            self.assertNotIn("07008721", raw)
            self.assertNotIn("9.5", raw)
            self.assertEqual(stat.S_IMODE(os.stat(path).st_mode), 0o600)
            self.assertEqual(stat.S_IMODE(os.stat(os.path.join(directory, ".hmac-key")).st_mode), 0o600)

    def test_diff_selado_detecta_mudanca_sem_reverter_nota(self):
        key = b"k" * 32
        first = {"07008721::P1::A1": {"hash": sigecad._h("8.0|True"), "publicar": 1}}
        second = {"07008721::P1::A1": {"hash": sigecad._h("9.5|True"), "publicar": 1}}
        labels = {"07008721::P1::A1": "ANÁLISE (P1) — A1"}
        sealed = sigecad._seal_items(first, key)
        events = sigecad.diff_sealed(sealed, second, labels, key)
        self.assertTrue(any("Nota alterada" in event for event in events))
        blob = json.dumps(sealed)
        self.assertNotIn("9.5", blob)
        self.assertNotIn("8.0", blob)
        self.assertNotIn("07008721", blob)

    def test_load_descarta_estado_com_rotulos(self):
        with tempfile.TemporaryDirectory() as directory:
            path = os.path.join(directory, "state.json")
            with open(path, "w", encoding="utf-8") as handle:
                json.dump({"items": {"a": {"hash": "x"}}, "labels": {"a": "segredo"}}, handle)
            self.assertIsNone(sigecad.load_state(path))
