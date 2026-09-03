# Índice de rotas observadas

Atualizado em 18/07/2026.

Este arquivo é o índice operacional. Schemas acadêmicos ficam em
[API-MAP.md](API-MAP.md); detalhes do cartão em [CARTAO-MAP.md](CARTAO-MAP.md).
Todas as observações foram feitas com conta própria. Não use este mapa para
enumerar pessoas, matrículas ou recursos.

## SIGECAD acadêmico

Host: `sigecad-academico.app.ufgd.edu.br`.

```text
GET /rest/periodosletivos
GET /rest/turmas?periodoLetivoID=<id>
GET /rest/notas?matriculaID=<id da própria sessão>
GET /rest/faltas?matriculaID=<id da própria sessão>
GET /rest/matriculas?periodoLetivoID=<id>
GET /rest/horarios?periodoLetivoID=<id>
GET /rest/planosensino?periodoLetivoID=<id>
GET /rest/historico
GET /rest/estrutura
GET /rest/chcursada
GET /rest/cursadascursando
GET /rest/dadosacademico
GET /rest/notificacoes
GET /rest/perfis
GET /rest/cidades
GET /rest/eventoscalendario
GET /rest/pendenciasbiblioteca
```

Também foram encontradas referências estáticas a visualizações de aproveitamento
de estudos, horas complementares/extensão, seleção de perfil e sessão expirada.
Elas estão catalogadas em [API-MAP.md](API-MAP.md); o app não as chama. A rota
`/rest/administrador/academicos` é conhecida e explicitamente proibida.

Atestado, histórico oficial e plano de ensino são descobertos a partir dos links
e IDs da própria sessão autenticada. Histórico e plano podem redirecionar por GET apenas
para `https://webdoc.app.ufgd.edu.br/gerar`, com parâmetros assinados estritamente
validados e nunca logados. O plano usa o caminho fixo
`/graduacao/relatorios/planoensino?peID=<id-da-sessão>`. Caminhos e IDs livres não
são aceitos como parâmetro da UI.

## Cartão

Host: `cartao.app.ufgd.edu.br`.

```text
GET /cartoes_usuario/visualiza_pessoa
GET /cartoes_usuario/visualiza_estatus/<codigo>/<hash descobertos na própria página>
GET /cartoes_usuario/listagem_extrato_ru/<codigo>/<hash>
GET /cartoes_usuario/listagem_extrato_cantina/<codigo>/<hash>
GET /cartoes_usuario/listagem_extrato_ajax_ru?estatusId=<descoberto>&pagina=<1..50>
GET /cartoes_usuario/listagem_extrato_ajax_cantina?estatusId=<descoberto>&pagina=<1..50>
GET /foto/<hash descoberto na própria página>
GET /foto/<hash>/<largura>/<altura>
GET /imagens/gerar_frente/<hash>
GET /cartoes_usuario/imprime_extrato_ru/<codigo>/<hash>
GET /cartoes_usuario/imprime_extrato_cantina/<codigo>/<hash>
```

`sigecad.py --show-card` descobre os links a partir da página autenticada. Nunca
aceita código/hash arbitrário por CLI.

Foram observadas ainda rotas POST/PUT para bloquear ou solicitar cartão. Elas são
documentadas em [CARTAO-MAP.md](CARTAO-MAP.md) exclusivamente para garantir que
permaneçam fora do cliente GET-only.

## Login CAS

Host: `login.app.ufgd.edu.br`.

```text
GET  /login       -> página e authenticity token
POST /login_form  -> credenciais enviadas diretamente à UFGD; emite UFGDNET
```

`server/auth.py` implementa esse fluxo localmente. Nos dois runtimes do app, a
WebView faz o login e o código nunca recebe a senha. No Expo Go, o cookie também
nunca sai da WebView; no build nativo ele é extraído depois do redirect e guardado
no SecureStore para possibilitar background.

O botão oficial “Entrar com gov.br” usa `sso.acesso.gov.br` durante a autenticação.
No app, essa navegação permanece na mesma WebView e retorna ao CAS; o IdP não é
origem de bridge nem recebe o cookie UFGDNET.

## Respostas esperadas

- 2xx: resposta autenticada.
- 3xx para login, 401 ou 403: tratar como sessão inválida.
- 5xx: indisponibilidade externa; retry limitado e mensagem sem corpo/URL.
- Resposta inesperada/HTML alterado: falhar de modo seguro e atualizar parser/teste.
