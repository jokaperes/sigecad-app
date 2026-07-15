# App mobile — SIGECAD Alerta

App device-sentinel: consulta o SIGECAD diretamente no aparelho e usa Firebase
apenas para agenda, quórum e push. Token e valor da nota nunca são enviados ao backend.

## Stack

- Expo 57 / React Native 0.86 / React 19 / TypeScript strict.
- React Native Firebase 25: Auth, App Check, Functions e Messaging.
- WebView + cookie manager TurboModule para login CAS.
- SecureStore para UFGDNET; AsyncStorage para hashes e estado de registro.
- UI própria em `src/ui/`, com safe area, teclado e acessibilidade básica.

## Estrutura

```text
App.tsx                    boot, consentimento, dashboard, sync e exclusão
src/auth/LoginScreen.tsx   WebView restrita a *.ufgd.edu.br
src/auth/token.ts          SecureStore
src/backend/               App Check/Auth e callables
src/core/                  API, snapshot, diff, hash e tipos
src/push/                  cadastro, refresh e silent-push handler
src/sentinel/cycle.ts      máquina de poll/report/baseline
src/storage/               AsyncStorage e metadata do cadastro
src/ui/                    tema e componentes
tests/                     11 testes core + 5 testes de ciclo
```

## Validação sem device

```bash
npm ci
npm test
npm run typecheck
npm run doctor
```

Baseline verificada em 14/07/2026: 16/16 testes, typecheck limpo e Expo Doctor 20/20.

## Firebase necessário

1. Criar projeto Firebase no plano compatível com Cloud Functions/Scheduler.
2. Habilitar Authentication anônima, Firestore, Functions, Cloud Messaging e App Check.
3. Colocar `google-services.json` e `GoogleService-Info.plist` em `app/`.
4. Registrar Play Integrity e App Attest/DeviceCheck.
5. Para development build, registrar no Console o debug token emitido pelo App Check.
6. Definir o projeto em `.firebaserc` e fazer deploy de rules, indexes e functions.

Arquivos Google Services estão ignorados e nunca devem ser publicados como
segredo operacional, embora seus IDs não sejam equivalentes a uma chave de servidor.

## Build nativo

Expo Go não carrega os módulos nativos usados aqui.

```bash
npx expo run:android
npx expo run:ios
# ou EAS development build, se configurado
npm start
```

Depois da migração SDK 57, gere projetos nativos limpos; não reutilize diretórios
Android/iOS gerados pela SDK 52.

## Fluxo do usuário

1. Login na página oficial UFGD.
2. Consentimento e email opcional.
3. Permissão de push e snapshot inicial.
4. Registro mínimo no Firebase e baseline local.
5. Dashboard restaura o cadastro em novos launches.
6. Refresh de FCM dispara re-registro automático; botão permite sync manual.
7. Exclusão remove Firebase Auth/dados, token e snapshots locais.

## Testes obrigatórios em aparelho

- cookies em Android e WKWebView iOS;
- SecureStore com aparelho bloqueado;
- App Check debug e produção;
- push token refresh;
- silent push em background/reboot/force-quit;
- quórum com dois devices da mesma turma;
- exclusão e reinstalação.

Não declare o app pronto para loja antes desses testes.
