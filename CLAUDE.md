# CLAUDE.md — contexto do projeto

Leia e siga [AGENTS.md](AGENTS.md) antes de qualquer alteração. Ele é a fonte
canônica para regras de segurança, arquitetura, estrutura e comandos de validação.

## Resumo operacional

- Produto: notificador independente e somente leitura para a própria conta UFGD.
- Core: `sigecad.py`; nunca persiste valores de nota no snapshot.
- App: Expo SDK 57/React Native 0.86/React 19.2, com runtime Expo Go e runtime nativo.
- Expo Go: CAS, redirect e cookie ficam na mesma WebView privada; notas, faltas detalhadas, horários,
  matrícula, histórico, currículo, perfil, foto, saldos e extratos ficam só em
  memória e o snapshot acadêmico é hash-only.
- Carga inicial: reaproveita períodos, usa lotes GET same-origin limitados a quatro
  e publica a Home acadêmica antes de buscar cartão; telas secundárias hidratam depois.
- A carga inicial conclui identidade + período atual + agenda, desenha a Home e então
  hidrata o resumo RU/Cantina; foto/extrato vêm depois. Notas ficam fora do caminho crítico
  e compartilham a volta acadêmica com histórico, currículo e faltas. Snapshot
  parcial de notas nunca substitui o baseline hash-only completo.
  Não existe “média parcial” geral calculada: mostrar a nota final oficial ou a
  última nota disponível, com o rótulo correto.
- Design: IBM Plex, telas do `SIGECAD.dc.html`, variantes de Início/faltas
  selecionáveis, tema claro/escuro, safe areas temáticas, nome normalizado e
  notas sem placeholder em `app/src/expo-go/design/`; inclui ainda diagnóstico
  agregado sem valores pessoais, foto original com fallback sanitizado, Cards
  padrão, comparação Barras/Alertas em Faltas, foto em alta resolução não
  interativa, RGA copiável e Cartão expandido com Code 128 local confirmado
  contra a impressão autenticada oficial,
  refeições restantes e recarga exata para RU/Cantina.
- Documentos: histórico segue somente o redirect assinado estrito para o Webdoc
  oficial, sem logar URL/hash; PDF tem limite de 8 MB e o cache temporário é
  removido após compartilhar. Atestado respeita o bloqueio da UFGD e o formulário
  Planos usam somente `peID` devolvido pela sessão em GET fixo; IDs livres são recusados.
- Performance visual: manter imports por peso da IBM Plex e por arquivo da Lucide;
  importar os barrels completos volta a incluir catálogos inteiros no bundle.
- Android Expo Go: o fluxo público foi validado em Pixel 8 ARM64/API 36; login,
  teclado, orientação, Home autenticada e tema escuro funcionam. A WebView oculta
  usa superfície desenhável de 2×2 px atrás da UI e fora do toque no Android,
  evitando que trocas de origem sejam suspensas; no iOS usa superfície completa.
  Múltiplas janelas ficam desativadas no Android. O cliente nativo da WebView
  bloqueia a entrega de URLs para navegadores externos e limita a navegação aos
  hosts oficiais. O service HTTP legado do SIGECAD é reescrito para HTTPS.
- Progresso do curso: preferir os totais de `/rest/chcursada` da tela de Histórico;
  `percentual_concluido` de `dadosacademico` é somente fallback inicial.
- Hidratação secundária: nunca apresentar vazio como resultado enquanto notas,
  histórico, grade, matrícula ou datas de faltas ainda carregam. Diagnóstico seguro
  deve cobrir cada conjunto, saldos/extratos/barcode/foto apenas por estado/contagem.
- Exibição acadêmica normaliza período, curso, disciplina e etapa de matrícula sem
  alterar o payload. Próxima aula deve informar hoje/amanhã/dia, sala e o intervalo
  completo, respeitando o fim real inclusive na virada da semana.
- Marca: fontes oficiais, vetores, cores e derivações ficam documentados em
  `ASSETS.md`; não substituir arquivos oficiais por upscale do favicon 16×16.
- Nativo: token em SecureStore, Firebase device-sentinel, App Check, quórum e FCM.
- Push nativo atual: avaliação nova/publicação somente; não promete faltas nem
  correção de valor já publicado. Expo Go mostra apenas dados atuais em foreground.
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
