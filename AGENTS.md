# AGENTS.md — SIGECAD Alerta

Instruções obrigatórias para agentes e pessoas que alterarem este repositório.
Diretório esperado: `~/sigecad`.

## Objetivo

Notificar o próprio aluno quando o SIGECAD UFGD publicar ou alterar avaliações.
O projeto possui CLI/core Python, self-host, servidor central opcional, app Expo e
backend Firebase device-sentinel.

## Regras inegociáveis

1. Acesso somente à conta expressamente autorizada pelo usuário e somente por GET.
2. Nunca variar `matriculaID`, código, hash ou outro identificador para tentar ver terceiros.
3. Nunca persistir senha. Token/cookie só em env, Keychain/Keystore ou banco cifrado.
4. Nunca mostrar, registrar, commitar ou enviar tokens, cookies, CPF, fotos ou capturas privadas.
5. `raw/`, `state.json`, `.env`, bancos, credenciais Firebase e imagens são locais e ignorados.
6. Manter TLS verificado; nunca usar `verify=False` ou contexto SSL inseguro.
7. Consultas automáticas devem respeitar intervalo mínimo de 3600 s e jitter entre notas.
8. Alterações de privacidade, auth, storage, Firebase rules e fan-out exigem testes.
9. Achados de segurança devem ser documentados e reportados, nunca explorados.
10. Não afirmar que algo nativo/deploy foi validado sem device ou credenciais reais.
11. Não reativar o sentinela Firebase (`SENTINEL_ENABLED`) nem o servidor central
    no APK. Segurança e claims: [SECURITY.md](SECURITY.md).
12. Toda mudança no app mobile termina no mesmo trabalho: commit na branch local,
    recorte público em `main`, APK assinado e release no GitHub
    (`jokaperes/sigecad-app`). Não deixar alteração só na máquina.
13. A nota da GitHub release é texto público para quem baixa o APK. Descrever só
    a correção, no tom da 0.3.4. Nunca escrever lá ressalva de teste, emulador,
    conta UFGD, device, sessão do agente, nem "o aluno precisa instalar X".
    Isso fica no chat.

## Arquitetura vigente

### Mobile device-sentinel (alvo principal)

- WebView oficial UFGD obtém `UFGDNET`; a senha nunca chega ao código do app.
- Token salvo com SecureStore, acessível após o primeiro desbloqueio apenas neste device.
- Firebase guarda uid anônimo, push token, email opcional, códigos de turma e timestamps.
- Silent push acorda até três sentinelas por turma; pushes são deduplicados por device.
- O device consulta a UFGD, calcula snapshots hash-only e reporta
  `{turmaCode, stateHash, events}`.
- Eventos contêm rótulo da disciplina/avaliação, mas nunca o valor da nota.
- App Check + vínculo de turma + quórum de devices protegem o fan-out.
- Reports temporários são removidos após consenso ou quando expiram.
- O quórum coletivo usa somente criação/publicação da avaliação; não prometer
  faltas nem correção de valor já publicado no push nativo atual.

### Expo Go no iPhone/Android (visualização foreground)

- `App.tsx` detecta `StoreClient` com fallback `appOwnership` antes de carregar
  qualquer módulo Firebase/nativo.
- No Expo Go, a WebView começa no CAS oficial e mantém o redirect — inclusive o
  provedor oficial gov.br — dentro do app. O ticket CAS não dispara a ponte; o
  site do SIGECAD fica coberto até a sessão acadêmica estável. No Android,
  `setSupportMultipleWindows` permanece falso para que popup e `target=_blank`
  naveguem na mesma WebView. O SIGECAD ainda redireciona o CAS com
  `service=http://sigecad-academico...`; essa URL é reescrita para HTTPS antes de
  carregar, para o React Native não abrir o Chrome. O cookie permanece no cookie jar nativo para reabrir sem
  relogar; o JS nunca lê `UFGDNET`. `Sair da conta` apaga.
- Cookie, senha e `document.cookie` nunca atravessam a ponte React Native.
- A ponte acadêmica aceita somente a allowlist documentada em `API-MAP.md`, por
  GET relativo; IDs vêm sempre da própria sessão e a UI nunca fornece URL/caminho.
- Documentos oficiais usam links e IDs da própria sessão. O único redirect aceito sai do SIGECAD
  para `/gerar` no Webdoc oficial, com parâmetros estritos e nunca logados. Exigir
  GET, assinatura PDF e limite de 8 MB; o arquivo existe no cache somente durante
  a folha nativa e deve ser apagado no `finally`/startup. Planos usam somente o
  `peID` devolvido por `/rest/planosensino` no GET fixo de relatório; nunca aceitar
  ID, caminho ou URL livre da UI. A tela agrupa os planos por período, fixa o
  semestre atual primeiro e ordena os demais do mais recente para o mais antigo.
- A ponte Cartão deriva ID/hash da própria página e retorna foto validada, final
  mascarado, o número completo estritamente validado para Code 128, saldos e até
  40 movimentações por origem/página. Tudo fica em memória; nunca logar o número.
- Code 128 foi confirmado contra a impressão autenticada oficial em 16/07/2026;
  não substituir a simbologia nem persistir a URL privada usada pelo portal.
- Falhas da foto atravessam somente como enum sanitizado; o diagnóstico da UI
  contém exclusivamente estados e contagens, nunca identificadores ou valores.
- A foto compara original, 2048×2048, 1024×1024 e a variante autenticada indicada
  pelo portal, valida dimensões JPEG/PNG e escolhe a maior resolução real permitida;
  Cards e Barras são os padrões; as alternativas ficam em Personalização/Faltas.
- Respostas de notas, faltas, horários, matrícula, histórico, currículo, perfil e
  operações têm limite, protocolo e schema validados antes de chegar à UI.
- Notas/faltas ficam em memória; AsyncStorage recebe somente hash, flag e rótulo.
- Expo Go não promete push/background; o aluno atualiza ao abrir ou puxar a tela.
- A carga foreground reaproveita períodos e agrupa apenas GETs same-origin, com
  concorrência máxima quatro; a UI recebe o estado acadêmico inicial de forma atômica.
- A lista de períodos fica somente em memória por até cinco minutos. Cada bridge é
  instalado uma vez por documento WebView; chamadas seguintes injetam apenas o comando.
- Planos anteriores carregam em lotes de até quatro para não prender a emissão de PDF
  atrás de todo o histórico. PDF assinado valida tamanho e somente os cinco bytes `%PDF-`.
- Prioridade: identidade/período/agenda e primeiro desenho da Home, depois resumo
  RU/Cantina; foto/extratos e histórico/currículo/detalhes hidratam após.
  Não reintroduzir média simples como oficial.
- A foto não abre modal, mas mantém a seleção de maior resolução em memória.
  Copiar RGA exige toque explícito e não pode gerar log; o valor passa ao
  clipboard do sistema por solicitação do aluno.
- `MAT` é disciplina ativa. Somente `AP`, `RP`, `APE` e `RPF` encerram alertas de
  faltas, agenda e GET detalhado de faltas; notas/histórico continuam acessíveis.
- Refeições do cartão usam a moda dos débitos em memória para RU e R$ 2,00 fixos
  para Cantina; ambos calculam quantidade e a menor recarga sem sobra.
- Telemetria de desenvolvimento pode registrar somente etapa e duração; nunca
  URL, resposta, nome, RGA, nota, saldo ou credencial.
- A tela clara de login controla explicitamente a barra de status para manter
  contraste no tema escuro do Android; o dashboard autenticado retoma seu tema.
- Nunca deixar a WebView Android em tela cheia acima do dashboard, mesmo invisível:
  ela intercepta toques nativos. Android usa 2×2 fora da tela; iOS mantém a
  superfície completa necessária para não suspender navegação em background visual.
- Normalização de período, curso, disciplina e operação é exclusivamente visual;
  não modificar o valor bruto usado pela ponte. Próxima aula precisa indicar o dia,
  a sala e o intervalo completo (início–fim).

### Self-host

`personal.py` mantém o token na máquina do aluno, persiste `state.json` hash-only e
envia por Resend ou console. É o modo funcional com menor exposição.

### Central opcional

`server/` guarda tokens com envelope AES-256-GCM no SQLite e os decifra somente em
RAM durante o poll. Isso não é zero-knowledge: root + `MASTER_KEY` consegue acessar.
No Docker, `SIGECAD_DB_PATH=/app/server/data/data.db` aponta para o volume persistente.

## Fluxos importantes

```text
CLI/self-host: token -> períodos -> turmas -> notas -> hash snapshot -> diff -> alerta

Expo Go: CAS na WebView -> redirect same-WebView -> GET same-origin -> notas em RAM -> hash/diff local

Mobile nativo: CAS -> SecureStore -> snapshot/baseline local -> registro Firebase
        scheduler -> silent push -> snapshot local -> report + quórum -> push visível

Central: token cifrado -> decrypt em RAM -> snapshot -> SQLite hash-only -> Resend
```

## Estrutura mantida

- `sigecad.py`: fonte canônica Python; CLI `--show-grades`, `--show-card`, monitoramento.
- `personal.py`: execução pessoal e loop mínimo de 1h.
- `server/`: `auth.py`, `crypto.py`, `store.py`, `register.py`, `poller.py`, `notifier.py`.
- `tests/test_diff.py`: 24 testes Python.
- `app/App.tsx`: renderiza o dashboard acadêmico nos dois runtimes; o painel
  nativo de alertas só é montado com `google-services.json` real presente.
- `app/app.config.js`: omite Google Services ausentes no Expo Go e os inclui
  automaticamente quando os arquivos locais existem para build nativo.
- `app/src/expo-go/`: WebView privada, allowlist, validação e dados acadêmicos.
- `app/src/expo-go/design/`: telas acadêmicas, variantes e dark mode.
- `app/assets/brand/`: fontes oficiais UFGD/UFGDNet; origem e cores em `ASSETS.md`.
- `app/src/native/`: fluxo Firebase/push e login com cookie manager.
- `app/src/runtime/`: detecção do ambiente sem avaliar módulos incompatíveis.
- `app/src/core/`: port TypeScript do snapshot/diff.
- `app/src/ui/`: tema e componentes reutilizáveis.
- `app/src/storage/`: baseline hash-only e estado de registro.
- `functions/src/index.ts`: backend Firebase.
- `functions/src/policy.ts`: validação pura e quórum.
- `raw/`: material privado de pesquisa; nunca entra em entrega, commit ou imagem.

## Comandos antes de concluir mudanças

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

Se Docker estiver disponível, também execute `docker compose config --quiet` e um
build limpo. Nesta máquina, Docker pode não estar instalado.

## Estado automatizado verificado em 11/09/2026

- APK local 0.3.6: `assembleRelease` assinado com `app/sigecad-release.keystore`,
  arm64-v8a, R8 e libs compactadas. Login CAS permanece na WebView; o cliente
  Android bloqueia a entrega de URLs a navegadores externos, o redirect HTTP
  legado é reescrito para HTTPS e o site oficial é coberto até a sessão estável.
  Instalação sobre a 0.3.5, login completo e reabertura foram validados no AVD
  1440×3120/505 dpi sem iniciar navegador. Push/background seguem desativados
  até o projeto Firebase real.

- Python: 24/24 testes.
- App: 78/78 testes, TypeScript strict, bundles iOS/Android e Expo Doctor 18/18.
- Functions: build strict + 5/5 testes.
- Expo SDK 57 / React Native 0.86 / React 19.2 para compatibilidade com a
  versão mais recente do Expo Go (57.0.9+).
- Expo Doctor 21/21 e testes automatizados 78/78 validados.
- Firebase ainda precisa de projeto real, arquivos Google Services, App Check e device build.
- Resend e deploy central precisam de secrets externos.
- O portal de cartão pode retornar 5xx; tratar como indisponibilidade, sem retry agressivo.

## Documentação

Ao mudar código ou estrutura, atualize no mesmo trabalho `README.md`, o documento
específico do componente e este arquivo. `CLAUDE.md` deve continuar alinhado e
apontar para estas regras como fonte principal.
