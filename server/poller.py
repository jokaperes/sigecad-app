"""
Poller central. Dois modos:

  (padrao)  per-user : consulta cada aluno com o proprio token; detecta notas,
            faltas e resultado individuais; notifica o proprio aluno.

  --sentinel: modelo SENTINELA. Para cada turma, escolhe 1 aluno com token vivo,
            consulta so ele, e ao detectar que SAIU/ALTEROU nota na turma,
            faz fan-out para todos os alunos cadastrados naquela turma.
            Guarda muito menos estado por poll e bate MUITO menos no SIGECAD.
            (Faltas/resultado sao individuais -> NAO entram no fan-out.)

Uso:
    export MASTER_KEY='...'
    export RESEND_API_KEY='...'   # opcional (senao, console)
    ./.venv/bin/python poller.py                 # per-user, 1 ciclo
    ./.venv/bin/python poller.py --sentinel      # sentinela, 1 ciclo
    ./.venv/bin/python poller.py --sentinel --loop 3600
"""
import os
import sys
import time
import random

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import sigecad
import store
import crypto
import notifier

MIN_LOOP_SECONDS = 3600


def _client_snapshot(enc_blob):
    """Decifra o token so em memoria e devolve (items, labels). Levanta AuthError."""
    token = crypto.decrypt_token(enc_blob)
    try:
        return sigecad.snapshot(sigecad.Client(token))
    finally:
        del token  # some da memoria assim que possivel


# ---------- modo per-user ----------
def run_once():
    users = store.active_users_with_tokens()
    print(f"[per-user] {len(users)} usuario(s) ativo(s)")
    for i, u in enumerate(users):
        if i:
            time.sleep(random.uniform(0.5, 2.0))  # educado com o servidor
        try:
            items, labels = _client_snapshot(u["enc_blob"])
        except sigecad.AuthError:
            store.record_failure(u["id"], threshold=1)  # auth falhou -> morto na hora
            print(f"  user {u['id']}: token morto -> 'dead' (pedir re-login)")
            continue
        except Exception as e:
            st = store.record_failure(u["id"])
            print(f"  user {u['id']}: erro {type(e).__name__} (status={st})")
            continue
        store.record_success(u["id"])
        old = store.get_snapshot(u["id"])
        events = sigecad.diff(old, items, labels)
        if not old:
            print(f"  user {u['id']}: baseline ({len(items)} itens)")
        elif events:
            print(f"  user {u['id']}: {len(events)} mudanca(s) -> notificando")
            notifier.send_email(
                u["email"],
                "Atualização acadêmica",
                ["Há uma atualização na sua conta UFGD. Consulte os detalhes no seu aparelho."],
            )
        else:
            print(f"  user {u['id']}: sem mudanca")
        store.save_snapshot(u["id"], items)


# ---------- modo sentinela ----------
def run_sentinel_once():
    turmas = store.turmas_with_members()
    print(f"[sentinela] {len(turmas)} turma(s) com membros")
    # agrupa por sentinela: cada sentinela e' consultado UMA vez e cobre suas turmas
    by_sentinel = {}
    for tc in turmas:
        s = store.sentinel_for(tc)
        if not s:
            print(f"  turma {tc}: sem sentinela com token vivo — pulando")
            continue
        by_sentinel.setdefault(s["user_id"], {"blob": s["enc_blob"], "turmas": []})["turmas"].append(tc)

    print(f"[sentinela] {len(by_sentinel)} poll(s) cobrindo todas as turmas")
    for i, (uid, info) in enumerate(by_sentinel.items()):
        if i:
            time.sleep(random.uniform(0.5, 2.0))
        try:
            items, labels = _client_snapshot(info["blob"])
        except sigecad.AuthError:
            store.record_failure(uid, threshold=1)
            print(f"  sentinela {uid}: token morto -> proxima poll escolhe outro membro")
            continue
        except Exception as e:
            store.record_failure(uid)
            print(f"  sentinela {uid}: erro {type(e).__name__}")
            continue
        store.record_success(uid)
        for tc in info["turmas"]:
            sub, lab = sigecad.turma_grade_items(items, labels, tc)
            old = store.get_turma_snapshot(tc)
            events = sigecad.diff(old, sub, lab)
            if not old:
                print(f"  turma {tc}: baseline ({len(sub)} avaliacoes)")
            elif events:
                emails = store.turma_member_emails(tc)
                print(f"  turma {tc}: {len(events)} mudanca(s) -> fan-out p/ {len(emails)} aluno(s)")
                for em in emails:
                    notifier.send_email(
                        em,
                        "Atualização acadêmica",
                        ["Há uma atualização na sua conta UFGD. Consulte os detalhes no seu aparelho."],
                    )
            store.save_turma_snapshot(tc, sub)


def main():
    print("MODO CENTRAL: este processo decifra tokens UFGDNET em memória e não é zero-knowledge.")
    store.init_db()
    sentinel = "--sentinel" in sys.argv
    runner = run_sentinel_once if sentinel else run_once
    if "--loop" in sys.argv:
        try:
            interval = int(sys.argv[sys.argv.index("--loop") + 1])
        except (ValueError, IndexError):
            sys.exit("Uso: poller.py [--sentinel] --loop SEGUNDOS")
        if interval < MIN_LOOP_SECONDS:
            sys.exit(f"Intervalo mínimo: {MIN_LOOP_SECONDS}s (respeito ao SIGECAD).")
        print(f"[poller] modo={'sentinela' if sentinel else 'per-user'} loop={interval}s")
        while True:
            try:
                runner()
            except Exception as exc:
                print(f"[poller] ciclo falhou ({type(exc).__name__}); tentando no próximo intervalo")
            time.sleep(interval)
    else:
        runner()


if __name__ == "__main__":
    main()
