"""
Envio de notificacao por email via Resend (https://resend.com).
Sem dependencia: usa urllib. Se RESEND_API_KEY nao estiver setada, cai em
modo dev (imprime no console) para dar pra testar o fluxo sem a key.

Env:
  RESEND_API_KEY   -> a chave do Resend
  RESEND_FROM      -> remetente verificado, ex: 'Notas UFGD <notas@seudominio.com>'
"""
import os
import html
import json
import time
import urllib.request
import urllib.error

RESEND_URL = "https://api.resend.com/emails"


def send_email(to, subject, events):
    # escapa conteudo vindo da API (nome de disciplina etc.) contra injecao de HTML no email
    items = "".join(f"<li>{html.escape(str(e))}</li>" for e in events)
    body = "<h3>" + html.escape(subject) + "</h3><ul>" + items + "</ul>"
    api_key = os.environ.get("RESEND_API_KEY")
    sender = os.environ.get("RESEND_FROM", "Notas UFGD <onboarding@resend.dev>")

    if not api_key:
        print(f"[DEV/console] -> {to} | {subject}")
        for e in events:
            print("    •", e)
        return {"dev": True}

    payload = json.dumps({"from": sender, "to": [to], "subject": subject, "html": body}).encode()
    for attempt in range(3):
        req = urllib.request.Request(
            RESEND_URL,
            data=payload,
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=20) as r:
                return json.loads(r.read().decode())
        except urllib.error.HTTPError as e:
            transient = e.code == 429 or e.code >= 500
            # Provider bodies can echo submitted fields. Keep logs metadata-only.
            print(f"[notifier] Resend HTTP {e.code}")
            if transient and attempt < 2:
                time.sleep(2 ** attempt)  # 1s, 2s
                continue
            return {"error": e.code}
        except urllib.error.URLError:
            if attempt < 2:
                time.sleep(2 ** attempt)
                continue
            print("[notifier] rede falhou")
            return {"error": "network"}
