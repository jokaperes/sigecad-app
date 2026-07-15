# Arquitetura do SIGECAD Alerta

Atualizado em 14/07/2026. Este documento descreve o código existente; itens que
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
               ┌─────────┴──────┐  ┌────┴───────────┐
               │ app no device  │  │ Python local   │
               │ token seguro   │  │ ou central     │
               │ hash + diff    │  │ hash + diff    │
               └───────┬────────┘  └──────┬─────────┘
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

## Mobile device-sentinel

É o alvo principal de privacidade porque o token não sai do aparelho.

### Cadastro

1. `LoginScreen` abre exclusivamente domínios `ufgd.edu.br` em WebView.
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

- Firebase real, Google Services, App Check e dev build ainda não foram testados
  ponta a ponta em device.
- Silent push precisa ser validado em iOS e Android físicos.
- A premissa de publicação simultânea deve ser testada com duas contas autorizadas
  da mesma turma.
- Resend, Docker/VPS e rotação operacional de chaves dependem do deploy.
- Disponibilidade e HTML do portal Cartão são externos e podem mudar.
