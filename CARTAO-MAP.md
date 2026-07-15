# Portal Cartão UFGD

Host observado: `cartao.app.ufgd.edu.br`. Usa a mesma sessão UFGD. O suporte no
projeto é estritamente para consultar o cartão pertencente à conta autenticada.

## Fluxo implementado

1. Buscar `/cartoes_usuario/visualiza_pessoa`.
2. Extrair dessa página o link de status e seus `codigo/hash`.
3. Buscar status, extrato RU e extrato Cantina com os valores descobertos.
4. Extrair nome, curso, estado, via, número e saldos em memória.
5. Mascarar o cartão na saída, mostrando somente os quatro últimos dígitos.
6. Se solicitado, baixar a foto encontrada na própria página e salvá-la com `0600`.

```bash
export SIGECAD_TOKEN='UFGDNET=...'
python3 sigecad.py --show-card
python3 sigecad.py --show-card --photo-out /tmp/minha-foto.jpg
```

## Rotas observadas

| Rota | Conteúdo |
|---|---|
| `/inicio/welcome` | página inicial |
| `/cartoes_usuario/visualiza_pessoa` | cadastro e links pertencentes à sessão |
| `/cartoes_usuario/visualiza_estatus/<codigo>/<hash>` | estado e vias do cartão |
| `/cartoes_usuario/listagem_extrato_ru/<codigo>/<hash>` | extrato e saldo RU |
| `/cartoes_usuario/listagem_extrato_cantina/<codigo>/<hash>` | extrato e saldo Cantina |
| `/foto/<hash>` | foto original |
| `/foto/<hash>/<largura>/<altura>` | foto redimensionada |

## Segurança e privacidade

- Código/hash nunca vêm do usuário: são descobertos na página da própria sessão.
- Não testar combinações, recursos ou fotos de terceiros.
- Número completo, saldo e foto não entram no snapshot, banco ou logs.
- A foto deve ser salva fora do repositório; imagens estão ignoradas pelo Git.
- `raw/` contém capturas privadas usadas no desenvolvimento e não é documentação.
- Valores pessoais antigos foram removidos deste arquivo; saldos mudam e só uma
  consulta live autorizada pode ser chamada de atual.
- O portal já retornou 5xx. O cliente limita retries e mostra erro sanitizado.
