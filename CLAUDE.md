# CLAUDE.md — contexto do projeto

Leia e siga [AGENTS.md](AGENTS.md) antes de qualquer alteração. Ele é a fonte
canônica para regras de segurança, arquitetura, estrutura e comandos de validação.

## Resumo operacional

- Produto: notificador independente e somente leitura para a própria conta UFGD.
- Core: `sigecad.py`; nunca persiste valores de nota no snapshot.
- App: Expo SDK 54/React Native 0.81/React 19, com runtime Expo Go e runtime nativo.
- Expo Go: cookie fica na WebView privada, notas só em memória e snapshot hash-only.
- Nativo: token em SecureStore, Firebase device-sentinel, App Check, quórum e FCM.
- Backend principal: Firebase device-sentinel, App Check, quórum e FCM.
- Alternativas: `personal.py` (recomendado para self-host) e `server/` central cifrado.
- Idioma do código/documentação: português; nomes técnicos podem permanecer em inglês.

## Antes de editar

1. Leia o arquivo inteiro e os testes relacionados.
2. Preserve dados locais/privados: `raw/`, `state.json`, `.env`, bancos e imagens.
3. Não faça chamadas live à UFGD sem autorização; use fakes para testes.
4. Não altere IDs para explorar dados de terceiros.
5. Use `apply_patch` para edições e mantenha mudanças pequenas/revisáveis.

## Definição de pronto

```bash
python3 -m unittest discover -s tests -v
cd app && npm test && npm run typecheck
cd app && npm run doctor
cd ../functions && npm test
```

Atualize a documentação afetada e relate qualquer etapa que dependa de device,
Firebase, Resend, Docker ou disponibilidade externa em vez de fingir validação.
