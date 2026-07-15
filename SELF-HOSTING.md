# Self-hosting pessoal

Atualizado em 15/07/2026. Este modo é independente dos runtimes Expo Go e Firebase
descritos em [MOBILE.md](MOBILE.md).

O token e o estado ficam na máquina do próprio aluno. Este é o modo mais simples
e privado para monitoramento contínuo sem Firebase.

## Docker Compose

Requer Docker com Compose v2:

```bash
cp server/.env.example .env
```

Preencha no `.env`:

```dotenv
SIGECAD_TOKEN=UFGDNET=SEU_VALOR
NOTIFY_EMAIL=voce@example.com
RESEND_API_KEY=
RESEND_FROM=Notas UFGD <notas@seudominio.com>
```

Sem `RESEND_API_KEY`, eventos aparecem apenas no log.

```bash
docker compose up -d personal
docker compose logs -f personal
```

O container executa a cada 3600 segundos. `./data/state.json` persiste no host e
deve permanecer privado/fora do Git.

## Python direto

```bash
python3 -m venv server/.venv
server/.venv/bin/pip install -r server/requirements.txt

export SIGECAD_TOKEN='UFGDNET=...'
export NOTIFY_EMAIL='voce@example.com'
export RESEND_API_KEY=''                     # opcional
export RESEND_FROM='Notas UFGD <notas@seudominio.com>'

server/.venv/bin/python personal.py
server/.venv/bin/python personal.py --loop 3600
```

Intervalos menores que uma hora são rejeitados. Para produção pessoal, use o
loop supervisionado pelo Docker/systemd em vez de cron concorrente.

## Obter uma sessão

Fluxo local por CAS:

```bash
server/.venv/bin/python server/auth.py
```

A senha é enviada diretamente ao login UFGD, mantida apenas em memória e não é
salva. O comando imprime um bearer token; evite terminal compartilhado, histórico
e screenshots. Também é possível copiar `UFGDNET` do armazenamento de cookies do
navegador autenticado.

Se o token foi colado em chat, issue tracker ou log, considere-o exposto e faça
rotação/relogin. O código trata redirect, 401 e 403 como sessão inválida.

## Consultas manuais

```bash
export SIGECAD_TOKEN='UFGDNET=...'
python3 sigecad.py --show-grades
python3 sigecad.py --period 222 --show-grades
python3 sigecad.py --show-card
python3 sigecad.py --show-card --photo-out /tmp/minha-foto.jpg
```

O ID `222` acima é apenas exemplo de argumento, não indicação do período atual.

## Segurança operacional

- `chmod 600 .env data/state.json` quando aplicável.
- Não execute com debug de shell (`set -x`).
- Não monte o repositório/capturas privadas em servidor público.
- Resend recebe o email e texto do evento; não configure se quiser somente log local.
- Faça backup apenas do que precisa. Snapshot pode ser recriado como baseline.
