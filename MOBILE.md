# App mobile — stack e decisões

## Stack atual

| Área | Tecnologia | Motivo |
|---|---|---|
| Runtime | Expo 57, React Native 0.86, React 19 | New Architecture e um código iOS/Android |
| Login | `react-native-webview` | credenciais ficam na página oficial UFGD |
| Cookie | `@preeternal/react-native-cookie-manager` | TurboModule compatível com New Architecture |
| Token | `expo-secure-store` | Keychain/Keystore; disponível em background após primeiro unlock |
| Estado local | AsyncStorage | registro e snapshots que contêm somente hashes/rótulos |
| Push | React Native Firebase Messaging | silent/data-only e push visível via FCM |
| Confiança | Firebase App Check | Play Integrity e App Attest |
| Backend | Firebase Auth anônimo + Functions + Firestore | uid por device, callables e fan-out |
| UI | React Native StyleSheet | tema/componentes próprios, sem dependência visual pesada |

As partes nativas não funcionam no Expo Go. Use development build.

## Telas e estados

`App.tsx` controla:

- inicialização/App Check com retry;
- login UFGD em navegador incorporado e restrito por hostname;
- consentimento explícito com email opcional;
- cadastro/sincronização com baseline local;
- painel de status, quantidade e códigos de turma;
- erro, loading, vazio e atualização;
- exclusão LGPD confirmada, incluindo token e snapshots locais.

`src/ui/theme.ts` concentra cores, espaçamento e raios. `components.tsx` fornece
layout seguro, marca, cards, botões acessíveis e avisos. A UI respeita safe areas,
teclado, estados busy/disabled e alvos de toque de no mínimo 48 px.

## Background

O scheduler envia um silent push deduplicado. `src/push/handlers.ts` obtém o token
local e chama `runSentinelCycle`. O ciclo só atualiza o baseline depois que o
report foi aceito; se a rede falhar, tenta novamente no próximo wake.

Limitações do sistema operacional continuam válidas: force-quit no iOS e políticas
de bateria podem impedir execução. O produto deve comunicar “checagens agendadas”,
não promessa de tempo real.

## Compatibilidade verificada

Em 14/07/2026:

- `npm test`: 16/16;
- `npm run typecheck`: TypeScript strict;
- `npm run doctor`: 20/20;
- `npm audit --omit=dev`: nenhuma advisory alta ou crítica; moderadas upstream
  permanecem sem correção segura na linha atual.

Isso não substitui build nativo. Falta validar pods/Gradle, cookies HttpOnly,
notificações, App Check e background em aparelhos físicos.

## Próximos testes em device

1. Login real em Android e iOS, inclusive leitura do cookie WebKit.
2. Token acessível com tela bloqueada após primeiro unlock.
3. Push token refresh e re-registro.
4. Silent push com app em background, encerrado e após reboot.
5. App Check debug/development e attestation de produção.
6. Exclusão completa no Firestore/Auth e limpeza local.
7. Dois devices da mesma turma chegando ao mesmo `stateHash`.
