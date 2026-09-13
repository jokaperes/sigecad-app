"""
Cadastro de usuario (onboarding minimo, linha de comando).
Em producao isso vira um endpoint que recebe o token do device (login no cliente).

No cadastro: valida o token, descobre as turmas do aluno (pro modelo sentinela)
e guarda o token CIFRADO. Exige consentimento explicito (LGPD).

Uso:
    export MASTER_KEY='...'
    ./.venv/bin/python register.py add <email> '<UFGDNET=...>' --consent
    ./.venv/bin/python register.py del <email>
    ./.venv/bin/python register.py list
"""
import argparse
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import sigecad
try:
    from . import crypto, store
except ImportError:  # execução direta: python server/register.py
    import crypto
    import store


def _valid_email(value):
    value = value.strip()
    if len(value) > 320 or not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", value):
        raise argparse.ArgumentTypeError("email inválido")
    return value


def _add(email, token, consent):
    if not consent:
        sys.exit("Cadastro exige consentimento explícito (--consent).")
    # valida o token e descobre as turmas do aluno
    try:
        items, _ = sigecad.snapshot(sigecad.Client(token))
    except sigecad.AuthError:
        sys.exit("Token inválido/expirado — não cadastrei.")
    except Exception as exc:
        sys.exit(f"Falha ao consultar o SIGECAD ({type(exc).__name__}); nada foi cadastrado.")
    turma_codes = sorted({"::".join(k.split("::")[:2]) for k in items})

    blob = crypto.encrypt_token(token)
    uid = store.add_user(email, blob)
    store.set_turma_members(uid, turma_codes)
    print(f"OK: user {uid} ({email}) cadastrado. Token cifrado. Turmas: {len(turma_codes)}.")


def _parser():
    parser = argparse.ArgumentParser(description="Administra usuários do servidor central SIGECAD.")
    commands = parser.add_subparsers(dest="command", required=True)
    add = commands.add_parser("add", help="cadastra ou atualiza um aluno")
    add.add_argument("email", type=_valid_email)
    add.add_argument("token", help="cookie UFGDNET da própria conta")
    add.add_argument("--consent", action="store_true", required=True)
    delete = commands.add_parser("del", help="apaga todos os dados de um aluno")
    delete.add_argument("email", type=_valid_email)
    commands.add_parser("list", help="lista usuários sem mostrar tokens")
    return parser


def main(argv=None):
    store.init_db()
    args = _parser().parse_args(argv)
    if args.command == "add":
        _add(args.email, args.token, args.consent)
    elif args.command == "del":
        store.delete_user(args.email)
        print("OK: usuário e dados apagados (LGPD).")
    elif args.command == "list":
        for u in store.active_users_with_tokens():
            print(f"  #{u['id']} {u['email']} (token cifrado presente)")


if __name__ == "__main__":
    main()
