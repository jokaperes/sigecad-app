# App mobile — SIGECAD Alerta

Aplicativo Expo com dois modos: experiência acadêmica completa no Expo Go e
alertas device-sentinel em um build nativo. Token e valor da nota nunca são
enviados ao backend.

## Ver no iPhone ou Android com Expo Go

Use a versão atual do Expo Go e mantenha iPhone e Mac na mesma rede:

```bash
npm ci
npm test
npm run typecheck
npm run start:go
```

Escaneie o QR com a câmera/Expo Go. No Android Emulator, use a ponte ADB descrita
em [TESTING.md](TESTING.md). Se a rede LAN bloquear a conexão, use:

```bash
npm run start:go -- --tunnel
```

O login começa na página CAS oficial da UFGD. A senha, o redirect (inclusive o
provedor oficial gov.br) e o cookie permanecem na mesma WebView privada; o site
do SIGECAD não é mostrado depois do login. Links HTTPS fora da sessão são
rejeitados dentro do app. As rotas acadêmicas usam uma
allowlist fixa somente GET; no portal Cartão,
ID e hash são derivados somente da página da própria sessão. Notas, foto, saldos
e extratos ficam em memória e somente hashes/rótulos acadêmicos são persistidos.

## Estrutura

```text
App.tsx                       seleciona Expo Go ou native build
src/runtime/capabilities.ts   detecta StoreClient/appOwnership sem carregar Firebase
src/expo-go/ExpoGoApp.tsx     entrada do dashboard Claude Design
src/expo-go/design/           telas acadêmicas, variantes, IBM Plex e claro/escuro
src/expo-go/PortalSession.tsx WebView com cookie persistido no app e ciclo de sessão
src/expo-go/bridge.ts         protocolo/allowlist same-origin
src/expo-go/portalData.ts     valida horários, faltas, histórico, grade, perfil e matrícula
src/expo-go/card.ts           valida perfil, saldos, foto e movimentações
src/expo-go/diagnostics.ts    gera diagnóstico agregado sem dados pessoais
src/expo-go/documents.ts      valida catálogo/PDF e compartilha via cache temporário
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
assets/                       app icon e fontes oficiais UFGD/UFGDNet
tests/                        11 core + 7 ciclo + 42 Expo Go
```

## Limites do Expo Go

- Funciona: CAS/WebView, três Homes selecionáveis, notas, faltas, horários,
  matrícula, histórico, estrutura curricular, perfil/foto, saldos, extratos,
  documentos acadêmicos, novidades locais, tema claro/escuro e estados de rede/sessão.
- `Perfil > Documentos acadêmicos` consulta a disponibilidade de atestado,
  histórico e planos. Histórico segue somente o redirect assinado validado para
  `webdoc.app.ufgd.edu.br`, exige `%PDF-` e limite de 8 MB e é apagado do cache ao
  fechar a folha nativa. Atestado respeita o bloqueio da própria UFGD. Planos usam
  exclusivamente o `peID` devolvido por `/rest/planosensino`, abrem o relatório por
  GET e seguem o mesmo redirect assinado e validado para o Webdoc. A lista é
  agrupada por semestre, com o período atual primeiro. Semestres anteriores
  entram quando a lista chega ao fim.
- A foto é validada pelos bytes JPEG/PNG mesmo quando o portal envia um
  `Content-Type` impreciso. Nomes em caixa alta são normalizados somente na UI;
  avaliações sem valor não aparecem como novidade de nota.
- Para evitar pixelização, a ponte compara original, 2048×2048, 1024×1024 e a
  variante do portal pela resolução JPEG/PNG real, selecionando a maior que cabe
  no envelope seguro. A Home em Cards é o padrão.
- A tela Cartão informa um motivo sanitizado quando a foto falha e permite nova
  tentativa; erro de renderização no aparelho volta ao avatar sem quebrar a tela.
- A foto não abre mais em tela cheia, mas continua usando a maior versão validada.
  Em Perfil, tocar no RGA copia o número pelo `expo-clipboard` e confirma com
  `Copiado`.
- A Home em Cards usa um Cartão Acadêmico expandido com saldos e Code 128 gerado no
  aparelho. RU usa o débito mais frequente; Cantina usa R$ 2,00 por refeição.
  Ambos mostram refeições restantes e a menor recarga sem sobra.
- O resumo de “Próxima aula”, nas variantes Cards e Lista, informa o dia, a sala e
  o intervalo completo (início–fim); a normalização é somente visual.
- A simbologia foi confirmada na impressão autenticada oficial em 16/07/2026. A
  sequência das barras geradas localmente coincide com a oficial; o número
  completo continua somente em memória e não entra em diagnóstico, cache ou log.
- `MAT` permanece ativa. `AP`, `RP`, `APE` e `RPF` somem de atenção a faltas,
  horários e consultas detalhadas de faltas, mas permanecem em Notas/Histórico.
- `Perfil > Diagnóstico seguro` mostra somente disponibilidade e contagens. Não
  inclui nome, RGA, nota, saldo, URL, corpo de resposta, cookie ou senha.
- Barras é o padrão. O seletor Barras/Alertas aparece em Personalização e Faltas.
- Não funciona: Firebase nativo, App Check, FCM, silent push e checagem em
  segundo plano. Esses recursos exigem development build.
- `Perfil > Notas e matrícula` mostra a consulta atual; não é histórico de
  notificações e não atualiza com o app fechado.
- O runtime não extrai cookie como fallback; se a sessão expirar, reabre o login.
- A detecção usa `executionEnvironment` e `appOwnership`; Expo Go nunca avalia o
  módulo Firebase nativo ausente.
- A abertura reaproveita a consulta de períodos e agrupa GETs acadêmicos em lotes
  concorrentes limitados a quatro. Identidade, período, turmas e agenda terminam
  e publica a Home assim que esse lote termina. O resumo de saldos hidrata o card
  logo depois, sem bloquear o primeiro desenho. Notas não bloqueiam uma Home que
  não as exibe: depois da foto/extratos, notas,
  histórico, grade e faltas detalhadas compartilham uma única volta à origem
  acadêmica e um lote coalescido.
- Períodos ficam em cache apenas na memória por cinco minutos. O JavaScript fixo
  de cada bridge é instalado uma vez por página; requisições seguintes enviam só
  o comando pequeno. Planos antigos chegam progressivamente em grupos de quatro.
- PDFs assinados usam o tamanho do arquivo e uma leitura de somente cinco bytes
  para validar `%PDF-`, evitando reler até 8 MB como Base64 antes de compartilhar.
- Para RGA numérico, “Ingresso” combina o ano inicial do RGA com o primeiro
  semestre daquele ano no histórico; nunca usa a última ocorrência acadêmica.
- Falha isolada de saldo/extrato RU ou Cantina não derruba mais nome, foto e o
  restante do Cartão. Auth e origem inválida continuam falhando de modo fechado.
- O bridge não corre mais antes do link do cartão existir: consulta o DOM a cada
  25 ms por no máximo 1 s, sem esperar imagens/CSS. Se a página geral de status
  responder 5xx, tenta os shells dedicados de RU/Cantina e os extratos; auth e
  origem inválida continuam fatais. Atualização manual preserva foto, barcode e
  extratos já carregados enquanto o resumo novo chega.
- A prioridade efetiva é período → identidade/turmas/horários → primeiro desenho
  da Home → resumo RU/Cantina → foto/extratos → notas + histórico/currículo/detalhes. O
  snapshot hash-only só avança quando todas as respostas de notas são válidas;
  uma falha parcial não é confundida com nota apagada.
- A antiga “média parcial” era uma média simples sem pesos e foi removida. A Home
  não mostra média nem contagem de notas. Cada disciplina mostra a nota final
  oficial ou a última nota disponível, sem chamá-la de média.
- Em desenvolvimento, o Metro recebe somente tempos cumulativos sanitizados para
  identidade, saldo, notas/Home, foto/extratos e dados antigos. Nenhum valor ou
  identificador acompanha essas linhas.
- Última medição limpa confirmada em iPhone/Expo Go em 16/07/2026: acadêmico atual
  `826 ms`, Home com saldos `1,54 s`, foto/extratos `1,68 s` e hidratação completa
  `3,08 s`. No Pixel 8 AVD/API 36 após retirar notas do caminho crítico: acadêmico
  `450 ms`, Home com saldos `1,27 s`, foto/extratos `1,51 s` e hidratação completa
  `3,46 s`. A reutilização do contexto do cartão foi `0 ms`. Rede, renderização
  virtual e disponibilidade dos portais variam.
- Após a Home passar a pintar antes do cartão, um reload aquecido no iPhone real
  em 16/07/2026 marcou acadêmico `211 ms`, primeiro desenho `249 ms`, resumo de
  saldos `821 ms`, foto/extratos `959 ms` e secundários `2,54 s`. A limpeza de
  PDFs temporários começou somente depois desses estágios; não comparar esse
  reload aquecido diretamente com a medição limpa anterior.
- Em 18/07/2026, depois do cache de períodos e da instalação única do bridge, três
  reloads aquecidos consecutivos no iPhone/Expo Go registraram acadêmico
  `192–237 ms`, primeiro desenho `228–271 ms`, resumo de saldos `784–890 ms`,
  cartão completo `918–1.017 ms` e secundários completos `2.579–2.647 ms`.
  As medições vieram somente das etapas sanitizadas no Metro, sem Mirroring.
- O percentual concluído prioriza `ch_total_academico / ch_total_curso` de
  `/rest/chcursada`, a fonte da tela de histórico. `percentual_concluido` do perfil
  aparece somente enquanto a carga detalhada ainda não chegou.
- Telas secundárias distinguem carregamento de resposta vazia. Notas atuais não
  são truncadas; histórico exibe faltas, grade exibe código/carga/tipo, matrícula
  exibe etapa e extratos preservam o tipo da movimentação. Falha parcial entra em
  `Perfil > Diagnóstico seguro` por conjunto, sem revelar valores pessoais.
- A troca entre os portais acadêmico e Cartão atualiza a `source` do WKWebView.
  O JavaScript dos dois bridges é compilado na suíte para capturar escapes ou
  erros sintáticos que, no aparelho, acabariam apenas no timeout.
- Um handshake de origem validada libera os GETs assim que o contexto JavaScript
  seguro existe, sem esperar imagens e folhas de estilo da página oficial. O
  cache HTTP do WebView continua desligado; o cookie de sessão persiste no
  armazenamento privado do app até Sair ou expiração na UFGD.
- Fontes e ícones são importados por arquivo. No export iOS, isso reduziu os
  módulos de `2.638` para `890`, o bundle Hermes de `6,51 MB` para `4,67 MB` e o
  diretório exportado de aproximadamente `11,46 MB` para `5,87 MB`, sem mudar o
  conjunto visual usado.
- No Android, a WebView oculta usa 2×2 pixels fora da área de toque; no iOS ela
  permanece ocupando a tela atrás do dashboard para não suspender as navegações.
  O dashboard fica em uma camada superior e a sheet de sessão acima de ambos.
- Período, curso, disciplina e etapa de matrícula recebem formatação somente na
  apresentação. A agenda usa o fim real do intervalo e mostra hoje, amanhã ou o
  próximo dia, inclusive quando a aula seguinte está na semana posterior.
- Sem disciplina acima de 50% do limite, a Home troca “Atenção” por “Faltas e
  frequência” e não reserva espaço para uma mensagem vazia.

## Build nativo

Esse modo usa atualmente um painel de alertas separado do dashboard acadêmico.
O scheduler tenta acordar aparelhos às 07, 10, 13, 16, 19 e 22 h; o aparelho
consulta a UFGD, reporta hash/rótulo sem valor e o backend envia um push após
quórum. Detecta avaliação nova/publicação, não faltas nem correção individual de
valor já publicado. iOS trata o background como best-effort.

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

Verificação automatizada:

- 72/72 testes;
- TypeScript strict limpo;
- Expo Doctor 21/21;
- nenhuma vulnerabilidade npm alta/crítica;
- scan do conjunto publicável sem token, chave privada ou credencial de servidor.
- Atualizado para Expo SDK 57 / React Native 0.86 / React 19.2 compatível com a
  versão mais recente do Expo Go no iOS e Android.

Antes de loja, valide em aparelhos: CAS/cookies, App Check, refresh de push token,
background/reboot/force-quit, quórum, exclusão e reinstalação.

O roteiro reproduzível de aparelho e privacidade está em [TESTING.md](TESTING.md).
A origem, os vetores e as cores dos assets estão em [../ASSETS.md](../ASSETS.md).
