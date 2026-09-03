"""
Login CAS da UFGD -> obtém o cookie UFGDNET a partir de usuário+senha.
(Fluxo redescoberto e validado; prior art: github.com/ephiguxta/kinguio.)

PRINCÍPIO: a senha é usada só em memória, no ato do login, e **nunca é
persistida** — nem em arquivo, nem no banco, nem logada. Serve para:
  - self-host/onboarding: pegar o token sem mexer no DevTools;
  - app/cliente: login no dispositivo, manda só o UFGDNET pro servidor.

Zero dependência (urllib + http.cookiejar).

Uso:
    ./.venv/bin/python auth.py            # pergunta user/senha (getpass) e imprime o token
    # ou programático:
    from auth import get_token
    token = get_token("usuario", "senha")   # -> "UFGDNET=...."
"""
import os
import re
import sys
import getpass
import ssl
import urllib.request
import urllib.parse
import http.cookiejar
import certifi

LOGIN = "https://login.app.ufgd.edu.br/login"
LOGIN_FORM = "https://login.app.ufgd.edu.br/login_form"
SERVICE = "https://sigecad-academico.app.ufgd.edu.br/"
UA = "sigecad-notifier/0.1"


def get_token(username: str, password: str) -> str:
    """Faz o login CAS e retorna 'UFGDNET=...'. Levanta RuntimeError se falhar."""
    jar = http.cookiejar.CookieJar()
    tls_context = ssl.create_default_context(cafile=certifi.where())
    opener = urllib.request.build_opener(
        urllib.request.HTTPSHandler(context=tls_context),
        urllib.request.HTTPCookieProcessor(jar),
    )
    opener.addheaders = [
        ("User-Agent", UA),
        ("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"),
        ("Accept-Language", "pt-BR,pt;q=0.9,en;q=0.8"),
    ]

    # 1) GET página de login -> authenticityToken (hidden input) + cookie PLAY_SESSION
    html = opener.open(LOGIN, timeout=30).read().decode("utf-8", "replace")
    m = re.search(r'name="authenticityToken"\s+value="([0-9a-f]{40})"', html)
    if not m:
        raise RuntimeError("authenticityToken não encontrado (a página de login mudou?).")

    # 2) POST credenciais (PLAY_SESSION vai automático pelo cookie jar)
    data = urllib.parse.urlencode({
        "authenticityToken": m.group(1),
        "user.username": username,
        "user.password": password,
        "service": SERVICE,
    }).encode()
    opener.open(urllib.request.Request(LOGIN_FORM, data=data), timeout=30).read()

    # 3) UFGDNET no cookie jar
    token = None
    for c in jar:
        if c.name == "UFGDNET":
            token = f"UFGDNET={c.value}"
            break
    if not token:
        raise RuntimeError("Login falhou: UFGDNET não emitido (credenciais inválidas?).")

    # 4) valida que o token realmente responde antes de devolver
    if not _validates(token):
        raise RuntimeError("Token emitido mas não autenticou nas rotas (algo mudou no SIGECAD?).")
    return token


def _validates(token: str) -> bool:
    """Confirma o token batendo numa rota real."""
    import os
    import sys
    sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    import sigecad
    try:
        sigecad.Client(token).periodos()
        return True
    except Exception:
        return False


def _cli():
    user = input("Usuário UFGD: ").strip()
    pwd = getpass.getpass("Senha (não é salva): ")
    try:
        token = get_token(user, pwd)
    except RuntimeError as e:
        sys.exit(f"[erro] {e}")
    finally:
        del pwd  # some da memória
    token_path = os.path.join(os.path.expanduser("~"), ".sigecad-token")
    fd = os.open(token_path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w") as handle:
        handle.write(token + "\n")
    print(f"Token gravado em {token_path} (permissão 0600). O valor não foi impresso.")


if __name__ == "__main__":
    _cli()
