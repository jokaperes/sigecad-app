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

### Expo Go no iPhone (visualização foreground)

- `App.tsx` detecta `StoreClient` antes de carregar qualquer módulo Firebase/nativo.
- Login ocorre na página oficial dentro de uma WebView `incognito` restrita à UFGD.
- Cookie, senha e `document.cookie` nunca atravessam a ponte React Native.
- A ponte aceita somente períodos, turmas e notas, por GET relativo de mesma origem.
- Respostas têm limite, protocolo e schema validados antes de chegar à UI.
- Notas/faltas ficam em memória; AsyncStorage recebe somente hash, flag e rótulo.
- Expo Go não promete push/background; o aluno atualiza ao abrir ou puxar a tela.

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

Expo Go: CAS na WebView -> GET same-origin -> notas em RAM -> hash/diff local

Mobile nativo: CAS -> SecureStore -> snapshot/baseline local -> registro Firebase
        scheduler -> silent push -> snapshot local -> report + quórum -> push visível

Central: token cifrado -> decrypt em RAM -> snapshot -> SQLite hash-only -> Resend
```

## Estrutura mantida

- `sigecad.py`: fonte canônica Python; CLI `--show-grades`, `--show-card`, monitoramento.
- `personal.py`: execução pessoal e loop mínimo de 1h.
- `server/`: `auth.py`, `crypto.py`, `store.py`, `register.py`, `poller.py`, `notifier.py`.
- `tests/test_diff.py`: 24 testes Python.
- `app/App.tsx`: seleciona Expo Go ou native build por capacidade do runtime.
- `app/app.config.js`: omite Google Services ausentes no Expo Go e os inclui
  automaticamente quando os arquivos locais existem para build nativo.
- `app/src/expo-go/`: WebView privada, ponte allowlist, validação e UI de notas.
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

## Estado verificado em 15/07/2026

- Python: 24/24 testes.
- App: 24/24 testes, TypeScript strict e Expo Doctor 18/18.
- Functions: build strict + 5/5 testes.
- Expo SDK 54 / React Native 0.81 / React 19 para compatibilidade com o Expo Go
  físico disponível durante a transição de SDK.
- Firebase ainda precisa de projeto real, arquivos Google Services, App Check e device build.
- Resend e deploy central precisam de secrets externos.
- O portal de cartão pode retornar 5xx; tratar como indisponibilidade, sem retry agressivo.

## Documentação

Ao mudar código ou estrutura, atualize no mesmo trabalho `README.md`, o documento
específico do componente e este arquivo. `CLAUDE.md` deve continuar alinhado e
apontar para estas regras como fonte principal.
