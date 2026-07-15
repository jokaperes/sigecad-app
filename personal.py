"""
Modo SELF-HOST PESSOAL — você roda pra você mesmo.

Diferente do server/ (central, multi-usuário, tokens cifrados), aqui é simples:
seu token fica no .env, na sua máquina. Sem banco, sem KEK — é o seu token no
seu disco, então não há terceiro nem honeypot. Notifica por email (Resend) ou
console.

Uso:
    export SIGECAD_TOKEN='UFGDNET=...'
    export RESEND_API_KEY='...'          # opcional
    export RESEND_FROM='Notas <notas@dominio.com>'
    export NOTIFY_EMAIL='voce@email.com' # destino (se usar Resend)
    python3 personal.py                  # 1 ciclo
    python3 personal.py --loop 3600      # a cada 1h
"""
import os
import sys
import time

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "server"))
import sigecad
import notifier  # server/notifier.py

MIN_LOOP_SECONDS = 3600


def run_once():
    token = os.environ.get("SIGECAD_TOKEN")
    if not token:
        sys.exit("Defina SIGECAD_TOKEN (ex: export SIGECAD_TOKEN='UFGDNET=...').")
    client = sigecad.Client(token)
    try:
        items, labels = sigecad.snapshot(client)
    except sigecad.AuthError:
        sys.exit("[AUTH] token expirado/inválido. Pegue um UFGDNET novo no navegador.")

    old = sigecad.load_state()
    old_items = (old or {}).get("items", {})
    events = sigecad.diff(old_items, items, labels)
    if old is None:
        print(f"baseline salvo ({len(items)} itens).")
    elif events:
        print(f"{len(events)} mudança(s):")
        for e in events:
            print("  -", e)
        dest = os.environ.get("NOTIFY_EMAIL")
        if dest:
            notifier.send_email(dest, "📚 Novidade nas suas notas (UFGD)", events)
    else:
        print("sem mudança.")

    sigecad.save_state(items, labels)


def main():
    if "--loop" in sys.argv:
        try:
            interval = int(sys.argv[sys.argv.index("--loop") + 1])
        except (ValueError, IndexError):
            sys.exit("Uso: personal.py --loop SEGUNDOS")
        if interval < MIN_LOOP_SECONDS:
            sys.exit(f"Intervalo mínimo: {MIN_LOOP_SECONDS}s (respeito ao SIGECAD).")
        print(f"[personal] loop a cada {interval}s")
        while True:
            try:
                run_once()
            except SystemExit:
                raise
            except Exception as exc:
                print(f"[personal] ciclo falhou ({type(exc).__name__}); tentando no próximo intervalo")
            time.sleep(interval)
    else:
        run_once()


if __name__ == "__main__":
    main()
