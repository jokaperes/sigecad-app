# Mapa da API acadêmica UFGD

Atualizado em 18/07/2026.

Base observada: `https://sigecad-academico.app.ufgd.edu.br`. Mapeamento feito
somente com conta própria e requisições GET. Rotas e schemas são não oficiais e
podem mudar sem aviso.

## Autenticação

- O cookie `UFGDNET` autentica os subdomínios usados pelo projeto.
- Sem sessão válida, o portal redireciona para o CAS em `login.app.ufgd.edu.br`.
- No app, o botão oficial gov.br passa por `sso.acesso.gov.br` dentro da mesma
  WebView e retorna ao CAS; essa origem participa apenas da autenticação e não da
  bridge acadêmica.
- Trate o cookie como senha/bearer: nunca logue, commite ou envie a terceiros.
- O código bloqueia redirects para identificar sessão inválida e remove o destino
  da mensagem, pois URLs CAS podem conter tickets.

## Catálogo REST conhecido

“Conhecido” significa encontrado no JavaScript oficial ou observado em uma
resposta da própria conta. Não significa uma lista completa de toda a API do
servidor. Rotas não usadas não são sondadas apenas para confirmar existência.

| Método e rota | Parâmetro | Estado | Conteúdo/sensibilidade |
|---|---|---|---|
| `GET /rest/periodosletivos` | — | usado no app | períodos; baixa |
| `GET /rest/turmas` | `periodoLetivoID` da sessão | usado no app | turmas, resultado, faltas e `matricula_id`; acadêmica |
| `GET /rest/notas` | `matriculaID` da sessão | usado no app | avaliações e publicação; acadêmica alta |
| `GET /rest/faltas` | `matriculaID` da sessão | usado no app | datas detalhadas; acadêmica |
| `GET /rest/matriculas` | `periodoLetivoID` da sessão | usado no app | situação de matrícula; acadêmica |
| `GET /rest/horarios` | `periodoLetivoID` da sessão | usado no app | grade semanal; acadêmica |
| `GET /rest/historico` | — | usado no app | histórico completo; acadêmica alta |
| `GET /rest/estrutura` | — | usado no app | currículo; acadêmica |
| `GET /rest/chcursada` | — | usado no app | cargas horárias; acadêmica |
| `GET /rest/cursadascursando` | — | usado no app | IDs cursados/em curso; acadêmica |
| `GET /rest/dadosacademico` | — | usado com minimização | cadastro pessoal; pessoal alta |
| `GET /rest/notificacoes` | — | usado com minimização | operações/janelas; pessoal |
| `GET /rest/planosensino` | `periodoLetivoID` | fixture observado; candidato | lista de planos; acadêmica |
| `GET /rest/pendenciasbiblioteca` | — | fixture observado; não usado | status/mensagem; pessoal |
| `GET /rest/perfis` | — | fixture observado; não usado | perfis, documentos e hashes; pessoal crítica |
| `GET /rest/cidades` | consulta do portal | fixture observado; não usado | referência de cidades |
| `GET /rest/eventoscalendario` | não confirmado | resposta vazia observada | calendário; schema ainda não comprovado |
| `GET /rest/administrador/academicos` | — | **proibido** | rota administrativa fora do escopo |

O Expo Go usa períodos, turmas, notas, faltas, matrículas, horários, histórico,
estrutura, carga horária cursada, IDs cursados/em curso, dados acadêmicos e
notificações. Essa allowlist é aplicada pela ponte injetada, que aceita somente
GET relativo de mesma origem. `periodoLetivoID` e `matriculaID` são sempre valores
devolvidos pela própria sessão; a UI não fornece URL, caminho, hash ou ID livre.

`perfis`, `eventoscalendario`, `cidades` e `pendenciasbiblioteca` permanecem fora
da allowlist de produção até existir uma tela necessária, schema não vazio e
minimização testada. `planosensino` entrou na allowlist para a tela Documentos,
com `{id, codigo, disciplina}` e IDs registrados pela própria sessão. A rota administrativa
continua explicitamente proibida.

## Ordem de prioridade no app

A ordem abaixo é a ordem efetiva de execução. Ela evita que dados antigos
bloqueiem saldo, identidade ou informações do período atual.

| Prioridade | Chamadas | Motivo / momento de exibição |
|---|---|---|
| P0 sessão | `periodosletivos` | valida a sessão uma vez; a resposta é reaproveitada |
| P1 identidade | `dadosacademico` | nome, curso e RGA enquanto a WebView já está no SIGECAD |
| P2 período atual | `turmas` | disciplinas e faltas totais sem esperar pelas notas |
| P2 agenda | `horarios` e `notificacoes` | aula atual/próxima e janela de matrícula no mesmo lote acadêmico |
| P2 pintura Home | — | identidade, disciplinas e agenda aparecem antes de qualquer troca de origem |
| P3 cartão-resumo | pessoa, status, número e shells RU/Cantina | hidrata saldo e Code 128 sem bloquear o primeiro desenho |
| P4 cartão completo | AJAX RU/Cantina e foto | foto e movimentações hidratam depois da Home |
| P5 notas/histórico | `notas` e `historico` | notas, ingresso e histórico, no mesmo lote acadêmico secundário |
| P5 estrutura | `estrutura`, `chcursada`, `cursadascursando` | grade e progresso; `chcursada` é a fonte prioritária do percentual |
| P5 detalhes | `faltas` por matrícula e `matriculas` | datas de faltas e solicitações detalhadas |
| Sob demanda | `planosensino` + links oficiais descobertos no menu | catálogo; histórico e plano seguem redirect assinado para Webdoc; plano usa GET fixo com `peID` da sessão |

O código do cartão foi comparado em 16/07/2026 com a visualização autenticada de
impressão da própria conta. A simbologia oficial é Code 128: a contagem e a
sequência completa de larguras das barras coincidiram com a saída local do
`@bwip-js/react-native`. O app usa somente o número retornado para a conta
autenticada, mantém o valor completo em memória e não persiste a URL privada de
impressão.

P1/P2 são carregados sob o skeleton e publicados juntos na Home. Agrupar primeiro
as chamadas acadêmicas evita a troca acadêmico → cartão → acadêmico. P3/P4/P5
atualizam foto e telas secundárias em segundo plano.

“Média parcial” não existe como campo geral confiável nestas respostas. O app
não calcula média aritmética de avaliações (P1, P2 e afins), pois fórmulas e
pesos variam. A tela Notas mostra a nota final oficial quando existir ou a última
nota disponível, devidamente rotulada. A tela Histórico mostra a média das notas
finais oficiais (`nota` com `avaliacao` diferente de conceito), separada por
OBR, OPT e ELT. A Home em Cards prioriza o Cartão Acadêmico expandido.

Resultados de matrícula são interpretados por allowlist: `MAT` continua ativo;
`AP`, `RP`, `APE` e `RPF` encerram agenda/alerta/consulta detalhada de faltas. Um
resultado desconhecido permanece visível para evitar ocultação indevida.

## Schemas usados

`GET /rest/periodosletivos` retorna uma lista semelhante a:

```text
id, ano, semestre, nome, data_inicio, data_fim
```

`GET /rest/turmas?periodoLetivoID=<id>` retorna uma lista com:

```text
id, matricula_id, codigo, disciplina, turma, faltas, limite_faltas,
resultado, tem_notas, ch_total, avaliacao, plano_ensino_id
```

`GET /rest/notas?matriculaID=<id retornado pela sessão>` retorna:

```text
media_aprovacao, nota_fechada, formula, nota_final,
notas: [{ variavel_id, nota_id, nome, descricao, valor, publicar, ordem }]
```

O cliente nunca inventa um `matriculaID`: usa somente o valor devolvido em suas
próprias turmas. O snapshot não guarda `valor`; guarda hash de `valor|publicar` no
modo individual e hash de `publicar` no modo sentinela.

As telas adicionais validam e mantêm somente em memória os campos necessários:

```text
/rest/faltas       -> [{mes, faltas: [{data, hora, id}]}]
/rest/horarios     -> faixas com segunda..sabado e aulas/local/professor
/rest/matriculas   -> código, disciplina, turma, situação, etapa e datas
/rest/historico    -> períodos com disciplina, tipo, avaliação, carga, nota, faltas e resultado
/rest/estrutura    -> curso, faculdade, estrutura e disciplinas da grade
/rest/chcursada    -> cargas obrigatória, optativa, extensão e total
/rest/cursadascursando -> IDs de disciplinas cursadas/em curso
/rest/dadosacademico    -> somente nome, RGA, curso, faculdade, situação e progresso
/rest/notificacoes      -> janelas/etapas de matrícula
/rest/planosensino      -> [{id, codigo, disciplina}]
/rest/pendenciasbiblioteca -> {status, mensagem}
/rest/cidades           -> [{id, text, value}]
```

`/rest/perfis` devolve mais campos do que a UI precisa, incluindo identificadores,
documento e hashes. Por minimização, não atravessa a ponte. O fixture de
`/rest/eventoscalendario` estava vazio; nenhum schema é inventado a partir disso.

## Páginas/arquivos encontrados no JavaScript acadêmico

Estas rotas são referências estáticas do frontend, não chamadas do app:

| Rota | Classe | Decisão |
|---|---|---|
| `/graduacao/solicitar/aproveitamentoestudos/listagem` | listagem AJAX | descoberta; não usada |
| `/graduacao/solicitar/aproveitamentoestudos/visualizar/<id>` | visualização | descoberta; não enumerar IDs |
| `/graduacao/solicitar/horascomplementares/visualizar/<id>` | visualização | descoberta; não enumerar IDs |
| `/graduacao/solicitar/horasextensao/visualizar/<id>` | visualização | descoberta; não enumerar IDs |
| `/graduacao/solicitar/horasextensao/arquivo` | arquivo | descoberta; parâmetros não confirmados |
| `/perfis/selecionar` | troca de perfil | mutável/fora do app |
| `/administrador/selecionar` | seleção administrativa | proibida |
| `/errors/expirada.html` | estado de sessão | somente detecção de expiração |

Endereço, documentos, telefones, filiação e demais campos pessoais que possam
existir em `dadosacademico` são descartados pelo parser e nunca entram no estado
da UI, AsyncStorage ou logs.

## Falhas observadas e limites éticos

- Algumas rotas já retornaram detalhes internos em respostas 5xx. O cliente não
  reproduz o corpo nos logs.
- IDs numéricos podem sugerir risco de controle de acesso. Não variar nem testar
  IDs de terceiros. Uma verificação só deve ocorrer em ambiente/autorização UFGD.
- Uma rota administrativa respondeu acesso negado; não há motivo para retestá-la.
- O comportamento de sessão observado não é garantia de validade futura. Sempre
  tratar redirect/401/403 como necessidade de novo login.

As páginas HTML, CAS e cartão estão resumidos em [ROUTES.md](ROUTES.md) e
[CARTAO-MAP.md](CARTAO-MAP.md).
