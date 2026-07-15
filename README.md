# SIGECAD Alerta

Notificador independente e somente leitura para alunos da UFGD. O projeto detecta
publicação ou alteração de notas, faltas e resultados no SIGECAD sem armazenar o
valor das notas nos snapshots.

> Não é um produto oficial da UFGD. Use apenas com a própria conta e respeite os
> serviços da universidade: sem enumeração de IDs, sem acesso a terceiros e com
> intervalos de consulta de pelo menos uma hora.

## Modos disponíveis

| Modo | Onde o token fica | Notificação | Estado |
|---|---|---|---|
| Mobile device-sentinel | Keychain/Keystore do aluno | Push Firebase | Implementado; exige Firebase e device build |
| Self-host pessoal | `.env` da própria máquina | Resend ou console | Pronto para uso |
| Servidor central | SQLite, cifrado com AES-256-GCM | Resend ou console | Pronto, com risco operacional documentado |
| CLI local | Variável `SIGECAD_TOKEN` | Saída no terminal | Pronto |

O objetivo de privacidade é o modo mobile: o token nunca sai do aparelho. O modo
central continua disponível para deploy controlado, mas quem controla a máquina e
a chave mestra consegue decifrar tokens durante o poll. Veja [ARCHITECTURE.md](ARCHITECTURE.md).

## Uso local rápido

```bash
python3 -m venv server/.venv
server/.venv/bin/pip install -r server/requirements.txt

export SIGECAD_TOKEN='UFGDNET=...'
python3 sigecad.py --show-grades
python3 sigecad.py --show-card --photo-out /tmp/minha-foto.jpg
python3 sigecad.py                 # snapshot + diff
```

`--show-grades` e `--show-card` mantêm os valores apenas em memória. O modo de
monitoramento persiste somente hashes e rótulos em `state.json` (permissão `0600`).

Para alertas contínuos na própria máquina:

```bash
cp server/.env.example .env
# preencha SIGECAD_TOKEN, NOTIFY_EMAIL e, opcionalmente, Resend
docker compose up -d personal
```

Detalhes em [SELF-HOSTING.md](SELF-HOSTING.md).

## App mobile

O app usa Expo 57, React Native 0.86, Firebase App Check, Authentication anônima,
Cloud Functions e FCM. O login acontece numa WebView restrita a `*.ufgd.edu.br`;
o cookie fica no armazenamento seguro do aparelho. Um silent push acorda alguns
sentinelas, que consultam o SIGECAD diretamente e reportam somente hash e evento,
nunca token ou valor de nota.

```bash
cd app
npm ci
npm test
npm run typecheck
npm run doctor
```

Partes nativas não funcionam no Expo Go. Consulte [app/README.md](app/README.md).

## Testes e verificações

```bash
python3 -m unittest discover -s tests -v       # 24 testes
cd app && npm test && npm run typecheck        # 16 testes + TypeScript strict
cd ../functions && npm test                    # build + 5 testes de policy
```

Auditoria atual:

- Python: nenhuma vulnerabilidade conhecida em `requirements.txt` pelo `pip-audit`.
- Expo: nenhuma vulnerabilidade alta/crítica; Expo Doctor passa 20/20.
- Firebase Functions: advisories moderados permanecem em dependências upstream;
  a versão corrigida sugerida de `firebase-admin` ainda não é aceita pelo peer
  oficial de `firebase-functions`, portanto não foi forçada.

## Estrutura

```text
sigecad.py                 core Python, CLI, notas, cartão, snapshot e diff
personal.py                loop self-host de um aluno
server/                    serviço central: auth, cripto, SQLite, poll e Resend
tests/                     testes Python
app/
  App.tsx                  fluxo e UI mobile
  src/auth/                login CAS e token seguro
  src/core/                cliente, snapshot, hashes e diff em TypeScript
  src/sentinel/            ciclo disparado por silent push
  src/backend/             App Check, Auth e Cloud Functions
  src/push/                cadastro e handlers FCM
  src/storage/             snapshots e registro local
  src/ui/                  componentes e tema
  tests/                   hash, paridade e ciclo do sentinela
functions/
  src/index.ts             callables, quórum, fan-out, scheduler e exclusão LGPD
  src/policy.ts            validações puras compartilhadas/testadas
  tests/                   testes de policy
raw/                       capturas privadas locais; ignoradas e nunca publicadas
```

Cloud Functions está configurado para o runtime Node.js 22.

Mapas e operação: [API-MAP.md](API-MAP.md), [ROUTES.md](ROUTES.md),
[CARTAO-MAP.md](CARTAO-MAP.md), [MOBILE.md](MOBILE.md),
[PRIVACY.md](PRIVACY.md) e [server/README.md](server/README.md).

## Segurança

- Nunca coloque senha, token, cookies, fotos, `state.json`, banco ou capturas em Git.
- `raw/` contém dados pessoais reais e deve permanecer local, com permissão `0600`.
- O token é bearer: quem o possui acessa a conta. Revogue/troque se for exposto.
- Relate falhas à UFGD; não teste IDs, hashes ou contas de outras pessoas.

Licença MIT. Veja [LICENSE](LICENSE).
