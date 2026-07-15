# App mobile — runtimes e decisões

Atualizado em 15/07/2026. O app tem uma entrada única e dois runtimes para que a
visualização funcione no Expo Go sem enfraquecer o modo nativo de alertas.

## Stack atual

| Área | Tecnologia | Comportamento |
|---|---|---|
| Runtime | Expo SDK 54, React Native 0.81, React 19 | Compatível com o Expo Go físico atual |
| Login | `react-native-webview` | credenciais ficam na página oficial UFGD |
| Expo Go | WebView same-origin + AsyncStorage | notas foreground; cookie não sai da WebView |
| Native build | cookie manager + SecureStore | token local para ciclos em background |
| Push/confiança | RN Firebase Messaging + App Check | somente development/production build |
| Backend | Auth anônima + Functions + Firestore | registro, quórum e fan-out nativos |
| UI | React Native StyleSheet | dashboard responsivo sem biblioteca visual pesada |

`App.tsx` consulta `expo-constants` e só faz `require()` do app nativo fora do
Expo Go. Assim, Firebase e cookie manager não são avaliados em um cliente que não
contém esses módulos.

## Expo Go no iPhone

1. `PortalSession` abre o CAS oficial em WebView `incognito`, com cache desativado
   e navegação limitada a HTTPS em `ufgd.edu.br`.
2. Depois do redirect acadêmico, a ponte injeta apenas três operações fixas:
   `periodos`, `turmas` e `notas`.
3. O JavaScript faz GET relativo com a sessão da própria WebView. Ele nunca lê
   `document.cookie` nem envia cookie/token ao React Native.
4. O lado nativo valida origem, canal, request ID, status, tamanho e schema.
5. A UI mostra período, métricas, mudanças, busca, notas, publicação, resultado e
   faltas. Valores acadêmicos permanecem somente no estado React.
6. AsyncStorage recebe apenas hashes SHA-256 truncados, flags e rótulos para
   detectar mudanças na próxima consulta.
7. Sair remonta/destrói a WebView privada. O histórico hash-only pode ser apagado
   separadamente na aba Privacidade.

O Expo Go não executa o push/background Firebase deste projeto. Atualizações são
foreground ao abrir, tocar em atualizar ou puxar a tela.

## Native build e background

`src/native/NativeApp.tsx` preserva o fluxo device-sentinel: login CAS, extração
controlada do cookie, SecureStore, consentimento, registro Firebase e exclusão.
O scheduler envia silent push deduplicado; `src/push/handlers.ts` executa o ciclo,
que só avança o baseline depois de o report ser aceito.

Background no iOS é best-effort: force-quit e políticas de bateria podem impedir
execução. O produto comunica checagens agendadas, não tempo real garantido.

## Estrutura mobile

```text
app/App.tsx                    seletor seguro de runtime
app/src/runtime/              capacidades Expo Go/native
app/src/expo-go/              sessão, bridge, validação, cliente e dashboard
app/src/native/               app Firebase e login com cookie manager
app/src/auth/                 SecureStore do runtime nativo
app/src/core/                 API, visão acadêmica, snapshot, hash e diff
app/src/backend/              App Check/Auth/Functions
app/src/push/                 cadastro e handlers FCM
app/src/sentinel/             ciclo de consulta/report/baseline
app/src/storage/              registro, snapshots e preview hash-only
app/src/ui/                   tema e componentes compartilhados
app/tests/                    core, ciclo e segurança Expo Go
```

## Compatibilidade verificada

Em 15/07/2026:

- `npm test`: 24/24;
- `npm run typecheck`: TypeScript strict;
- `npm run doctor`: 18/18;
- `npm audit --audit-level=high`: nenhuma advisory alta ou crítica; moderadas
  upstream exigiriam migração quebradora para SDK 57 e não foram forçadas.

Ainda requer teste manual no iPhone: login CAS real, leitura das respostas reais,
layout em tamanhos de tela e expiração/relogin. O caminho nativo requer, além disso,
Google Services, build, App Check, push e background em aparelhos físicos.
