import contextlib
import io
import json
import os
import stat
import sys
import tempfile
import unittest
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import sigecad
from server import store
from server import crypto
from server import register


def item(hash_value, publicar=None):
    return {"hash": hash_value, "publicar": publicar}


LABELS = {
    "07008721::P1::A1": "ANÁLISE (P1) — A1",
    "07008721::P1::A2": "ANÁLISE (P1) — A2",
    "07008721::P1::faltas": "ANÁLISE (P1) — faltas",
    "07008721::P1::resultado": "ANÁLISE (P1) — resultado",
}


class DiffTests(unittest.TestCase):
    def test_baseline_sem_eventos(self):
        new = {"07008721::P1::faltas": item("a"), "07008721::P1::resultado": item("b")}
        self.assertEqual(sigecad.diff({}, new, LABELS), [])

    def test_nova_avaliacao(self):
        events = sigecad.diff({}, {"07008721::P1::A1": item("x", 0)}, LABELS)
        self.assertEqual(len(events), 1)
        self.assertIn("Nova avaliação", events[0])

    def test_nota_publicada(self):
        old = {"07008721::P1::A1": item("x", 0)}
        new = {"07008721::P1::A1": item("y", 1)}
        self.assertTrue(any("NOTA PUBLICADA" in e for e in sigecad.diff(old, new, LABELS)))

    def test_nota_alterada_ja_publicada(self):
        old = {"07008721::P1::A1": item("x", 1)}
        new = {"07008721::P1::A1": item("z", 1)}
        self.assertTrue(any("Nota alterada" in e for e in sigecad.diff(old, new, LABELS)))

    def test_faltas_e_resultado(self):
        old = {"07008721::P1::faltas": item("a"), "07008721::P1::resultado": item("b")}
        new = {"07008721::P1::faltas": item("a2"), "07008721::P1::resultado": item("b2")}
        events = sigecad.diff(old, new, LABELS)
        self.assertTrue(any("Faltas atualizadas" in e for e in events))
        self.assertTrue(any("Resultado alterado" in e for e in events))

    def test_sem_mudanca(self):
        snapshot = {"07008721::P1::A1": item("x", 1)}
        self.assertEqual(sigecad.diff(snapshot, dict(snapshot), LABELS), [])

    def test_sentinela_rotacao_nao_gera_falso_positivo(self):
        labels = {"07008721::T1::A1": "X (T1) — A1"}
        a = {"07008721::T1::A1": item(sigecad._h("8.0|True"), 1)}
        b = {"07008721::T1::A1": item(sigecad._h("6.0|True"), 1)}
        sub_a, lab_a = sigecad.turma_grade_items(a, labels, "07008721::T1")
        sub_b, _ = sigecad.turma_grade_items(b, labels, "07008721::T1")
        self.assertEqual(sigecad.diff(sub_a, sub_b, lab_a), [])

    def test_sentinela_detecta_publicacao(self):
        labels = {"07008721::T1::A1": "X (T1) — A1"}
        before = {"07008721::T1::A1": item(sigecad._h("None|False"), 0)}
        after = {"07008721::T1::A1": item(sigecad._h("6.0|True"), 1)}
        sub_before, lab = sigecad.turma_grade_items(before, labels, "07008721::T1")
        sub_after, _ = sigecad.turma_grade_items(after, labels, "07008721::T1")
        self.assertTrue(any("NOTA PUBLICADA" in e for e in sigecad.diff(sub_before, sub_after, lab)))

    def test_hash_nao_expoe_valor(self):
        digest = sigecad._h("9.5|True")
        self.assertNotIn("9.5", digest)
        self.assertEqual(len(digest), 16)


class RobustnessTests(unittest.TestCase):
    def test_periodos_vazios_tem_erro_claro(self):
        class EmptyClient:
            def periodos(self):
                return []
        with self.assertRaisesRegex(RuntimeError, "nenhum período"):
            sigecad.current_period(EmptyClient())

    def test_periodo_aceita_datas_nulas(self):
        class NullDateClient:
            def periodos(self):
                return [{"id": 1, "data_inicio": None, "data_fim": None}]
        self.assertEqual(sigecad.current_period(NullDateClient())["id"], 1)

    def test_json_invalido_vira_erro_controlado(self):
        client = object.__new__(sigecad.Client)
        client.get_bytes = lambda path, retries=2: b"<html>indisponivel</html>"
        with self.assertRaises(sigecad.PortalResponseError):
            client.get("/rest/periodosletivos")

    def test_rejeita_cookie_injetado(self):
        with self.assertRaises(ValueError):
            sigecad.Client("OTHER=value")
        with self.assertRaises(ValueError):
            sigecad.Client("UFGDNET=ok; OTHER=bad")

    def test_redirect_de_auth_nao_vaza_destino(self):
        handler = sigecad._NoRedirect()
        request = urllib.request.Request("https://example.invalid")
        with self.assertRaises(sigecad.AuthError) as caught:
            handler.redirect_request(
                request,
                None,
                302,
                "Found",
                {},
                "https://login.invalid/?ticket=segredo",
            )
        self.assertNotIn("ticket", str(caught.exception))
        self.assertNotIn("segredo", str(caught.exception))

    def test_save_state_atomico_e_privado(self):
        with tempfile.TemporaryDirectory() as directory:
            path = os.path.join(directory, "state.json")
            sigecad.save_state({"07008721::P1::A1": item("hash")}, {"07008721::P1::A1": "label"}, path)
            with open(path, encoding="utf-8") as handle:
                raw = handle.read()
            data = json.loads(raw)
            self.assertEqual(data["v"], 2)
            self.assertNotIn("labels", data)
            self.assertNotIn("label", raw)
            self.assertNotIn("07008721", raw)
            self.assertEqual(len(next(iter(data["items"].keys()))), 64)
            self.assertEqual(stat.S_IMODE(os.stat(path).st_mode), 0o600)

    def test_sqlite_remove_chaves_antigas(self):
        with tempfile.TemporaryDirectory() as directory:
            old_path = store.DB_PATH
            store.DB_PATH = os.path.join(directory, "test.db")
            try:
                store.init_db()
                uid = store.add_user("teste@example.com", "blob")
                store.save_snapshot(uid, {"a": item("1"), "b": item("2")})
                store.save_snapshot(uid, {"b": item("3")})
                self.assertEqual(store.get_snapshot(uid), {"b": item("3")})
                store.save_turma_snapshot("COD::T1", {"a": item("1"), "b": item("2")})
                store.save_turma_snapshot("COD::T1", {"a": item("4")})
                self.assertEqual(store.get_turma_snapshot("COD::T1"), {"a": item("4")})
            finally:
                store.DB_PATH = old_path

    def test_sqlite_privado_e_recadastro_zera_falhas(self):
        with tempfile.TemporaryDirectory() as directory:
            old_path = store.DB_PATH
            store.DB_PATH = os.path.join(directory, "nested", "test.db")
            try:
                store.init_db()
                uid = store.add_user("teste@example.com", "blob-1")
                store.record_failure(uid)
                store.add_user("teste@example.com", "blob-2")
                with store.connect() as con:
                    row = con.execute(
                        "SELECT enc_blob, status, fail_count FROM tokens WHERE user_id=?",
                        (uid,),
                    ).fetchone()
                self.assertEqual(dict(row), {
                    "enc_blob": "blob-2",
                    "status": "ok",
                    "fail_count": 0,
                })
                self.assertEqual(stat.S_IMODE(os.stat(store.DB_PATH).st_mode), 0o600)
            finally:
                store.DB_PATH = old_path

    def test_crypto_rejeita_blob_malformado_sem_detalhes_internos(self):
        with self.assertRaisesRegex(RuntimeError, "malformado"):
            crypto.decrypt_token("v1|nao-base64")

    def test_cli_valida_argumentos(self):
        with contextlib.redirect_stderr(io.StringIO()):
            with self.assertRaises(SystemExit):
                sigecad._parse_args(["--photo-out", "/tmp/foto.jpg"])
        args = sigecad._parse_args(["--show-grades", "--period", "222"])
        self.assertTrue(args.show_grades)
        self.assertEqual(args.period, 222)

    def test_cadastro_valida_email(self):
        self.assertEqual(register._valid_email(" aluno@example.com "), "aluno@example.com")
        with self.assertRaises(Exception):
            register._valid_email("sem-arroba")

    def test_grade_report_retorna_valores_sem_persistir(self):
        class FakeClient:
            def periodos(self):
                return [{"id": 222, "descricao": "2026 - 1"}]
            def turmas(self, period_id):
                self.period_id = period_id
                return [{
                    "codigo": "COD", "disciplina": "Teste", "turma": "T1",
                    "matricula_id": 7, "resultado": "AP", "faltas": 2,
                    "limite_faltas": 18, "tem_notas": True,
                }]
            def notas(self, matricula_id):
                self.matricula_id = matricula_id
                return {"notas": [{"nome": "P1", "valor": "8.50", "publicar": True}]}

        fake = FakeClient()
        period, classes = sigecad.grade_report(fake)
        self.assertEqual(period["id"], 222)
        self.assertEqual(classes[0]["avaliacoes"][0]["valor"], "8.50")
        self.assertEqual(fake.matricula_id, 7)

    def test_card_report_mascara_saida_e_salva_foto_privada(self):
        class FakeCardClient:
            person = '''
                <img src="https://cartao.app.ufgd.edu.br/foto/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/150/200">
                <a href="/cartoes_usuario/visualiza_estatus/71593/ABCDEF1234">cartão</a>
            '''
            status = '''
                <legend>Cartão: <span title="Número do cartão">1234567890 (Via 1)</span></legend>
                <label>Nome: </label><div><span>ALUNO TESTE</span></div>
                <label>Curso: </label><div><span>ENGENHARIA &amp; COMPUTAÇÃO</span></div>
                <label>Ativo: </label><div><span>Sim</span></div>
            '''

            def get_text(self, path):
                if path.endswith("visualiza_pessoa"):
                    return self.person
                if "visualiza_estatus" in path:
                    return self.status
                if "extrato_ru" in path:
                    return "Saldo atual: R$&nbsp;5.80"
                return "Saldo atual: R$&nbsp;4.00"

            def get_bytes(self, path):
                return b"\xff\xd8\xfffake-jpeg"

        with tempfile.TemporaryDirectory() as directory:
            photo = os.path.join(directory, "foto.jpg")
            report = sigecad.card_report(FakeCardClient(), photo)
            self.assertEqual(report["cartao"], "1234567890")
            self.assertEqual(report["saldo_ru"], "R$ 5,80")
            self.assertEqual(report["saldo_cantina"], "R$ 4,00")
            self.assertEqual(report["curso"], "ENGENHARIA & COMPUTAÇÃO")
            self.assertEqual(stat.S_IMODE(os.stat(photo).st_mode), 0o600)

    def test_saldo_com_milhar_brasileiro(self):
        self.assertEqual(sigecad._balance("Saldo atual: R$ 1.234,56"), "R$ 1.234,56")

    def test_portal_error_nao_expoe_url(self):
        error = __import__("urllib.error").error.HTTPError(
            "https://example.invalid/segredo", 503, "down", {}, None
        )
        message = sigecad.portal_error(error, "CARTÃO")
        self.assertIn("HTTP 503", message)
        self.assertNotIn("segredo", message)


if __name__ == "__main__":
    unittest.main(verbosity=2)
