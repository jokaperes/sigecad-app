# App mobile — runtimes e decisões

Atualizado em 18/07/2026. O app tem uma entrada única e dois runtimes para que a
visualização funcione no Expo Go sem enfraquecer o modo nativo de alertas.

## Stack atual

| Área | Tecnologia | Comportamento |
|---|---|---|
| Runtime | Expo SDK 57, React Native 0.86, React 19.2 | Compatível com o Expo Go mais recente |
| Login | `react-native-webview` | credenciais ficam na página oficial UFGD |
| Expo Go | WebView same-origin + AsyncStorage | notas, perfil e cartão foreground; cookie não sai da WebView |
| Native build | cookie manager + SecureStore | token local para ciclos em background |
| Push/confiança | RN Firebase Messaging + App Check | somente development/production build |
| Backend | Auth anônima + Functions + Firestore | registro, quórum e fan-out nativos |
| UI | StyleSheet + Lucide + IBM Plex | telas acadêmicas, variantes e tema claro/escuro |

`App.tsx` renderiza somente o dashboard acadêmico (`ExpoGoApp`). O sentinela
Firebase permanece desativado (`SENTINEL_ENABLED = false`) porque o backend
receberia metadados acadêmicos. A WebView usa allowlist exata de origens,
sem extração de cookie. Detalhes em [SECURITY.md](SECURITY.md).

## APK Android local

Build local validado em 11/09/2026:

- JDK 21 portátil em `~/tools/jdk-21.0.12.1+1` (o Temurin 24 do sistema não é
  suportado pelo Gradle do RN 0.81); Android SDK em
  `/opt/homebrew/share/android-commandlinetools`.
- `app/google-services.json` é placeholder apenas para o prebuild e o plugin do
  Firebase passarem; nenhuma função acadêmica depende dele.
- Assinatura release: `app/sigecad-release.keystore`, alias `sigecad`, credenciais
  somente em `android/gradle.properties` (ignorado). Sem as propriedades, o
  release cai no keystore de debug.
- Comandos: `npx expo prebuild -p android && cd android && ./gradlew
  assembleRelease`. APK 0.3.4 arm64-v8a, com R8 e libs nativas compactadas.
  Push/background seguem desativados até o projeto Firebase real.

## Expo Go no iPhone e Android

1. `PortalSession` abre primeiro o CAS oficial na mesma WebView. O formulário, o
   redirect acadêmico e o gov.br oficial ficam dentro do app. Depois do login, o
   site do SIGECAD não é mostrado: uma tela nativa cobre o WebView até a sessão
   ficar estável (URL acadêmica sem `ticket`). No Android, múltiplas janelas ficam
   desativadas para que `window.open` e `target=_blank` naveguem na mesma WebView.
   O cookie UFGDNET fica no armazenamento privado do app (não é lido
   pelo JavaScript). Cache HTTP continua desligado. Navegação limitada às origens
   permitidas. `Sair da conta` apaga o cookie; uma sessão já válida pula direto ao
   dashboard após o CAS.
2. Depois do redirect acadêmico, a ponte injeta uma allowlist fechada de operações
   GET para períodos, turmas, notas, faltas, horários, matrícula, histórico,
   currículo, carga horária, dados acadêmicos, planos de ensino e operações do calendário.
3. O JavaScript faz GET relativo com a sessão da própria WebView. Ele nunca lê
   `document.cookie` nem envia cookie/token ao React Native.
4. O lado nativo valida origem, canal, request ID, status, tamanho e schema.
5. Para o cartão, a mesma WebView navega serialmente para
   `cartao.app.ufgd.edu.br`; a ponte deriva o ID/hash somente do perfil autenticado
   e busca foto, saldos e páginas limitadas dos extratos RU/Cantina. A foto é
   aceita apenas após validar bytes JPEG/PNG; a UI não pode informar nem enumerar
   identificadores. O cliente compara original, 2048×2048, 1024×1024 e a variante
   indicada pelo portal, lê dimensões JPEG/PNG e escolhe a maior resolução válida
   que cabe no envelope seguro da ponte.
6. A UI implementa o projeto `SIGECAD.dc.html`: três Homes, duas visualizações de
   faltas, notas detalhadas, horários, cartão, histórico, grade curricular,
   matrícula, documentos acadêmicos, resumo atual de notas/matrícula, perfil, estados de rede/sessão e
   tema claro/escuro.
   Cards e Barras são os padrões; Barras/Alertas podem ser alternados em Faltas.
7. AsyncStorage recebe apenas hashes SHA-256, flags e rótulos para
   detectar mudanças na próxima consulta.
8. Na carga inicial, a resposta de períodos já usada na autenticação é reaproveitada.
   Identidade, turmas, horário e operações atuais terminam na origem acadêmica e
   liberam o primeiro desenho da Home. `card-summary` hidrata os saldos logo depois;
   foto/extrato continuam em segundo plano.
   Notas saem do caminho crítico e depois compartilham com histórico, currículo,
   matrícula e faltas uma única volta à origem acadêmica e um lote coalescido.
   GETs acadêmicos usam concorrência máxima quatro. Um handshake same-origin
   inicia a ponte sem esperar imagens e assets visuais do portal.
9. Nomes em caixa alta são normalizados apenas para exibição. Avaliações sem valor
   não viram notificações de nota, e as safe areas seguem o tema/barra inferior.
10. Falhas da foto são classificadas sem URL/corpo e podem ser tentadas novamente;
   erro de renderização usa avatar. O diagnóstico agregado informa apenas estados
   e contagens, nunca valores pessoais ou credenciais.
11. Foto, número completo para Code 128, saldos e extratos ficam somente em memória; sair remonta/destrói
   a WebView privada. O histórico hash-only pode ser apagado
   separadamente na tela Perfil.
12. A foto não é interativa, mas conserva a maior variante validada. Tocar no RGA
   em Perfil copia somente esse valor para o clipboard e mostra confirmação.
13. Resultados finais `AP`, `RP`, `APE` e `RPF` removem a disciplina de horários,
   alertas e consulta detalhada de faltas; `MAT` permanece ativa.
14. O Cartão gera Code 128 localmente a partir do número validado da própria conta;
   a simbologia e a sequência das barras foram confirmadas contra a impressão
   autenticada oficial em 16/07/2026.
   RU usa o débito modal em memória; Cantina usa R$ 2,00 por refeição. Ambos mostram
   refeições restantes e a menor recarga que elimina a sobra.
15. IBM Plex e Lucide são importadas por arquivo usado. Isso evita embutir os
    catálogos completos de fontes e ícones e reduz download/parse do bundle.
16. Em `Perfil > Documentos acadêmicos`, catálogo e planos do período atual
    carregam sob demanda. Semestres anteriores entram ao chegar no fim da lista.
    Histórico segue apenas o redirect assinado exato do SIGECAD para o Webdoc
    oficial, cujo PDF de até 8 MB é validado e removido depois da folha nativa.
    Atestado respeita o bloqueio da própria UFGD. Como a emissão de planos
    usa o `peID` devolvido pela própria sessão em um GET fixo e valida o redirect assinado.

O Expo Go não executa o push/background Firebase deste projeto. Atualizações são
foreground ao abrir, tocar em atualizar ou puxar a tela.

`Perfil > Notas e matrícula` lista notas já lançadas e janelas retornadas na
consulta atual. A tela não mantém histórico de eventos e não recebe nada com o
app fechado.

## Native build e background

`src/native/NativeApp.tsx` preserva o fluxo device-sentinel: login CAS, extração
controlada do cookie, SecureStore, consentimento, registro Firebase e exclusão.
O scheduler envia silent push deduplicado; `src/push/handlers.ts` executa o ciclo,
que só avança o baseline depois de o report ser aceito.

O scheduler tenta acordar até três aparelhos por turma às 07, 10, 13, 16, 19 e
22 h. Cada aparelho consulta a UFGD com a credencial local e reporta somente
código da turma, hash e rótulos. Depois do quórum, o Firebase envia o push visível.
O modelo coletivo detecta nova avaliação e mudança de não publicada para
publicada. Ele não envia valores de nota e, por isso, não detecta correção de um
valor já publicado nem falta individual. O painel mostra o alerta recebido em
primeiro plano; em background, o sistema operacional apresenta a notificação.

Background no iOS é best-effort: force-quit e políticas de bateria podem impedir
execução. O produto comunica horários de verificação, não tempo real garantido.
Esse caminho ainda precisa de Google Services, Firebase/App Check configurados,
deployment das Functions e teste ponta a ponta em aparelhos reais. Enquanto isso,
o APK nativo abre o mesmo dashboard acadêmico do Expo Go; o painel nativo de
alertas só é montado quando `App.tsx` voltar a selecioná-lo após a configuração
do Firebase.

## Estrutura mobile

```text
app/App.tsx                    seletor seguro de runtime
app/src/runtime/              capacidades Expo Go/native
app/src/expo-go/              sessão, bridges, cartão, validação e dados do portal
app/src/expo-go/design/       sistema visual e todas as telas/variantes
app/assets/                   ícone Expo e assets oficiais UFGD/UFGDNet
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

Automação revalidada em 18/07/2026; passagens de aparelho mantêm a data indicada:

- `npm test`: 72/72;
- `npm run typecheck`: TypeScript strict;
- `npm run doctor`: 21/21;
- `npm audit --audit-level=high`: nenhuma advisory alta ou crítica.
- Expo SDK 57: compatibilidade atualizada com a nova versão 57.0.9 do Expo Go no iOS/Android.
  oficial, manteve a orientação retrato, reposicionou a WebView com o teclado e
  não gerou erro `ReactNativeJS` nem `AndroidRuntime` no fluxo sem autenticação.
- No login claro, a barra de status força ícones escuros mesmo quando o sistema
  está em modo escuro; após autenticar, o dashboard volta a controlar a barra
  conforme a preferência Sistema/Claro/Escuro.
- Em 18/07/2026, três reloads aquecidos do iPhone observados somente pelo Metro
  mantiveram Home em `228–271 ms`, cartão completo em `918–1.017 ms` e dados
  secundários completos em `2.579–2.647 ms`.
- No Android, a WebView de ponte fica em uma superfície mínima fora da área
  tocável; o WKWebView do iOS continua em uma superfície completa atrás da UI.
  Isso impede o WebView nativo Android de interceptar abas e botões invisivelmente.
- Rótulos reais do portal são normalizados somente para exibição: `2026 - 1`
  vira `2026/1`, caixa alta acadêmica preserva siglas e `MATRICULAETAPA4` vira
  `Matrícula · etapa 4`. A próxima aula explicita hoje, amanhã ou o dia da semana,
  a sala e o intervalo completo (início–fim).

Bundles Metro para iOS e Android foram gerados sem erro. A Home autenticada foi
validada no AVD e no iPhone; Histórico e Planos de Ensino abriram a folha nativa
no iPhone. Cartão, as demais telas secundárias e o conjunto completo ainda precisam
de passagem manual em outros tamanhos, além de expiração/relogin. O caminho nativo requer, além disso,
Google Services, build, App Check, push e background em aparelhos físicos.
