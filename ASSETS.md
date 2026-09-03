# Assets e identidade visual UFGD

Atualizado em 15/07/2026. O projeto é independente e não oficial. O uso da marca
serve para identificar a integração com serviços da UFGD e não representa
endosso institucional.

## Fontes oficiais

- Página da ACS: <https://portal.ufgd.edu.br/secao/identidade-visual/index>
- Logotipos: <https://portal.ufgd.edu.br/secao/identidade-visual/logotipos>
- Manual: <https://files.ufgd.edu.br/arquivos/arquivos/78/IDENTIDADE-VISUAL/Identidade%20Visual/Manual%20de%20Identidade%20Visual%20da%20UFGD.pdf>
- UFGDNet legado: `https://ufgdnet.ufgd.edu.br/imagens/ufgdnet.ico`
- Logo usada pelo portal Cartão: `https://files.ufgd.edu.br/arquivos/ufgd-imagens/logo_ufgdnet_prod.png`

Os arquivos principais foram baixados da pasta pública “Logotipo UFGD” ligada
pela própria página da ACS. Nenhuma imagem privada ou autenticada foi usada.

## Arquivos locais

| Arquivo | Formato/tamanho | Uso |
|---|---|---|
| `app/assets/brand/ufgd-logo-curves.eps` | EPS vetorial, 3,2 MB | fonte de máxima qualidade |
| `app/assets/brand/ufgd-logo-curves.pdf` | PDF vetorial, 3 páginas | fonte de máxima qualidade/consulta |
| `app/assets/brand/ufgd-logo-color.png` | PNG 842×595 | assinatura colorida oficial |
| `app/assets/brand/ufgd-logo-positive.png` | PNG 842×595 | assinatura monocromática positiva |
| `app/assets/brand/ufgd-logo-negative.png` | PNG 842×595 | assinatura monocromática negativa |
| `app/assets/brand/ufgd-symbol-color-1024.png` | PNG 1024×1024 | recorte do símbolo permitido pelo manual |
| `app/assets/brand/ufgd-symbol-negative-1024.png` | PNG 1024×1024 | símbolo para superfícies escuras/verdes |
| `app/assets/brand/app-icon-source.svg` | SVG 1024×1024 | composição reproduzível do ícone do app |
| `app/assets/app-icon.png` | PNG 1024×1024 | ícone Expo, gerado do símbolo oficial |
| `app/assets/brand/ufgdnet-logo.png` | PNG 160×49 | logo legado publicada pelo UFGDNet |
| `app/assets/brand/ufgdnet-official.ico` | ICO 16×16 | favicon legado original |
| `app/assets/ufgdnet-icon.png` | PNG 16×16 | cópia compatível do favicon legado |

O UFGDNet legado só disponibiliza publicamente o favicon em 16×16 e o lockup em
160×49. Eles foram preservados no tamanho original; não são chamados de “alta
resolução”. Para superfícies atuais, o app usa a marca oficial vetorial de 2022.

## Padrão cromático oficial

Segundo o Manual de Identidade Visual:

| Uso | RGB | Hex | CMYK | Pantone |
|---|---|---|---|---|
| Verde claro | 200, 212, 0 | `#C8D400` | 30, 0, 100, 0 | 382 |
| Verde institucional | 116, 151, 25 | `#749719` | 50, 0, 100, 30 | 384 |

A tipografia da assinatura oficial é Montserrat Medium. A interface do app usa
IBM Plex por decisão do projeto de design; isso não altera os arquivos de marca.
O verde profundo `#174F3D` pertence ao sistema visual do app, não ao padrão
cromático oficial da assinatura UFGD.

## Derivações e integridade

O manual permite o uso isolado do símbolo. Os PNGs de símbolo são recortes sem
redesenho da assinatura oficial; `app-icon-source.svg` apenas aplica o símbolo
negativo sobre `#749719`. Não estique, rotacione ou troque as cores da marca.

Para revalidar formato e dimensões:

```bash
find app/assets/brand -maxdepth 1 -type f -exec file {} \;
file app/assets/app-icon.png
```
