# Arquitetura do SIGECAD Alerta

Atualizado em 18/07/2026. Este documento descreve o código existente; itens que
dependem de Firebase/device real estão marcados como pendentes de integração.

## Princípios

- Somente leitura e somente a conta do próprio aluno.
- Senha nunca é lida pelo app nem persistida pelos modos Python.
- Valor de nota existe apenas em memória durante a comparação/visualização.
- Estado persistente usa hashes, com minimização e exclusão explícita.
- Consultas educadas: ciclos espaçados e jitter entre rotas de notas.

## Visão geral

```text
                             UFGD
                    períodos / turmas / notas
                         ▲              ▲
                         │ GET          │ GET
          ┌─────────┴─────────┐  ┌─────────┴───────┐  ┌──────┴───────────┐
          │ Expo Go iPhone    │  │ native build    │  │ Python local   │
          │ WebView privada   │  │ token seguro    │  │ ou central     │
          │ UI + hash/diff    │  │ hash + report   │  │ hash + diff    │
          └──────────────────┘  └────────┬─────────┘  └──────┬─────────┘
                                     │ report           │ Resend/console
                                     ▼                  ▼
                             Firebase Functions     aluno individual
                             quórum + fan-out
                                     │
                                     ▼
                                  push FCM
```

## Core de dados

Python (`sigecad.py`) e TypeScript (`app/src/core/`) seguem o mesmo fluxo:

1. Buscar períodos e escolher o que contém a data atual; fora da janela, usar o
   maior ID.
2. Buscar turmas do período.
3. Para turmas com notas, buscar avaliações usando o `matricula_id` retornado
   pela própria sessão.
4. Criar chaves `codigo::turma::campo`.
5. Persistir `sha256(...)[0:16]` e flag `publicar`, nunca o valor.
6. Comparar snapshots para produzir eventos de nova avaliação, publicação,
   alteração, faltas ou resultado.

No modo sentinela, o hash da turma usa somente `publicar`. Valores são pessoais;
incluí-los faria a troca de sentinela gerar falso positivo. A consequência é que
uma correção de valor já publicado só é detectável no modo individual.

## Expo Go foreground

Este runtime prioriza visualização imediata no iPhone/Android sem custom native modules:

1. A entrada detecta `ExecutionEnvironment.StoreClient` e não avalia imports de
   Firebase, SecureStore ou cookie manager do caminho nativo.
2. O CAS, o SIGECAD e, quando escolhido, o IdP oficial gov.br abrem na mesma
   WebView privada. A navegação de topo passa pela allowlist exata da sessão;
   HTTPS fora dela é rejeitado dentro do app.
3. Uma ponte injetada somente na origem acadêmica oferece uma allowlist fixa de
   comandos GET. IDs de período/matrícula vêm somente das respostas autenticadas;
   não existe caminho ou URL fornecido pela UI.
4. O protocolo limita mensagens e valida origem, request ID, status e schema.
   Redirect de login vira expiração de sessão.
5. Para foto/cartão, a fila navega a mesma WebView para a origem Cartão. ID e
   hash são descobertos da página do usuário; não existem parâmetros de enumeração.
   A foto é validada pela assinatura dos bytes JPEG/PNG, não pelo header do
   servidor. Saldos e páginas de extrato voltam apenas para memória; a paginação
   é limitada, deduplicada e não persiste movimentações. A leitura da foto produz
   somente um estado enumerado e sanitizado; a UI oferece retry e fallback local.
6. `academic.ts` produz a visão de notas e o snapshot hash-only. `portalData.ts`
   valida horários, faltas, matrícula, histórico, currículo, carga horária,
   perfil e operações acadêmicas. Esses dados adicionais ficam somente em memória.
7. A UI normaliza caixa alta de nomes, cursos e disciplinas apenas para apresentação,
   padroniza período/operação e não trata uma
   avaliação publicada sem valor numérico como “nota publicada”. A safe area usa
   as superfícies do tema em vez de faixas brancas do container nativo.
8. AsyncStorage recebe apenas snapshot hash-only, rótulos, horário de consulta e
   preferências não sensíveis de tema/layout.
9. O diagnóstico do Perfil é derivado de contagens e flags já validadas em memória;
   por construção não recebe nomes, RGA, disciplinas, notas, saldos, URLs ou corpos.
10. A primeira resposta de períodos é reaproveitada. Requisições acadêmicas da
    mesma origem usam lotes com até quatro operações simultâneas. Identidade,
    turmas, horários e operações atuais liberam a Home antes da única troca para
    `card-summary`; os saldos hidratam o card sem bloquear o primeiro desenho.
    Notas não bloqueiam essa tela. O handshake same-origin não espera assets visuais do portal.
    Após foto/extratos, notas, histórico, grade, carga, matrícula e faltas
    detalhadas compartilham uma única volta à origem e um lote coalescido.
    A lista de períodos permanece somente em memória por cinco minutos. Cada
    documento WebView recebe o bootstrap do bridge uma vez por revisão/página.
    Planos antigos chegam progressivamente em lotes de quatro, permitindo que uma
    emissão solicitada entre lotes tenha prioridade. O PDF temporário usa o tamanho
    do arquivo e lê somente os cinco bytes da assinatura `%PDF-`.
11. `card-summary` retorna nome/saldos sem foto/AJAX. Após a Home, `card` hidrata
    foto e extratos; em seguida entram notas e os dados acadêmicos secundários.
    O snapshot hash-only só é salvo quando todas as notas foram validadas; uma
    resposta parcial continua útil em RAM, mas não avança o baseline.
12. Progresso do curso usa prioritariamente os totais de `/rest/chcursada`, que
    alimentam a tela de histórico. O percentual resumido de `dadosacademico` é
    apenas fallback até a hidratação secundária terminar.
    Por até cinco segundos, a carga completa reutiliza uma vez o contexto validado
    do resumo. Na origem Cartão, o documento de pessoa já aberto é lido diretamente;
    o bridge aguarda somente o link de cartão no DOM (até 1 s), evitando a corrida
    com o HTML ainda em parsing. O status fornece os dois saldos; se ele retorna
    5xx, as páginas separadas e extratos continuam como fallback.
12. A UI não calcula “média parcial” geral: pesos/fórmulas não são uniformes.
    Por disciplina, exibe final oficial ou último lançamento com rótulo explícito.
13. A foto permanece não interativa e usa a maior variante validada em memória.
    A cópia do RGA exige toque explícito e usa o clipboard do sistema, sem log.
14. `MAT` permanece ativo; `AP`, `RP`, `APE` e `RPF` saem da agenda, dos alertas
    e da hidratação detalhada de faltas, mas continuam em Notas/Histórico.
15. A ponte WebView permanece viva atrás do dashboard no iOS. No Android ela usa
    uma superfície 2×2 fora da área tocável, porque o WebView nativo pode capturar
    taps mesmo invisível. A UI autenticada e a sheet de sessão têm camadas maiores.
16. O número completo validado fica em memória para gerar Code 128 localmente.
    RU usa a moda dos débitos; Cantina usa R$ 2,00 por refeição. Ambos calculam
    refeições restantes e recarga divisível, sem chamar o documento `webdoc`.
17. Fontes e ícones usam imports por arquivo. O export iOS carrega somente os sete
    pesos IBM Plex e 22 ícones usados, em vez dos catálogos completos.
18. Documentos acadêmicos são sob demanda. O catálogo nasce dos links do menu da
    sessão e a UI nunca fornece caminho/URL. Histórico pode redirecionar somente
    para `https://webdoc.app.ufgd.edu.br/gerar`, com exatamente `documento` e hash
    hexadecimal; a URL assinada fica em memória e nunca é logada. O GET precisa
    retornar PDF `%PDF-` de até 8 MB. `expo-file-system` grava no cache apenas para
    `expo-sharing`; o `finally` remove o arquivo e a inicialização limpa resíduos.
    Atestado respeita o bloqueio do portal. Planos são catalogados por GET e usam
    somente o `peID` devolvido pela sessão no caminho fixo
    `/graduacao/relatorios/planoensino`; o redirect Webdoc passa pela mesma validação.
    A apresentação agrupa por período, fixa o atual no topo e ordena os demais
    semestres do mais recente para o mais antigo.

Não há extração/persistência do cookie e não há backend nesse fluxo. Dados do
cartão também não entram em AsyncStorage. `Notas e matrícula` é um resumo da
consulta atual, não uma caixa de notificações. Expo Go não fornece o
background/push nativo, então a consulta é sempre foreground.

## Mobile device-sentinel nativo

É o alvo principal de privacidade porque o token não sai do aparelho.

### Cadastro

1. `NativeLoginScreen` abre o CAS e, quando escolhido, o IdP oficial gov.br em
   WebView; a navegação restante continua na allowlist da sessão.
2. O usuário digita credenciais na página oficial; o app lê apenas `UFGDNET` após
   o redirect.
3. SecureStore guarda o cookie no Keychain/Keystore como
   `AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY`, permitindo background após o primeiro
   desbloqueio sem sincronização entre devices.
4. O app cria/recupera um uid Firebase anônimo, solicita push, consulta turmas e
   registra `{pushToken, email?, turmas}`.
5. O snapshot já coletado vira baseline local hash-only, evitando evento falso no
   primeiro silent push.
6. O estado de registro é salvo em AsyncStorage e restaurado ao abrir novamente.

### Ciclo agendado

```text
Cloud Scheduler (07, 10, 13, 16, 19 e 22 h)
  -> seleciona até 3 devices elegíveis por turma
  -> deduplica: cada device recebe no máximo um wake por execução
  -> silent FCM {kind: "check"}
  -> device consulta todas as suas turmas
  -> compara com baseline local
  -> reporta {turmaCode, stateHash, events} quando há mudança
  -> Functions exige App Check, auth e vínculo com a turma
  -> quórum concorda em hash + eventos
  -> FCM visível para todos os membros
```

O recorte coletivo rehashes somente a flag `publicar`, que é comum à turma. Assim,
o push detecta avaliação nova e transição para publicada sem enviar valor. Faltas
e correções de valor já publicado são individuais e não entram nesse quórum.
Quando o app nativo está aberto, `onMessage` apresenta o alerta recebido; em
background, a notificação visível é entregue pelo sistema operacional.

Silent push é best-effort: iOS pode atrasar ou suprimir background, especialmente
após force-quit. Redundância melhora a chance, mas não cria garantia de horário.

### Confiança e abuso

- App Check usa Play Integrity/App Attest e bloqueia clientes simples forjados.
- `reportEvent` aceita apenas turmas registradas para o uid.
- Código de turma, hash e eventos têm limites e validação estrita.
- Quórum padrão é 2, reduzido ao número de devices elegíveis; nunca abaixo de 1.
- A transação em `lastHash` impede fan-out duplicado.
- Reports duram a janela de 30 minutos e são removidos após uso ou expiração.
- Firestore nega toda leitura/escrita direta do cliente.

O backend ainda confia que um app atestado consultou corretamente a UFGD. Provas
criptográficas de origem da resposta (zkTLS) não fazem parte do escopo.

### Dados no Firebase

| Coleção | Conteúdo |
|---|---|
| `users` | uid, push token, email opcional, turmas, consentimento e timestamps |
| `turmas` | uids membros, último hash e últimos eventos confirmados |
| `reports` | uid, turma, hash, eventos e timestamp temporários |

Eventos incluem nomes/rótulos acadêmicos, mas não incluem valor da nota, token,
CPF ou senha. Essa distinção deve permanecer explícita na política de privacidade.

## Self-host pessoal

`personal.py` recebe o token por ambiente, chama o core e salva `state.json` no
diretório configurado por `STATE_DIR`. Sem Resend, imprime eventos no console. É
o modo recomendado quando não há necessidade do app/Firebase.

## Servidor central opcional

O servidor central existe e funciona, mas não é zero-knowledge:

- usuário consente via `register.py add ... --consent`;
- token é cifrado por DEK aleatória com AES-GCM;
- DEK é cifrada pela `MASTER_KEY` (KEK); `MASTER_KEY_PREV` permite rotação;
- SQLite guarda usuários, tokens cifrados, membros e snapshots hash-only;
- o poller decifra o token em RAM, consulta e remove a referência local;
- falhas transitórias contam até cinco; auth inválida marca dead imediatamente;
- re-cadastro troca o blob e zera `fail_count`.

Risco residual: root com acesso à KEK e ao processo consegue obter tokens. Para
produção, use KMS/HSM, backups cifrados, logs mínimos e resposta a incidente.

## Limites e pendências

- CAS, Home e documentos oficiais do runtime Expo Go foram validados no iPhone;
  ainda faltam passagem completa das demais telas, outros tamanhos e expiração/relogin.
- Firebase real, Google Services, App Check e dev build ainda não foram testados
  ponta a ponta em device.
- Silent push precisa ser validado em iOS e Android físicos.
- O development build ainda abre o painel nativo de alertas separado do dashboard
  acadêmico completo; unificar os dois runtimes é trabalho pendente.
- A premissa de publicação simultânea deve ser testada com duas contas autorizadas
  da mesma turma.
- Resend, Docker/VPS e rotação operacional de chaves dependem do deploy.
- Disponibilidade e HTML do portal Cartão são externos e podem mudar.
