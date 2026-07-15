# Servidor central opcional

Modo multiusuário que consulta a UFGD 24/7 e envia email. Tokens ficam cifrados no
SQLite, mas são decifrados em RAM durante a consulta. Para maior privacidade,
prefira o app device-sentinel ou self-host.

## Componentes

| Arquivo | Responsabilidade |
|---|---|
| `auth.py` | login CAS local e validação do token |
| `crypto.py` | envelope AES-256-GCM e rotação de KEK |
| `store.py` | SQLite, WAL, permissões, usuários, membros e snapshots |
| `register.py` | cadastro/atualização/exclusão com consentimento |
| `poller.py` | poll individual ou sentinela central |
| `notifier.py` | Resend com retry e fallback de console |

## Setup

```bash
cd server
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt

export MASTER_KEY=$(.venv/bin/python crypto.py --genkey)
export SIGECAD_DB_PATH="$PWD/data/data.db"       # opcional fora do Docker
```

Mantenha a mesma `MASTER_KEY`. Se trocar sem `MASTER_KEY_PREV`, tokens existentes
se tornam indecifráveis. Em produção, use secret manager/KMS em vez de shell/file.

## Usuários

```bash
.venv/bin/python register.py add aluno@example.com 'UFGDNET=...' --consent
.venv/bin/python register.py list
.venv/bin/python register.py del aluno@example.com
```

O cadastro valida a sessão antes de gravar, descobre turmas próprias, cifra o
token e zera falhas anteriores. Email é validado. A exclusão usa cascades SQLite.

## Poll

```bash
export MASTER_KEY='...'
export RESEND_API_KEY='...'   # opcional
export RESEND_FROM='Notas UFGD <notas@seudominio.com>'

.venv/bin/python poller.py
.venv/bin/python poller.py --sentinel
.venv/bin/python poller.py --loop 3600
```

- Padrão: cada aluno é consultado e recebe eventos individuais, incluindo faltas.
- `--sentinel`: um membro por turma é consultado e publicações são distribuídas
  por email; correções de valor pessoal não são detectáveis nesse modo.
- Auth inválida mata o token imediatamente; falhas transitórias exigem cinco ciclos.
- Logs omitem tokens, URLs/corpos externos e detalhes de exceção.

## Docker

```bash
cd ..
cp server/.env.example .env
docker compose --profile central up -d central
```

Compose define `SIGECAD_DB_PATH=/app/server/data/data.db` e monta
`./server-data:/app/server/data`, evitando perda do banco em rebuild.

## Segurança de produção

- Restrinja `data.db`, backups e secrets; o código aplica `0600` ao banco.
- Nunca exponha o CLI de cadastro como endpoint sem autenticação/CSRF/rate limit.
- Use KMS/HSM, monitoramento, política de retenção e procedimento de incidente.
- Não coloque `MASTER_KEY` e backup do banco no mesmo domínio de acesso.
- O modo central não é zero-knowledge, mesmo com criptografia forte.
