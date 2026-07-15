# App mobile — SIGECAD Alerta

Aplicativo Expo com dois modos: notas, perfil e cartão no Expo Go e alertas
device-sentinel em um build nativo. Token e valor da nota nunca são enviados ao
backend.

## Ver no iPhone com Expo Go

Use a versão atual do Expo Go e mantenha iPhone e Mac na mesma rede:

```bash
npm ci
npm test
npm run typecheck
npm run start:go
```

Escaneie o QR com a câmera/Expo Go. Se a rede LAN bloquear a conexão, use:

```bash
npm run start:go -- --tunnel
```

O login aparece na página oficial da UFGD. A senha e o cookie permanecem na
WebView privada. As rotas acadêmicas usam uma allowlist fixa; no portal Cartão,
ID e hash são derivados somente da página da própria sessão. Notas, foto, saldos
e extratos ficam em memória e somente hashes/rótulos acadêmicos são persistidos.

## Estrutura

```text
App.tsx                       seleciona Expo Go ou native build
src/runtime/capabilities.ts   detecta StoreClient sem carregar módulos nativos
src/expo-go/ExpoGoApp.tsx     dashboard, notas, busca e privacidade
src/expo-go/PortalSession.tsx WebView incognito e ciclo de sessão
src/expo-go/bridge.ts         protocolo/allowlist same-origin
src/expo-go/card.ts           valida perfil, saldos, foto e movimentações
src/expo-go/validation.ts     limites e schemas das respostas
src/expo-go/client.ts         PollClient sobre a ponte
src/native/NativeApp.tsx      consentimento, Firebase, push e exclusão
src/native/NativeLoginScreen.tsx login CAS e cookie manager
src/auth/token.ts             SecureStore exclusivo do runtime nativo
src/core/                     API, overview, snapshot, diff, hash e tipos
src/backend/                  App Check/Auth e callables
src/push/                     cadastro, refresh e silent-push handler
src/sentinel/cycle.ts         poll/report/baseline
src/storage/                  AsyncStorage hash-only e registro
src/ui/                       tema e componentes compartilhados
assets/                       ícone público UFGDNet e app icon
tests/                        11 core + 5 ciclo + 11 Expo Go
```

## Limites do Expo Go

- Funciona: CAS/WebView, notas, perfil/foto, saldos, extratos recentes, busca,
  diff local e limpeza de sessão/histórico.
- Não funciona: Firebase nativo, App Check, FCM, silent push e checagem em
  segundo plano. Esses recursos exigem development build.
- O runtime não extrai cookie como fallback; se a sessão expirar, reabre o login.

## Build nativo

Configure Firebase antes de gerar:

1. Habilite Auth anônima, Firestore, Functions, Cloud Messaging e App Check.
2. Coloque `google-services.json` e `GoogleService-Info.plist` em `app/` somente
   no ambiente local/CI seguro; eles estão ignorados e `app.config.js` adiciona
   os caminhos ao config automaticamente quando os arquivos existem.
3. Registre Play Integrity e App Attest/DeviceCheck.
4. Registre o debug token de App Check para development builds.

```bash
npm run start:dev
npx expo run:android
npx expo run:ios
```

## Verificação

Baseline em 15/07/2026:

- 27/27 testes;
- TypeScript strict limpo;
- Expo Doctor 18/18;
- nenhuma vulnerabilidade npm alta/crítica;
- scan do conjunto publicável sem token, chave privada ou credencial de servidor.

Moderadas em dependências upstream do Expo SDK 54 permanecem porque a correção
automática migra para SDK 57 e quebraria a compatibilidade pretendida com o Expo
Go físico atual.

Antes de loja, valide em aparelhos: CAS/cookies, App Check, refresh de push token,
background/reboot/force-quit, quórum, exclusão e reinstalação.
