#!/usr/bin/env python3
"""
Worker sentinela do notificador de notas UFGD (SIGECAD).
Core reutilizavel: token -> turmas -> notas -> snapshot(hash) -> diff -> eventos.

Uso:
    export SIGECAD_TOKEN='UFGDNET=....'
    python3 sigecad.py
    python3 sigecad.py --period 222
    python3 sigecad.py --show-card --photo-out /tmp/minha-foto.jpg

Nao guarda a nota real: o snapshot persistido usa hash por avaliacao.
O token vem do ambiente, nunca hardcoded/commitado.
"""
import argparse
import gzip
import hashlib
import hmac
import html
import json
import os
import random
import re
import secrets
import ssl
import sys
import tempfile
import time
import urllib.error
import urllib.request
from datetime import datetime, date

BASE = "https://sigecad-academico.app.ufgd.edu.br"
CARD_BASE = "https://cartao.app.ufgd.edu.br"
_STATE_DIR = os.environ.get("STATE_DIR", os.path.dirname(os.path.abspath(__file__)))
STATE_FILE = os.path.join(_STATE_DIR, "state.json")

class AuthError(Exception):
    """Token invalido/expirado (302 -> login)."""

class PortalResponseError(RuntimeError):
    """O portal respondeu, mas o conteúdo não tem o formato esperado."""

class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise AuthError(f"HTTP {code}: sessão redirecionada ao login")

class Client:
    def __init__(self, token):
        if "=" not in token:
            token = "UFGDNET=" + token
        if not token.startswith("UFGDNET=") or any(c in token for c in ";\r\n"):
            raise ValueError("token deve ter o formato UFGDNET=<valor>")
        if not token.removeprefix("UFGDNET=").strip():
            raise ValueError("token UFGDNET vazio")
        self.token = token
        try:
            import certifi
            tls_context = ssl.create_default_context(cafile=certifi.where())
        except ImportError:
            tls_context = ssl.create_default_context()
        self._opener = urllib.request.build_opener(
            _NoRedirect,
            urllib.request.HTTPSHandler(context=tls_context),
        )
        self.base = BASE
        self.polite_delay = True

    def get_bytes(self, path, _retries=2):
        req = urllib.request.Request(
            self.base + path,
            headers={
                "Cookie": self.token,
                "Accept": "application/json, */*",
                "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
                "Accept-Encoding": "gzip, identity",
                "User-Agent": "sigecad-notifier/0.1",
            },
        )
        try:
            r = self._opener.open(req, timeout=30)
        except urllib.error.HTTPError as e:
            if e.code in (301, 302, 303, 307, 308):
                raise AuthError(f"HTTP {e.code}")
            if e.code in (401, 403):
                raise AuthError(f"HTTP {e.code}")
            if e.code >= 500 and _retries > 0:
                time.sleep(1.5 * (3 - _retries))
                return self.get_bytes(path, _retries - 1)
            raise
        except urllib.error.URLError:
            if _retries > 0:
                time.sleep(1.5 * (3 - _retries))
                return self.get_bytes(path, _retries - 1)
            raise
        try:
            data = r.read()
            if r.headers.get("Content-Encoding") == "gzip":
                data = gzip.decompress(data)
            return data
        finally:
            r.close()

    def get(self, path, _retries=2):
        try:
            return json.loads(self.get_bytes(path, _retries).decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise PortalResponseError("o portal retornou JSON inválido") from exc

    def get_text(self, path, _retries=2):
        return self.get_bytes(path, _retries).decode("utf-8", errors="replace")

    def periodos(self):
        return self.get("/rest/periodosletivos")

    def turmas(self, period_id):
        return self.get(f"/rest/turmas?periodoLetivoID={int(period_id)}")

    def notas(self, matricula_id):
        return self.get(f"/rest/notas?matriculaID={int(matricula_id)}")

class CardClient(Client):
    """Cliente somente leitura do portal Cartão UFGD, usando o mesmo SSO."""

    def __init__(self, token):
        super().__init__(token)
        self.base = CARD_BASE

def _clean_html(value):
    value = re.sub(r"<[^>]+>", " ", value)
    return " ".join(html.unescape(value).split())

def _html_field(document, label):
    match = re.search(
        rf"<label[^>]*>\s*{re.escape(label)}\s*:?\s*</label>\s*"
        rf"<div[^>]*>\s*<span[^>]*>(.*?)</span>",
        document,
        re.IGNORECASE | re.DOTALL,
    )
    return _clean_html(match.group(1)) if match else None

def _balance(document):
    text = html.unescape(document)
    match = re.search(
        r"Saldo atual:\s*R\$[\s\xa0]*([0-9][0-9.,]*[.,][0-9]{2})",
        text,
        re.IGNORECASE,
    )
    if not match:
        return None
    value = match.group(1)
    if "," not in value:
        value = value.replace(".", ",")
    return f"R$ {value}"

def _save_private_file(path, data):
    directory = os.path.dirname(os.path.abspath(path))
    os.makedirs(directory, exist_ok=True)
    fd, temporary = tempfile.mkstemp(prefix=".sigecad-photo-", dir=directory)
    try:
        os.fchmod(fd, 0o600)
        with os.fdopen(fd, "wb") as handle:
            handle.write(data)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)
    except Exception:
        try:
            os.unlink(temporary)
        except FileNotFoundError:
            pass
        raise

def card_report(client, photo_out=None):
    """Lê somente os dados do cartão pertencente à sessão autenticada."""
    person = client.get_text("/cartoes_usuario/visualiza_pessoa")
    status_match = re.search(
        r'href=["\'](/cartoes_usuario/visualiza_estatus/(\d+)/([A-Fa-f0-9]+))["\']',
        person,
    )
    if not status_match:
        raise RuntimeError("nenhum cartão foi encontrado para esta conta")

    status_path, code, resource_hash = status_match.groups()
    status = client.get_text(status_path)
    ru = client.get_text(f"/cartoes_usuario/listagem_extrato_ru/{code}/{resource_hash}")
    canteen = client.get_text(f"/cartoes_usuario/listagem_extrato_cantina/{code}/{resource_hash}")

    card_match = re.search(
        r"Cartão:\s*<span[^>]*>(.*?)</span>", status, re.IGNORECASE | re.DOTALL
    )
    card_label = _clean_html(card_match.group(1)) if card_match else None
    number_match = re.search(r"\d{6,}", card_label or "")
    version_match = re.search(r"\((Via\s+\d+)\)", card_label or "", re.IGNORECASE)

    photo_match = re.search(
        r"(?:https://cartao\.app\.ufgd\.edu\.br)?(/foto/[A-Fa-f0-9]{32,})(?:/\d+/\d+)?",
        person,
    )
    saved_photo = None
    if photo_out:
        if not photo_match:
            raise RuntimeError("a conta não retornou uma foto")
        photo = client.get_bytes(photo_match.group(1))
        if not (photo.startswith(b"\xff\xd8\xff") or photo.startswith(b"\x89PNG\r\n\x1a\n")):
            raise RuntimeError("o portal não retornou uma imagem válida")
        _save_private_file(photo_out, photo)
        saved_photo = os.path.abspath(photo_out)

    return {
        "nome": _html_field(status, "Nome"),
        "curso": _html_field(status, "Curso"),
        "ativo": _html_field(status, "Ativo"),
        "cartao": number_match.group(0) if number_match else None,
        "via": version_match.group(1) if version_match else None,
        "saldo_ru": _balance(ru),
        "saldo_cantina": _balance(canteen),
        "foto": saved_photo,
    }

def print_card_report(client, photo_out=None):
    report = card_report(client, photo_out)
    number = report["cartao"]
    masked = f"••••••{number[-4:]}" if number else "—"
    print("CARTÃO UFGD")
    print(f"  Nome: {report['nome'] or '—'}")
    print(f"  Curso: {report['curso'] or '—'}")
    print(f"  Cartão: {masked} ({report['via'] or 'via não informada'})")
    print(f"  Cadastro ativo: {report['ativo'] or '—'}")
    print(f"  Saldo RU: {report['saldo_ru'] or 'não informado'}")
    print(f"  Saldo Cantina: {report['saldo_cantina'] or 'não informado'}")
    if report["foto"]:
        print(f"  Foto salva em: {report['foto']}")

def portal_error(error, portal):
    """Mensagem curta para falhas transitórias, sem vazar URL/token/HTML."""
    if isinstance(error, urllib.error.HTTPError):
        return f"[{portal}] portal indisponível (HTTP {error.code}); tente novamente mais tarde."
    return f"[{portal}] falha de rede; verifique sua conexão e tente novamente."

def current_period(client):
    ps = client.periodos()
    if not ps:
        raise RuntimeError("SIGECAD não retornou nenhum período letivo")
    today = date.today().isoformat()
    active = [
        p for p in ps
        if (p.get("data_inicio") or "") <= today <= (p.get("data_fim") or "9999-99-99")
    ]
    if active:
        return max(active, key=lambda p: p["id"])
    return max(ps, key=lambda p: p["id"])

def _h(v):
    return hashlib.sha256(str(v).encode()).hexdigest()[:16]

def _hmac_key_path(state_path=None):
    directory = os.path.dirname(os.path.abspath(state_path or STATE_FILE))
    return os.path.join(directory, ".hmac-key")

def _hmac_key(state_path=None):
    path = _hmac_key_path(state_path)
    if os.path.exists(path):
        with open(path, "rb") as handle:
            key = handle.read().strip()
        if len(key) >= 32:
            return key
    key = secrets.token_bytes(32)
    directory = os.path.dirname(os.path.abspath(path))
    os.makedirs(directory, exist_ok=True)
    fd, tmp = tempfile.mkstemp(prefix=".hmac-", dir=directory)
    try:
        os.fchmod(fd, 0o600)
        with os.fdopen(fd, "wb") as handle:
            handle.write(key)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(tmp, path)
        os.chmod(path, 0o600)
    except Exception:
        try:
            os.unlink(tmp)
        except FileNotFoundError:
            pass
        raise
    return key

def _seal_items(items, key=None, state_path=None):
    secret = key if key is not None else _hmac_key(state_path)
    sealed = {}
    for name, item in items.items():
        sealed_name = hmac.new(secret, f"k|{name}".encode(), hashlib.sha256).hexdigest()
        publicar = item.get("publicar")
        sealed[sealed_name] = {
            "hash": hmac.new(secret, f"v|{item['hash']}|{publicar}".encode(), hashlib.sha256).hexdigest(),
            "publicar": publicar,
        }
    return sealed

def diff_sealed(old_sealed, items, labels, key=None, state_path=None):
    secret = key if key is not None else _hmac_key(state_path)
    previous = old_sealed or {}
    comparable_old = {}
    comparable_new = _seal_items(items, secret)
    remapped_new = {}
    remapped_old = {}
    for name, item in items.items():
        sealed_name = hmac.new(secret, f"k|{name}".encode(), hashlib.sha256).hexdigest()
        remapped_new[name] = comparable_new[sealed_name]
        if sealed_name in previous:
            remapped_old[name] = previous[sealed_name]
    return diff(remapped_old, remapped_new, labels)

def turma_code(t):
    """Identidade estavel de uma turma: 'codigo::turma'."""
    return f"{t['codigo']}::{t['turma']}"

def snapshot(client, period_id=None):
    """
    Implementacao CANONICA (usada pelo self-host e pelo central).
    Retorna (items, labels):
      items[key]  = {"hash": str, "publicar": 0|1|None}   -> so hash, sem nota real
      labels[key] = rotulo legivel
    key = 'codigo::turma::campo', campo em {resultado, faltas, A1, A2, ...}
    """
    if period_id is None:
        period_id = current_period(client)["id"]
    items, labels = {}, {}
    fetched_notes = False
    for t in client.turmas(period_id):
        base = turma_code(t)
        label = f"{t['disciplina']} ({t['turma']})"
        items[f"{base}::resultado"] = {"hash": _h(t.get("resultado")), "publicar": None}
        labels[f"{base}::resultado"] = f"{label} — resultado"
        items[f"{base}::faltas"] = {"hash": _h(t.get("faltas")), "publicar": None}
        labels[f"{base}::faltas"] = f"{label} — faltas"
        if t.get("tem_notas"):
            if fetched_notes and getattr(client, "polite_delay", False):
                time.sleep(random.uniform(0.3, 1.2))
            n = client.notas(t["matricula_id"])
            fetched_notes = True
            for av in n.get("notas", []):
                key = f"{base}::{av['nome']}"
                items[key] = {
                    "hash": _h(f"{av.get('valor')}|{av.get('publicar')}"),
                    "publicar": 1 if av.get("publicar") else 0,
                }
                labels[key] = f"{label} — {av['nome']}"
    return items, labels

def grade_report(client, period_id=None):
    """Relatório local, somente leitura. Mantém valores apenas em memória."""
    period = current_period(client) if period_id is None else {"id": int(period_id)}
    classes = []
    for turma in client.turmas(period["id"]):
        assessments = []
        if turma.get("tem_notas"):
            response = client.notas(turma["matricula_id"])
            assessments = [
                {
                    "nome": item.get("nome", "Avaliação"),
                    "valor": item.get("valor"),
                    "publicar": bool(item.get("publicar")),
                }
                for item in response.get("notas", [])
            ]
        classes.append({
            "codigo": turma.get("codigo"),
            "disciplina": turma.get("disciplina", "Disciplina"),
            "turma": turma.get("turma"),
            "resultado": turma.get("resultado"),
            "faltas": turma.get("faltas"),
            "limite_faltas": turma.get("limite_faltas"),
            "avaliacoes": assessments,
        })
    return period, classes

def print_grade_report(client, period_id=None):
    period, classes = grade_report(client, period_id)
    period_name = period.get("descricao") or period.get("nome") or period.get("periodo") or period["id"]
    print(f"PERÍODO: {period_name}")
    for course in classes:
        print(f"\n{course['disciplina']} [{course['codigo']} / {course['turma']}]")
        result = course["resultado"] or "—"
        absences = "—" if course["faltas"] is None else course["faltas"]
        limit = "—" if course["limite_faltas"] is None else course["limite_faltas"]
        print(f"  Resultado: {result} | Faltas: {absences}/{limit}")
        if not course["avaliacoes"]:
            print("  Sem avaliações publicadas.")
        for assessment in course["avaliacoes"]:
            value = assessment["valor"] if assessment["publicar"] else "não publicada"
            print(f"  {assessment['nome']}: {'—' if value is None else value}")

def turma_grade_items(items, labels, turma_code):
    """
    Recorta as avaliacoes de UMA turma para o modelo sentinela.

    Rehasheia usando SO `publicar` (fato turma-wide). O `valor` da nota e'
    pessoal do sentinela; como o turma_snapshot e' compartilhado e o sentinela
    pode trocar entre ciclos (token morre, fail_count reordena), incluir o valor
    dispararia "Nota alterada" FALSO no fan-out a cada troca de sentinela.
    Perde-se detectar correcao de nota ja publicada (publicar fica 1, valor muda)
    no modo sentinela — mas isso e' inerentemente pessoal e o per-user pega.
    """
    sub, lab = {}, {}
    prefix = turma_code + "::"
    for k, v in items.items():
        if k.startswith(prefix) and not k.endswith(("::faltas", "::resultado")):
            pub = v.get("publicar")
            sub[k] = {"hash": _h(pub), "publicar": pub}
            lab[k] = labels[k]
    return sub, lab

def diff(old, new, labels):
    """Eventos legiveis comparando dois dicts de items. old={} => baseline (sem eventos de faltas/resultado)."""
    events = []
    for key, cur in new.items():
        prev = old.get(key)
        if prev is None:
            if key.endswith("::resultado") or key.endswith("::faltas"):
                continue
            events.append(f"Nova avaliação: {labels[key]}")
        elif prev["hash"] != cur["hash"]:
            if key.endswith("::faltas"):
                events.append(f"Faltas atualizadas: {labels[key]}")
            elif key.endswith("::resultado"):
                events.append(f"Resultado alterado: {labels[key]}")
            elif not prev.get("publicar") and cur.get("publicar"):
                events.append(f"NOTA PUBLICADA: {labels[key]} saiu!")
            else:
                events.append(f"Nota alterada: {labels[key]}")
    return events

def load_state(path=STATE_FILE):
    if os.path.exists(path):
        with open(path) as f:
            data = json.load(f)
        if data.get("v") != 2 or "labels" in data:
            return None
        return data
    return None

def save_state(items, labels=None, path=STATE_FILE, key=None):
    directory = os.path.dirname(os.path.abspath(path))
    os.makedirs(directory, exist_ok=True)
    payload = {
        "v": 2,
        "at": datetime.now().isoformat(timespec="seconds"),
        "items": _seal_items(items, key, path),
    }
    fd, tmp = tempfile.mkstemp(prefix=".state-", suffix=".json", dir=directory)
    try:
        os.fchmod(fd, 0o600)
        with os.fdopen(fd, "w") as f:
            json.dump(payload, f, ensure_ascii=False, indent=2)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp, path)
        os.chmod(path, 0o600)
    except Exception:
        try:
            os.unlink(tmp)
        except FileNotFoundError:
            pass
        raise

def _positive_int(value):
    parsed = int(value)
    if parsed <= 0:
        raise argparse.ArgumentTypeError("deve ser um inteiro positivo")
    return parsed

def _parse_args(argv=None):
    parser = argparse.ArgumentParser(
        description="Consulta e monitora dados da própria conta no SIGECAD UFGD.",
    )
    parser.add_argument("--period", type=_positive_int, help="ID do período letivo")
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument(
        "--show-grades",
        action="store_true",
        help="mostra notas atuais sem persistir valores",
    )
    mode.add_argument(
        "--show-card",
        action="store_true",
        help="mostra cartão e saldos da própria conta",
    )
    parser.add_argument(
        "--photo-out",
        metavar="CAMINHO",
        help="salva a foto com permissão 0600 (exige --show-card)",
    )
    args = parser.parse_args(argv)
    if args.photo_out and not args.show_card:
        parser.error("--photo-out exige --show-card")
    return args

def main(argv=None):
    args = _parse_args(argv)
    token = os.environ.get("SIGECAD_TOKEN")
    if not token:
        sys.exit("Defina SIGECAD_TOKEN no ambiente (ex: export SIGECAD_TOKEN='UFGDNET=...').")
    period = args.period

    if args.show_card:
        try:
            print_card_report(CardClient(token), args.photo_out)
        except ValueError as e:
            sys.exit(f"[AUTH] {e}.")
        except AuthError as e:
            sys.exit(f"[AUTH] token invalido/expirado: {e}. Faca login de novo.")
        except (urllib.error.HTTPError, urllib.error.URLError) as e:
            sys.exit(portal_error(e, "CARTÃO"))
        except RuntimeError as e:
            sys.exit(f"[CARTÃO] {e}.")
        return

    try:
        client = Client(token)
    except ValueError as e:
        sys.exit(f"[AUTH] {e}.")
    if args.show_grades:
        try:
            print_grade_report(client, period)
        except AuthError as e:
            sys.exit(f"[AUTH] token invalido/expirado: {e}. Faca login de novo.")
        except (urllib.error.HTTPError, urllib.error.URLError) as e:
            sys.exit(portal_error(e, "SIGECAD"))
        except RuntimeError as e:
            sys.exit(f"[SIGECAD] {e}.")
        return
    try:
        items, labels = snapshot(client, period)
    except AuthError as e:
        sys.exit(f"[AUTH] token invalido/expirado: {e}. Faca login de novo.")
    except (urllib.error.HTTPError, urllib.error.URLError) as e:
        sys.exit(portal_error(e, "SIGECAD"))
    except RuntimeError as e:
        sys.exit(f"[SIGECAD] {e}.")

    old = load_state()
    events = diff_sealed((old or {}).get("items", {}), items, labels)
    stamp = datetime.now().strftime("%H:%M:%S")
    if old is None:
        print(f"[{stamp}] snapshot inicial salvo ({len(items)} itens). Sem baseline ainda.")
    elif events:
        print(f"[{stamp}] {len(events)} MUDANCA(S):")
        for e in events:
            print("  -", e)
    else:
        print(f"[{stamp}] nenhuma mudanca ({len(items)} itens).")

    save_state(items)

if __name__ == "__main__":
    main()
