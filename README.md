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
| Expo Go no iPhone/Android | WebView privada; cookie nunca é extraído | Atualização ao abrir/puxar | Design completo, dados acadêmicos e cartão no SDK 57 |
| Mobile device-sentinel | Keychain/Keystore do aluno | Push Firebase | Código implementado; integração real ainda não validada |
| Self-host pessoal | `.env` da própria máquina | Aviso genérico (email) ou console | Pronto; o token vive na sua máquina |
| Servidor central | SQLite, token cifrado em repouso e **claro no poll** | Aviso genérico | Isolado (`compose --profile central`). Não é zero-knowledge |
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

O app usa Expo SDK 57, React Native 0.86 e React 19.2 e possui dois runtimes. No
Expo Go, a WebView privada abre primeiro o CAS oficial; o login, o redirect (inclusive
o provedor oficial gov.br) e o cookie permanecem dentro do app. Depois do login o
site do SIGECAD não é exibido: o dashboard nativo assume a sessão no aparelho. No
Android, novas janelas do login são forçadas a navegar na mesma WebView, sem abrir
o navegador externo. O redirect HTTP legado do SIGECAD é reescrito para HTTPS
na mesma WebView. Uma ponte de mesma
origem com allowlist fixa consulta períodos, turmas, notas, faltas, horários,
matrícula, histórico, estrutura, carga horária, perfil e operações acadêmicas,
sempre por GET e somente com IDs devolvidos pela própria sessão. A mesma WebView
navega ao portal Cartão para mostrar foto validada por assinatura JPEG/PNG,
saldos RU/Cantina, Code 128 local confirmado contra a impressão autenticada
oficial e extratos paginados sem expor o cookie. Falhas da foto têm
retry/fallback sanitizado, e o Perfil oferece diagnóstico agregado sem dados
pessoais. `Perfil > Documentos acadêmicos` compartilha o histórico escolar oficial
e informa a disponibilidade de atestado e planos de ensino; o PDF validado fica em arquivo
temporário apenas durante a folha nativa de compartilhar/salvar e é apagado em
seguida. Atestado respeita o bloqueio acadêmico informado pela própria UFGD. Cada
plano usa o `peID` retornado pela sessão em um GET fixo do relatório, segue apenas o
redirect assinado para o Webdoc oficial e nunca aceita URL ou ID livre da interface.
Os planos são separados por semestre, com o período atual no topo e os anteriores
em ordem decrescente.
O número completo do cartão fica somente em memória para gerar o código
de barras; a foto mantém a maior resolução validada sem abrir modal, e o RGA só é
copiado ao clipboard após toque explícito. O Cartão mostra refeições restantes e
recarga exata; Cantina usa R$ 2,00 por refeição. A interface implementa as variantes do design
Claude (Cards/Lista/Agenda e Barras/Alertas), tema claro/escuro e estados reais de
carregamento, sessão e rede. O resumo de “Próxima aula” mostra o dia, a sala e o
intervalo completo da aula (início–fim). No
development build com Firebase configurado, Firebase App Check, Functions e FCM
ativam o fluxo device-sentinel em segundo plano. Enquanto o `google-services.json`
real não existir, o APK nativo roda a mesma interface acadêmica do Expo Go e o
painel nativo de alertas permanece desativado.

### APK Android local

```bash
cd app
export JAVA_HOME="$HOME/tools/jdk-21.0.12.1+1/Contents/Home"   # JDK 21 portátil
export ANDROID_HOME=/opt/homebrew/share/android-commandlinetools
npx expo prebuild -p android
cd android && ./gradlew assembleRelease
```

O APK sai em `android/app/build/outputs/apk/release/app-release.apk`. A
assinatura usa `app/sigecad-release.keystore` (alias `sigecad`); usuário e senha
ficam apenas em `android/gradle.properties`, que é ignorado pelo git. O
`app/google-services.json` é um placeholder que só permite compilar; substitua
pelo arquivo real para habilitar push/alertas.

```bash
cd app
npm ci
npm test
npm run typecheck
npm run doctor
npm run start:go
```

Abra o QR no Expo Go do iPhone ou Android. `Perfil > Notas e matrícula` é uma visão dos dados
atuais, atualizada em foreground; não é uma caixa de push. Alertas com o app
fechado exigem development build, arquivos Google Services, App Check e Functions
implantadas. Consulte [app/README.md](app/README.md) e o roteiro completo de teste
em [app/TESTING.md](app/TESTING.md).

## Testes e verificações

```bash
python3 -m unittest discover -s tests -v       # 28 testes
cd app && npm test && npm run typecheck        # 77 testes + TypeScript strict
cd ../functions && npm test                    # build + 5 testes de policy
```

Auditoria atual:

- Python: nenhuma vulnerabilidade conhecida em `requirements.txt` pelo `pip-audit`.
- Expo: nenhuma vulnerabilidade alta/crítica; Expo Doctor passa 18/18.
- Android: abertura, CAS oficial, teclado e orientação validados no Expo Go 54.0.8
  em um Pixel 8 virtual com API 36; a Home autenticada e o modo escuro também
  foram observados com dados reais da própria conta.
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
  App.tsx                  seleciona Expo Go ou runtime nativo sem importar módulos incompatíveis
  app.config.js            inclui Google Services apenas quando os arquivos locais existem
  src/expo-go/             sessão WebView, allowlist, dados do portal e dashboard
  src/expo-go/design/      sistema visual IBM Plex, telas, variantes e dark mode
  assets/                  ícone Expo e fontes oficiais UFGD/UFGDNet
  src/native/              login, consentimento, push e painel do development build
  src/runtime/             detecção de capacidades do runtime
  src/auth/                token seguro usado somente pelo runtime nativo
  src/core/                cliente, visão acadêmica, snapshot, hashes e diff
  src/sentinel/            ciclo disparado por silent push
  src/backend/             App Check, Auth e Cloud Functions
  src/push/                cadastro e handlers FCM
  src/storage/             snapshots e registro local
  src/ui/                  componentes e tema
  tests/                   core, ciclo do sentinela e segurança da ponte Expo Go
functions/
  src/index.ts             callables, quórum, fan-out, scheduler e exclusão LGPD
  src/policy.ts            validações puras compartilhadas/testadas
  tests/                   testes de policy
raw/                       capturas privadas locais; ignoradas e nunca publicadas
```

Cloud Functions está configurado para o runtime Node.js 22.

Mapas, identidade e operação: [API-MAP.md](API-MAP.md), [ROUTES.md](ROUTES.md),
[CARTAO-MAP.md](CARTAO-MAP.md), [MOBILE.md](MOBILE.md),
[ASSETS.md](ASSETS.md), [PRIVACY.md](PRIVACY.md) e [server/README.md](server/README.md).

## Segurança

- Nunca coloque senha, token, cookies, fotos, `state.json`, banco ou capturas em Git.
- `raw/` contém dados pessoais reais e deve permanecer local, com permissão `0600`.
- O token é bearer: quem o possui acessa a conta. Revogue/troque se for exposto.
- Relate falhas à UFGD; não teste IDs, hashes ou contas de outras pessoas.

Software proprietário. Todos os direitos reservados. Veja [LICENSE](LICENSE).
