# Portal Cartão UFGD

Atualizado em 18/07/2026.

Host observado: `cartao.app.ufgd.edu.br`. Usa a mesma sessão UFGD. O suporte no
projeto é estritamente para consultar o cartão pertencente à conta autenticada.
O dashboard Expo Go agora usa essas rotas na mesma WebView privada para exibir
foto, cartão mascarado, Code 128, saldos e movimentações somente em memória.

## Fluxo implementado

1. Buscar `/cartoes_usuario/visualiza_pessoa`.
2. Extrair dessa página o link de status e seus `codigo/hash`.
3. Buscar status, extrato RU e extrato Cantina com os valores descobertos.
4. Extrair nome, curso, estado, via, número e saldos em memória.
5. Mostrar texto mascarado; manter o número completo validado (`6..24` dígitos)
   somente em memória para gerar Code 128 localmente, sem consultar `webdoc`.
6. No Expo Go, validar a assinatura dos bytes JPEG/PNG (o servidor pode enviar
   `Content-Type` impreciso), consultar somente o hash já devolvido pela própria
   página nas variantes original, 2048×2048, 1024×1024 e indicada pelo portal;
   ler dimensões reais e escolher a maior imagem válida dentro do limite da ponte.
7. Paginar os extratos com `pagina=1..50`, deduplicar movimentações e parar
   quando a página vier vazia ou repetida.
8. Classificar falhas da foto como ausente, URL inválida, HTTP, tamanho, assinatura,
   leitura ou renderização, sem retornar URL ou corpo; permitir retry na UI.
9. Na CLI, se solicitado, salvar a foto em arquivo privado com `0600`.

### Caminho rápido no Expo Go

`card-summary` encerra após pessoa/status e shells de saldo: devolve identidade,
final mascarado, valor do Code 128, RU e Cantina com foto `not-requested` e extratos vazios. Depois
da Home, `card` completa foto e AJAX de movimentações. Assim o saldo do RU não
espera download/conversão da imagem nem paginação.

O handshake pode ocorrer antes de o HTML terminar de montar. A ponte verifica o
link do cartão a cada 25 ms por até 1 s, sem aguardar imagens/CSS. A página geral
de status é opcional para erros HTTP/rede: os shells dedicados RU/Cantina e os
AJAX de extrato ainda são tentados. Auth e mudança de origem nunca usam fallback.

## Insights locais de saldo

- RU: usa a moda dos débitos recentes como custo observado, calcula
  `floor(saldo/custo)` e a menor recarga que deixa o saldo divisível pelo custo.
- Cantina: usa R$ 2,00 por refeição e calcula quantidade e recarga sem sobra.
- Recargas, créditos, entradas, estornos e devoluções são excluídos da amostra.
- O número completo do cartão e os cálculos ficam somente em memória.

## Código de barras

O número é extraído do status pertencente à sessão, validado e passado à UI sem
log ou persistência. `@bwip-js/react-native` gera Code 128 no aparelho, com barras
pretas, fundo branco e zona de silêncio. A URL de documento e seu hash não são
necessários e nunca devem ser copiados para código, testes ou documentação.

```bash
export SIGECAD_TOKEN='UFGDNET=...'
python3 sigecad.py --show-card
python3 sigecad.py --show-card --photo-out /tmp/minha-foto.jpg
```

## Rotas GET observadas

Todos os `<estatusId>`, `<codigo>` e `<hash>` abaixo são extraídos de links da
própria página autenticada; nenhum é aceito da UI ou enumerado.

| Rota | Conteúdo | Uso |
|---|---|---|
| `/inicio/welcome` | página inicial | navegação observada |
| `/cartoes_usuario/visualiza_pessoa` | cadastro e links da sessão | usado |
| `/cartoes_usuario/visualiza_estatus/<codigo>/<hash>` | estado e vias do cartão | usado |
| `/cartoes_usuario/listagem_extrato_ru/<codigo>/<hash>` | saldo e shell do extrato RU | usado |
| `/cartoes_usuario/listagem_extrato_cantina/<codigo>/<hash>` | saldo e shell do extrato Cantina | usado |
| `/cartoes_usuario/listagem_extrato_ajax_ru?dataInicio=&dataFim=&estatusId=<estatusId>&pagina=<n>` | página JSON RU | usado, `n=1..50` |
| `/cartoes_usuario/listagem_extrato_ajax_cantina?dataInicio=&dataFim=&estatusId=<estatusId>&pagina=<n>` | página JSON Cantina | usado, `n=1..50` |
| `/foto/<hash>` | foto original | usado |
| `/foto/<hash>/<largura>/<altura>` | foto redimensionada | 2048/1024 e variante do portal são comparadas por pixels |
| `/imagens/gerar_frente/<hash>` | imagem da frente do cartão | descoberto; não usado |
| `/cartoes_usuario/imprime_extrato_ru/<codigo>/<hash>` | impressão RU | descoberto; não usado |
| `/cartoes_usuario/imprime_extrato_cantina/<codigo>/<hash>` | impressão Cantina | descoberto; não usado |
| `/cartoes_usuario/prepara_impressao?...` | preparação do cartão | descoberto; não usado |
| `https://sistemas.ufgd.edu.br/webdoc/gerar?documento=Cartao&...` | documento do cartão | descoberto; não usado |

Resposta AJAX minimizada pelo app:

```text
{ Extrato: [{data, hora, tipo, valor, convenioNome}, ...] }
```

## Rotas mutáveis encontradas e bloqueadas

| Rota | Método observado | Decisão |
|---|---|---|
| `/cartoes_usuario/bloqueia?...&x-http-method-override=PUT` | POST/PUT | nunca chamar; altera o cartão |
| `/cartoes_usuario/solicita_novo_cartao` | POST | nunca chamar; cria solicitação |

O app mantém uma política GET-only. As rotas mutáveis são catalogadas para evitar
uso acidental, não para serem exploradas ou implementadas.

## Segurança e privacidade

- Código/hash nunca vêm do usuário: são descobertos na página da própria sessão.
- Não testar combinações, recursos ou fotos de terceiros.
- Número completo, saldo e foto não entram no snapshot, banco ou logs.
- No Expo Go, a UI recebe somente os quatro últimos dígitos; foto, saldos e
  extratos não entram no AsyncStorage.
- O estado da foto é um enum sanitizado; mensagens de falha não contêm endereço,
  hash, status interno ou conteúdo retornado pelo portal.
- O nome é normalizado visualmente (`NOME SOBRENOME` → `Nome Sobrenome`) sem
  alterar o valor recebido nem persistir uma cópia.
- A foto deve ser salva fora do repositório; imagens estão ignoradas pelo Git.
- `raw/` contém capturas privadas usadas no desenvolvimento e não é documentação.
- Valores pessoais antigos foram removidos deste arquivo; saldos mudam e só uma
  consulta live autorizada pode ser chamada de atual.
- O portal já retornou 5xx. O cliente limita retries e mostra erro sanitizado.
- Falha isolada dos shells/AJAX de RU ou Cantina retorna aquele conjunto vazio;
  não derruba identidade, foto nem a outra origem. Auth/origem seguem obrigatórias.
