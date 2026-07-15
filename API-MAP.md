# Mapa da API acadêmica UFGD

Atualizado em 15/07/2026.

Base observada: `https://sigecad-academico.app.ufgd.edu.br`. Mapeamento feito
somente com conta própria e requisições GET. Rotas e schemas são não oficiais e
podem mudar sem aviso.

## Autenticação

- O cookie `UFGDNET` autentica os subdomínios usados pelo projeto.
- Sem sessão válida, o portal redireciona para o CAS em `login.app.ufgd.edu.br`.
- Trate o cookie como senha/bearer: nunca logue, commite ou envie a terceiros.
- O código bloqueia redirects para identificar sessão inválida e remove o destino
  da mensagem, pois URLs CAS podem conter tickets.

## Rotas REST observadas

| Rota | Parâmetro | Uso no projeto | Sensibilidade |
|---|---|---|---|
| `/rest/periodosletivos` | — | escolher período atual | baixa |
| `/rest/turmas` | `periodoLetivoID` | turmas, resultado, faltas e `matricula_id` | acadêmica |
| `/rest/notas` | `matriculaID` | avaliações e publicação | acadêmica alta |
| `/rest/faltas` | `matriculaID` | detalhamento de faltas | acadêmica |
| `/rest/matriculas` | `periodoLetivoID` | matrículas do período | acadêmica |
| `/rest/horarios` | `periodoLetivoID` | grade semanal | acadêmica |
| `/rest/planosensino` | `periodoLetivoID` | planos de ensino | acadêmica |
| `/rest/historico` | — | histórico completo | acadêmica alta |
| `/rest/estrutura` | — | currículo do curso | acadêmica |
| `/rest/chcursada` | — | cargas horárias | acadêmica |
| `/rest/cursadascursando` | — | IDs cursados/em curso | acadêmica |
| `/rest/dadosacademico` | — | cadastro pessoal | pessoal alta |
| `/rest/notificacoes` | — | mensagens do portal | pessoal |
| `/rest/perfis` | — | perfis/matrículas | pessoal |
| `/rest/cidades` | — | referência de cidades | pública/referência |
| `/rest/eventoscalendario` | — | calendário | variável |
| `/rest/pendenciasbiblioteca` | — | pendências; já apresentou 5xx | pessoal |
| `/rest/administrador/academicos` | — | rota administrativa; fora do escopo | proibida |

O produto usa apenas as três primeiras rotas. No Expo Go essa allowlist também é
aplicada pela ponte injetada, que aceita somente GET relativo de mesma origem e
IDs devolvidos pela sessão. As demais permanecem documentadas para entendimento
do portal, não como autorização para coleta.

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
