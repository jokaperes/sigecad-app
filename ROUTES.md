# Índice de rotas observadas

Atualizado em 15/07/2026.

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

Páginas HTML observadas existem sob `/graduacao/consultar/`,
`/graduacao/imprimir/`, `/graduacao/relatorios/` e `/graduacao/solicitar/`.
O notificador não precisa navegar por elas.

## Cartão

Host: `cartao.app.ufgd.edu.br`.

```text
GET /cartoes_usuario/visualiza_pessoa
GET /cartoes_usuario/visualiza_estatus/<codigo>/<hash descobertos na própria página>
GET /cartoes_usuario/listagem_extrato_ru/<codigo>/<hash>
GET /cartoes_usuario/listagem_extrato_cantina/<codigo>/<hash>
GET /cartoes_usuario/listagem_extrato_ajax_ru?estatusId=<descoberto>&pagina=1
GET /cartoes_usuario/listagem_extrato_ajax_cantina?estatusId=<descoberto>&pagina=1
GET /foto/<hash descoberto na própria página>
```

`sigecad.py --show-card` descobre os links a partir da página autenticada. Nunca
aceita código/hash arbitrário por CLI.

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

## Respostas esperadas

- 2xx: resposta autenticada.
- 3xx para login, 401 ou 403: tratar como sessão inválida.
- 5xx: indisponibilidade externa; retry limitado e mensagem sem corpo/URL.
- Resposta inesperada/HTML alterado: falhar de modo seguro e atualizar parser/teste.
