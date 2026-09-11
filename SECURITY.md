# Auditoria de segurança — SIGECAD Alerta

Atualizado em 21/08/2026. Este documento descreve o modelo de ameaça, os
fluxos de dados reais e as propriedades que o código **atual** sustenta.
Não substitui revisão humana nem prova proteção contra um aparelho já
comprometido.

O build de produção monta somente o dashboard acadêmico em WebView
(`app/App.tsx` → `ExpoGoApp`). O sentinela Firebase e o servidor central
multi-conta estão desativados ou isolados e **não** fazem parte da
superfície de confiança do APK.

## Modelo de ameaça

Severidade considera impacto na confidencialidade do aluno. Explorabilidade
considera o código inspecionado neste repositório.

| ID | Ameaça | Severidade | Explorabilidade | Mitigação atual | Residual |
|---|---|---|---|---|---|
| T1 | Desenvolvedor/maintainer malicioso publica APK adulterado | Crítica | Alta se o usuário instala APK sem verificar origem | Assinatura release local; usuário precisa da keystore para atualizar | Não há transparência reproduzível de build. Um update malicioso futuro com a mesma keystore vence o usuário. |
| T2 | Extração da senha UFGDNet pela ponte JS / app | Crítica | Baixa no APK atual | Senha só no CAS HTTPS; JS de ponte não é injetado na origem de login; allowlist exata; `document.cookie` ausente da ponte | XSS no portal oficial da UFGD ainda pode ler o DOM da senha **dentro da WebView**. O app não recebe esses campos. |
| T3 | Cookie `UFGDNET` atravessa para React Native, Python, Firebase ou logs | Crítica | O caminho nativo antigo extraía o cookie; esse caminho está desligado | `NativeLoginScreen` não chama CookieManager; `App.tsx` não importa `NativeApp`; ponte recusa payload com `UFGDNET=` | Código nativo legado ainda existe no repo. Reativá-lo reabre T3. |
| T4 | Servidor central: operador lê token em claro no poll | Crítica | Certa, por desenho | Modo `central` só sobe com profile Docker explícito; aviso no boot; **não é zero-knowledge** | Quem opera o processo vê o token. Não use este modo. |
| T5 | Firebase/sentinela: turmas, hashes, rótulos, push token e IP | Alta | Certa se habilitado | `SENTINEL_ENABLED = false`; `FirebaseInitProvider` removido; App.tsx não importa Firebase JS | Dependências nativas Firebase ainda podem ser autolinkadas. Sem provider, não há registro. |
| T6 | Hash truncado/unsalted de nota (baixa entropia) | Alta | Alta em disco antigo | Persistência móvel acadêmica desligada; CLI grava HMAC-SHA256 com chave local 0600, sem rótulos | Snapshot em RAM ainda usa SHA-256[:16] só para diff local. Dump de memória revela notas. |
| T7 | MITM / CA de usuário (proxy) | Alta | Média em aparelho com CA instalada | Cleartext proibido; trust-anchors só `system`; sem pinning | Comprometimento da CA raiz do sistema ou do TLS da UFGD não é detectado. Pinning foi recusado: a UFGD rotaciona certificados e um pin quebrado impede login. |
| T8 | Navegação da WebView para origem não aprovada / XSS em subdomínio UFGD | Alta | Média no allowlist antigo `*.ufgd.edu.br` | Allowlist exata: `login.app`, `sigecad-academico.app`, `cartao.app` e `sso.acesso.gov.br` somente no login. Webdoc não navega a sessão | XSS no SIGECAD oficial ainda pode chamar a ponte naquela origem. |
| T9 | Backup Android / extração USB / recents | Alta | Alta com `allowBackup=true` antigo | `allowBackup=false`, rules de exclusão | Screenshot do app está liberado. Recents e captura de tela mostram o que está na tela, incluindo cartão e notas. |
| T10 | Dependência / supply chain | Alta | Média | lockfiles npm; sem analytics/crashlytics de produto | Compromisso de `react-native-webview` ou Metro no build local não é detectado automaticamente. |
| T11 | Email (Resend) com nome de disciplina | Média | Certa no self-host antigo | Corpo genérico: “Há uma atualização…” | O provedor ainda vê o endereço de email e o fato de uma atualização. |
| T12 | Clipboard do RGA | Média | Certa após toque | Só após toque explícito em Perfil | O RGA permanece no clipboard do SO até ser substituído. |
| T13 | PDF temporário no cache | Média | Baixa | Arquivo genérico, apagado no `finally` e no boot | Crash no meio do share pode deixar PDF até a próxima abertura. |
| T14 | Aparelho root / malware local / debugger | Alta | Alta no device comprometido | Sem WebView debug em release, chave HMAC no SecureStore | **Não há defesa real** contra root. |
| T15 | Replay / Sybil no sentinela | Alta | N/A enquanto desligado | Feature desativada | Reativar exige App Check, quórum e análise nova. |
| T16 | `raw/` e `state.json` locais com dados reais | Alta | Certa nesta máquina de desenvolvimento | gitignore; testes usam fixtures sintéticos | Arquivos locais continuam no disco do desenvolvedor. Não versionar. |

## Inventário de fluxos (build de produção / APK)

| Dado | Origem | Processos com acesso | Memória | Disco | Rede | Vida | Exclusão |
|---|---|---|---|---|---|---|---|
| Senha UFGDNet | Teclado no CAS ou no IdP escolhido | Renderer WebView da origem oficial correspondente | Volátil no renderer | Não | HTTPS somente para CAS/gov.br | Até o submit | Recriar WebView (`webKey`) + clear cookies/storage |
| Cookie `UFGDNET` | Set-Cookie do CAS | Cookie jar nativo do app (não o JS React Native) | CookieManager Android, sandbox do app | Persistido no diretório privado do app; backup desligado | Enviado só pelo motor da WebView aos portais UFGD; o IdP gov.br não recebe esse cookie | Até a UFGD expirar ou o usuário tocar em Sair | `Sair da conta` chama `CookieManager.clearAll` e remonta a WebView |
| Notas, faltas, horários, matrícula, histórico | GET same-origin SIGECAD via ponte | JS da ponte → React Native em RAM | Estado React | Não | Somente `sigecad-academico.app.ufgd.edu.br` | Enquanto o app está aberto | Logout / expiração destrói a sessão; estado React some com unmount. “Continuar offline” mantém RAM até fechar o app |
| Foto, saldo, extrato, Code 128 | Cartão UFGD via ponte | Idem | RAM (`data:` URL) | Não | `cartao.app.ufgd.edu.br` | Idem | Idem |
| PDF | Redirect assinado Webdoc | Native download temporário + share sheet | Bytes + arquivo cache genérico | Cache temporário durante a folha | `webdoc.app.ufgd.edu.br/gerar` | Até `finally` | Delete idempotente; limpeza no boot |
| Preferências de tema/layout | UI | React Native | RAM | AsyncStorage | Nenhuma | Até o usuário mudar | Não contém dados acadêmicos |
| HMAC key (CLI) | `secrets.token_bytes` | Processo Python local | RAM | `.hmac-key` 0600 | Nenhuma | Instalação | Apagar o arquivo |
| Token CLI | env / `~/.sigecad-token` | Processo Python do aluno | RAM | 0600 se gravado pelo `auth.py` | Header Cookie para UFGD | Até revogar na UFGD | Apagar arquivo / unset env |
| Token central (não produção) | SQLite cifrado | **Operador + processo no poll** | **Claro durante GET** | blob cifrado | UFGD | Enquanto cadastrado | `register.py delete` |

Destinos de rede do APK em uso autenticado: `login.app.ufgd.edu.br`,
`sso.acesso.gov.br` somente durante o login, `sigecad-academico.app.ufgd.edu.br`,
`cartao.app.ufgd.edu.br` e o download temporário do `webdoc.app.ufgd.edu.br`.
Não há endpoint do desenvolvedor, analytics, crash reporting de produto nem Firebase ativo.

## Decisão de certificate pinning

Não há pinning. A validação é a da âncora de sistema Android, **sem** CAs
instaladas pelo usuário. Pinning quebraria o app na rotação de certificados da
UFGD e forçaria um update só para restaurar login. O risco aceito é MITM por
CA raiz comprometida, não por proxy com CA de usuário.

## Arquivos alterados e motivo

Ver o diff desta sessão. Em resumo: WebView/origens, Android (backup, cleartext,
FirebaseInitProvider), persistência HMAC no CLI, sentinela desligado, email
genérico, testes de segurança. Screenshot do app está liberado.

## Como validar

```bash
cd ~/sigecad
python3 -m unittest discover -s tests -v
cd app && npm test && npm run typecheck
npm audit --audit-level=high
```

## Claims we can safely make

- O APK de produção não monta o painel Firebase e não importa módulos JS de
  Firebase em `App.tsx`.
- A senha é digitada na origem HTTPS `login.app.ufgd.edu.br`; o botão oficial gov.br
  usa `sso.acesso.gov.br` somente durante a autenticação. O código da ponte
  acadêmica não é injetado nessas origens e não contém `document.cookie`.
- Cookies de sessão não são lidos por CookieManager no caminho de produção.
- A WebView de sessão recusa HTTP, origens fora da allowlist exata de sessão,
  file:// e mixed content; o filtro amplo de HTTPS existe apenas para que a
  rejeição ocorra dentro do WebView, sem fallback automático para o Safari.
- `Sair da conta` limpa o cookie jar nativo e remonta a WebView. Reabrir o app
  reutiliza o cookie persistido no sandbox; o JavaScript do app nunca lê o valor.
- O dashboard não grava notas, rótulos, hashes acadêmicos nem o cookie em
  AsyncStorage.
- Backup Android e extração cloud estão desligados no manifesto de produção.
  Screenshot e recents do app estão liberados.
- WebView debugging está desligado em release.
- O modo central Docker não sobe no `compose up` padrão (`profiles: [central]`).
- Emails de notificação self-host/central não incluem nome de disciplina.
- Testes automatizados cobrem HMAC, allowlist, ausência de cookie na ponte,
  sentinela desligado e manifesto endurecido quando o projeto nativo existe.

## Claims we must not make

- Não é anônimo, zero-knowledge, ou “impossível de interceptar”.
- Não protege contra aparelho root, malware privilegiado, desenvolvedor
  malicioso com a keystore de release, ou XSS no portal oficial da UFGD.
- Não garante que o operador do modo central não leia o token: ele decifra o
  token a cada poll.
- Não garante push seguro: o sentinela permanece desativado porque turmas,
  hashes, horários e texto de notificação identificariam o aluno no Firebase.
- Não há prova de build reproduzível: o usuário não consegue, hoje, verificar
  que o APK publicado corresponde bit a bit ao source revisado.
- Hashes em RAM (SHA-256 truncado) não são resistentes a enumeração; por isso
  não são persistidos no app.
- Copiar o RGA coloca um identificador no clipboard do sistema.
- O cookie UFGDNET persistido no sandbox sobrevive a fechar o app. Quem desbloquear
  o celular e abrir o app entra na conta até a UFGD expirar a sessão ou o aluno
  tocar em Sair.
- “Continuar offline” após expirar a sessão mantém dados acadêmicos em memória
  até o processo morrer.
