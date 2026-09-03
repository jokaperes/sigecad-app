# Servidor central opcional — não é zero-knowledge

Este modo **não faz parte do APK**. O processo decifra o cookie `UFGDNET` em
memória a cada poll. Criptografia em repouso não impede o operador com
`MASTER_KEY` de ler o token. Não use para contas de terceiros. Isolado no
Docker via `profiles: [central]`. Ver [SECURITY.md](../SECURITY.md).

Atualizado em 21/08/2026. O Expo Go/APK consulta a UFGD na WebView do aparelho
e não envia dados a este backend.

Modo multiusuário que consulta a UFGD 24/7 e envia um aviso genérico por email.

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

export MASTER_KEY=$(.venv/bin/python crypto.py --gen-key)
export SIGECAD_DB_PATH="$PWD/data/data.db"
```

Mantenha a mesma `MASTER_KEY`. Se trocar sem `MASTER_KEY_PREV`, tokens existentes
se tornam indecifráveis.

## Usuários

```bash
.venv/bin/python register.py add aluno@example.com 'UFGDNET=...' --consent
.venv/bin/python register.py list
.venv/bin/python register.py del aluno@example.com
```

## Poll

```bash
.venv/bin/python poller.py
.venv/bin/python poller.py --sentinel
.venv/bin/python poller.py --loop 3600
```

## Docker

```bash
cd ..
docker compose --profile central up -d central
```
