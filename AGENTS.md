# SIGECAD

Aplicativo independente para alunos da UFGD consultarem dados acadêmicos e do
cartão em uma interface mobile. O projeto também inclui ferramentas opcionais
para detectar mudanças em notas e enviar alertas.

Este não é um produto oficial da UFGD. Use somente com a própria conta.

## Estado atual

- App Android 0.3.9, Expo SDK 57, React Native 0.86 e React 19.2.
- Login oficial da UFGD dentro de uma WebView privada.
- Dashboard com início, notas, faltas, horários, histórico, grade, matrícula,
  documentos acadêmicos, perfil e cartão UFGD.
- APK arm64-v8a assinado para Android.
- Notificações em segundo plano estão desativadas até a integração com um projeto
  Firebase real.
- CLI, self-host pessoal e servidor central continuam disponíveis como modos
  opcionais.

## Regras de segurança

- Acesse somente a conta autorizada pelo próprio usuário.
- Faça apenas requisições GET aos serviços da UFGD.
- Nunca varie IDs, códigos ou hashes para tentar acessar dados de terceiros.
- Nunca registre ou envie senha, cookie, token, CPF, foto, URL assinada ou resposta
  acadêmica completa.
- Mantenha `raw/`, `.env`, `state.json`, bancos, credenciais e capturas fora do Git.
- Não desative TLS nem use `verify=False`.
- Consultas automáticas devem respeitar intervalo mínimo de uma hora.
- Não faça testes ao vivo na UFGD sem autorização explícita. Use fixtures e fakes.

## App mobile

O login começa no CAS oficial. Credenciais e captcha são preenchidos na página da
UFGD e não passam pelo código React Native. O CAS, o provedor oficial gov.br e o
SIGECAD permanecem na mesma WebView.

No Android, o app desativa múltiplas janelas, trata `window.open` e
`target=_blank` na própria WebView, reescreve o destino HTTP legado do SIGECAD
para HTTPS e bloqueia intents HTTP, HTTPS e `intent:`. O navegador externo e o
site acadêmico não devem aparecer depois do login. Quando a sessão fica pronta,
o dashboard nativo cobre a WebView.

A ponte acadêmica aceita somente origens oficiais e uma lista fixa de rotas GET.
IDs de período, matrícula, plano e cartão sempre vêm da sessão autenticada. A
interface não fornece caminhos ou URLs livres.

Os dados acadêmicos, a foto, os saldos, o número do cartão e os extratos ficam em
memória. O armazenamento local recebe somente hashes, estado de publicação,
rótulos necessários, horário da consulta e preferências visuais. O número do
cartão é validado e usado localmente para gerar Code 128.

Histórico, atestado e planos de ensino só são baixados após ação do usuário. O app
aceita apenas o Webdoc oficial, valida assinatura e tamanho do PDF, abre a folha
nativa de compartilhar e apaga o arquivo temporário depois.

O runtime nativo contém a base do device-sentinel com SecureStore, Firebase App
Check, Functions e FCM. A flag `app/src/native/sentinelFlag.ts` permanece falsa
enquanto não houver configuração Firebase de produção e teste em aparelhos reais.
O fluxo coletivo detecta criação ou publicação de avaliação. Ele não detecta
faltas nem correção de uma nota já publicada.

## Desenvolvimento do app

Requer Node.js 22.

```bash
cd app
npm ci
npm run start:go
```

Validação:

```bash
cd app
npm test
npm run typecheck
npm run doctor
```

Build Android local requer JDK 21 e Android SDK configurados:

```bash
cd app
npx expo prebuild -p android
cd android
./gradlew assembleRelease
```

O APK é gerado em
`app/android/app/build/outputs/apk/release/app-release.apk`. A assinatura usa
`app/sigecad-release.keystore`, alias `sigecad`. As senhas ficam apenas no
`app/android/gradle.properties`, que não entra no Git.

O arquivo `app/google-services.json` atual não habilita notificações para usuários
reais. Para ativar push, configure um projeto Firebase, substitua os arquivos
Google Services, habilite App Check, implante as Functions e valide em Android e
iOS físicos antes de ativar o sentinela.

## Python e self-host

```bash
python3 -m venv server/.venv
server/.venv/bin/pip install -r server/requirements.txt

export SIGECAD_TOKEN='UFGDNET=...'
python3 sigecad.py --show-grades
python3 sigecad.py --show-card
python3 sigecad.py
```

O monitor salva hashes em `state.json`. Para executar continuamente na própria
máquina:

```bash
cp server/.env.example .env
docker compose up -d personal
```

Sem Resend, os eventos aparecem no console. O serviço central opcional usa token
cifrado no SQLite, mas o decifra em memória durante cada consulta. Quem controla a
máquina e a chave mestra consegue acessar o token.

## Testes do projeto

```bash
python3 -m unittest discover -s tests -v
python3 -m compileall -q sigecad.py personal.py server tests

cd app
npm test
npm run typecheck
npm run doctor

cd ../functions
npm test
```

O CI executa essas verificações em pushes para `main` e em pull requests.

## Estrutura

```text
sigecad.py             cliente e monitor Python
personal.py            loop self-host de um aluno
server/                autenticação, criptografia, SQLite, poll e Resend
tests/                 testes Python
app/                   aplicativo Expo e projeto Android
app/src/expo-go/       sessão WebView, bridge, dados e interface acadêmica
app/src/native/        login e base do device-sentinel
app/src/core/          snapshot, hashes e diff
functions/             Firebase Functions, quórum e envio de push
raw/                   fixtures privadas locais, fora de commits e releases
```

## Limitações conhecidas

- Push e trabalho em segundo plano ainda dependem da configuração Firebase real.
- Silent push é best-effort e pode atrasar, especialmente no iOS após force-quit.
- Os portais da UFGD podem mudar rotas, HTML e comportamento sem aviso.
- O portal do cartão pode ficar indisponível. O app deve mostrar erro sem repetir
  consultas agressivamente.
- O servidor central não é zero-knowledge.

Software proprietário. Todos os direitos reservados. Consulte `LICENSE`.
