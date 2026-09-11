# Teste funcional do app

Este roteiro separa o que pode ser verificado automaticamente do que depende de
uma sessão real do aluno na UFGD. Use somente a sua própria conta e não publique
capturas com nome, RGA, foto, notas, saldos, cookie ou movimentações.

## 1. Verificação automática

Na raiz do app:

```bash
cd /Users/peres/sigecad/app
npm ci
npm run typecheck
npm test
npm run doctor
```

Resultado automatizado revalidado em 18/07/2026:

- TypeScript sem erros;
- 60/60 testes do app;
- Expo Doctor 18/18;
- nenhum teste deve imprimir cookie, senha, token ou dados acadêmicos reais.

Para validar também o restante do repositório:

```bash
cd /Users/peres/sigecad
python3 -m unittest discover -s tests -v

cd functions
npm test
```

Resultado esperado: 24/24 testes Python e 5/5 testes de Functions.

## 2. Abrir no iPhone ou Android com Expo Go

1. Instale/atualize o Expo Go no aparelho.
2. Deixe Mac e aparelho na mesma rede Wi-Fi.
3. Execute:

   ```bash
   cd /Users/peres/sigecad/app
   npm run start:go
   ```

4. Escaneie o QR exibido pelo terminal. No iPhone, também é possível abrir o
   endereço `exp://...` mostrado pelo Metro dentro do Expo Go.
5. Se a rede bloquear LAN, encerre o Metro e execute:

   ```bash
   npm run start:go -- --tunnel
   ```

6. Faça login somente na página oficial da UFGD exibida dentro da WebView. O
   CAS deve ser a primeira página; se usar “Entrar com gov.br”, o fluxo também
   deve permanecer no app, sem abrir o Chrome/Safari. O app não deve pedir que você
   cole cookie, token ou senha em tela própria.
7. Depois do redirect para o SIGECAD, o site oficial não deve aparecer. A tela
   “Entrando no SIGECAD…” cobre o WebView até a Home nativa. Antes do login, essa
   tela não deve aparecer nem deve haver consulta de períodos.

### Documentos acadêmicos

1. Abra `Perfil > Documentos acadêmicos`; a tela deve aparecer antes de baixar
   qualquer PDF e explicar itens bloqueados pela própria UFGD.
2. Toque em Histórico escolar. A folha nativa de compartilhar/salvar deve abrir.
   Atestado só fica ativo quando a UFGD o libera. Planos devem informar que a
   o plano usa o `peID` listado pela sessão, segue o redirect Webdoc e abre a folha nativa.
3. Para teste de privacidade, cancele a folha sem escolher aplicativo externo.
   O PDF temporário deve ser apagado mesmo no cancelamento.
4. Repita após encerrar/reabrir o Expo Go para confirmar que eventual arquivo
   deixado por interrupção é limpo. Nunca publique captura ou conteúdo do PDF.

### Android Emulator desta máquina

O AVD já criado é `SIGECAD_Pixel_8_API_36` e usa Pixel 8 ARM64/API 36. Com o Metro
na porta 8082, a sequência local é:

```bash
/opt/homebrew/share/android-commandlinetools/emulator/emulator @SIGECAD_Pixel_8_API_36
/opt/homebrew/share/android-commandlinetools/platform-tools/adb reverse tcp:8082 tcp:8082
/opt/homebrew/share/android-commandlinetools/platform-tools/adb shell am start -a android.intent.action.VIEW -d exp://127.0.0.1:8082 host.exp.exponent
```

Em 16/07/2026, Expo Go 54.0.8 abriu o CAS oficial, o teclado manteve o campo de
usuário visível, a orientação permaneceu retrato e os filtros `ReactNativeJS` e
`AndroidRuntime` não mostraram erros. O primeiro uso do teclado pode exibir o
tutorial de stylus do próprio Android; ele não pertence ao app. O emulador entrou
em renderização por software sob pressão de memória, então não use seus tempos
como benchmark do iPhone ou de um Android físico. A Home autenticada e o dark mode
foram validados; telas secundárias ainda exigem uma passagem manual estável.

Neste Android 16, `adb input tap` não acionou consistentemente os `Pressable` do
React Native. Para automação local, use o par explícito abaixo; isso é uma limitação
do input do AVD, não uma função do aplicativo:

```bash
adb shell input touchscreen -d 0 motionevent DOWN X Y
adb shell input touchscreen -d 0 motionevent UP X Y
```

Referência da primeira sessão autenticada no AVD, sob renderização por software:
Home acadêmica `1,88 s`, Home com saldos `2,90 s`, foto/extratos `3,21 s` e dados
secundários `5,36 s`. O bridge do resumo do Cartão consumiu `588 ms`; o restante
inclui navegação entre origens e resposta dos portais. Essa medição antecede a
remoção das notas do caminho crítico e é mantida como baseline de comparação.
Após a otimização, uma nova sessão limpa no mesmo AVD mediu Home acadêmica
`450 ms`, Home com saldos `1,27 s`, foto/extratos `1,51 s` e notas/dados antigos
`3,46 s`. Não use ciclos imediatamente após Fast Refresh como benchmark.

## 3. Checklist funcional com sessão real

### Login e sessão

- Confirme que o formulário é do domínio oficial da UFGD.
- Faça login e confira se a Home aparece sem expor cookie ou erro interno.
- Durante a primeira carga, deve aparecer o skeleton; a Home deve entrar de uma
  vez com identidade, período atual, agenda e saldos RU/Cantina.
- Foto e movimentações podem completar em segundo plano sem bloquear a Home.
  Notas e dados antigos devem hidratar depois, no mesmo lote acadêmico; abrir
  `Notas` após essa fase deve mostrar os valores normalmente.
- No Metro, compare as linhas `[SIGECAD tempo]`; elas devem conter apenas nome da
  etapa e milissegundos, nunca dados pessoais ou valores.
- Como referência limpa confirmada (iPhone/Expo Go, sessão autenticada,
  16/07/2026), foram medidos `home-academica: 826ms`,
  `saldo-prioritario: 1543ms`, `foto-e-extratos: 1679ms` e
  `dados-antigos: 3078ms`. Resultados reais variam conforme rede e disponibilidade
  dos portais UFGD.
- Como referência aquecida após as otimizações de 18/07/2026, três reloads
  consecutivos marcaram Home `228–271 ms`, cartão completo `918–1.017 ms` e
  secundários completos `2.579–2.647 ms`. Esses tempos chegam pelo Metro e não
  dependem do iPhone Mirroring.
- Puxe a Home para atualizar e confirme o estado de carregamento.
- Em Perfil, compare o progresso com a página oficial de Histórico. Depois da
  hidratação secundária, o app deve usar a razão total de `/rest/chcursada`, não
  o percentual resumido de `/rest/dadosacademico`.
- Abra `Perfil > Diagnóstico seguro`: turmas, notas, horários, faltas, histórico,
  estrutura, carga horária, matrícula, saldos, extratos, barcode e foto devem ter
  linhas próprias. O diagnóstico mostra somente estados e contagens.
- Saia e entre novamente.
- Se a sessão expirar, confira o sheet com `Entrar com UFGDNET` e
  `Continuar offline`; continuar offline deve manter a última visão em memória.

### Home e variantes

- Em `Perfil > Personalização`, alterne Início entre Cards, Lista e Agenda.
- Após esta atualização, confirme que a primeira Home aberta usa Cards.
- Confira nome, curso, período, aulas, faltas e saldos. Campo ausente no
  portal deve ficar ausente/indisponível, nunca receber valor inventado.
- O período deve aparecer como `AAAA/S`, curso/disciplinas não devem permanecer
  em caixa alta e a próxima aula deve indicar hoje, amanhã ou o dia da semana.
- Operações internas como `MATRICULAETAPA4` devem aparecer como
  `Matrícula · etapa 4`. Sem risco real, a Home não deve dizer “Atenção a faltas”.
- Confirme que o nome não aparece todo em caixa alta, que não existem faixas
  brancas fora do tema no topo/rodapé e que a Home não inventa “última nota”.
- Alterne tema claro, escuro e sistema; feche e reabra o app para confirmar que
  a preferência visual foi mantida.

### Notas, faltas e horários

- Abra cada disciplina em `Notas`; confira avaliações lançadas e sem nota.
- Compare uma disciplina com o portal oficial, incluindo notas e fórmula.
- Alterne Faltas entre Barras e Alertas e valide total, limite, datas e risco.
- Em `Horários`, confira cada dia, sala e intervalo com o portal.

### Cartão

- Confira foto, número mascarado e saldos separados de RU e Cantina.
- Toque na foto em Cartão e Perfil; nada deve abrir. A maior variante validada
  continua visível, sem texto técnico de resolução.
- Se o portal possui foto, ela deve aparecer mesmo quando o servidor envia MIME
  impreciso; o fallback de usuário só deve aparecer quando a imagem realmente falhar.
- O app deve comparar original, 2048×2048, 1024×1024 e a variante indicada pelo
  portal e usar a maior resolução real válida. Nenhum texto técnico de resolução
  deve aparecer na interface.
- Em Perfil, “Ingresso” não pode usar o semestre da última ocorrência. Para RGA
  numérico, deve combinar o ano do RGA com o primeiro período desse ano no histórico.
- Em Perfil, toque no RGA, cole em um campo de teste e confira o valor; o botão
  deve mudar para `Copiado` sem imprimir o RGA no Metro.
- Use uma disciplina com `MAT` e outra com `AP`, `RP`, `APE` ou `RPF`: apenas a
  `MAT` pode aparecer em Horários e Faltas. Ambas continuam disponíveis em Notas.
- Na Home em Cards, confirme que Cartão Acadêmico ocupa a largura inteira e mostra o
  código de barras. A impressão autenticada da UFGD foi identificada como Code
  128 e a sequência das barras coincide com a geração local. Faça ainda um teste
  físico no RU/Cantina, com a tela clara e o cartão físico disponível como reserva.
- Compare os débitos: RU deve refletir as refeições do extrato e Cantina deve usar
  R$ 2,00 por refeição. A recarga exata de ambos deve fechar um múltiplo sem sobra.
- Em uma disciplina sem nota final, o destaque deve ser `ÚLTIMA NOTA`; a Home
  não deve inventar `MÉDIA PARCIAL` nem reintroduzir contagem de publicações.
- Se a foto falhar, confira a mensagem sanitizada e toque `Tentar carregar foto`;
  o restante do cartão e do extrato deve continuar utilizável.
- Alterne RU/Cantina e compare as primeiras movimentações com o portal.
- Toque `Carregar mais`: a página seguinte deve ser anexada sem duplicatas.
- Ao chegar ao fim, o botão deve desaparecer; falha do
  portal deve mostrar mensagem segura e permitir nova tentativa.

### Telas adicionais e estados

- Em `Perfil`, abra Histórico, Grade do curso, Matrícula e Notas e matrícula.
- `Notas e matrícula` deve refletir somente a consulta atual; não deve parecer
  uma caixa de push nem prometer atualização com o app fechado.
- Abra `Diagnóstico seguro`: ele pode mostrar contagens e estados, mas nunca nome,
  RGA, disciplina, nota, saldo, URL, resposta bruta, cookie ou senha.
- Compare ao menos um semestre do histórico, carga horária e uma solicitação de
  matrícula com o portal.
- Valide skeleton, sessão expirada e portal indisponível nos estados reais do app.
- O Expo Go não deve mostrar configuração de push que não funciona nesse runtime.
- Teste `Apagar histórico local` e confirme que não apaga dados no portal UFGD.

## 4. Persistência e privacidade

- Feche completamente e reabra o Expo Go: tema/variante podem persistir, mas
  notas, foto, saldos e extrato não devem aparecer antes de nova sessão/carga.
- Desative a rede após uma carga e confira o aviso de cache sem corpo de erro 5xx.
- Não deve haver senha, cookie ou token nos logs do Metro.
- Screenshot do app está liberado. Para relatar um bug, oculte nome, RGA, foto,
  notas, valores e qualquer identificador.

## 5. O que o Expo Go não testa

Firebase, App Check, push, silent push e execução em segundo plano exigem um
development build com os arquivos Google Services e configuração Firebase. A
interface Expo Go não oferece uma permissão de push que esse runtime não possui.

Ao relatar um problema, informe: aparelho e versão do sistema, tela, ação feita,
resultado esperado, resultado obtido e uma captura sanitizada. Não envie cookie,
token, senha nem resposta bruta do portal.
