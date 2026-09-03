# Privacidade e consentimento (LGPD)

Este projeto consulta dados acadêmicos. O responsável por qualquer deploy deve
preencher contato, finalidade e retenção antes de aceitar usuários reais.

A auditoria e as propriedades que o código atual sustenta estão em
[SECURITY.md](SECURITY.md). O APK de produção não envia dados acadêmicos a
Firebase, analytics ou servidor do desenvolvedor.

## Dados por modo

### Expo Go no iPhone/Android

- Senha e cookie: permanecem na mesma WebView privada da UFGD; se o aluno escolhe
  o login oficial gov.br, esse redirect também fica dentro do app. O código React
  Native não lê `document.cookie` nem persiste a sessão.
- Notas, faltas, horários, matrícula, histórico, currículo, carga horária, perfil,
  foto, número do cartão, Code 128, saldos e extratos: somente em memória enquanto o painel
  está aberto. Campos pessoais não usados retornados pelo portal são descartados.
- Estado local: hashes SHA-256 unidirecionais, flag de publicação, rótulos e
  timestamp para detectar mudanças, além de preferências não sensíveis de tema e layout.
- Normalização de nome e MIME da foto ocorre em memória para renderização; não
  cria um cadastro paralelo nem grava a imagem no armazenamento do Expo Go.
- Histórico oficial, e atestado quando liberado pela UFGD, são baixados somente
  após toque. O PDF validado é gravado com nome genérico no cache temporário apenas para a
  folha nativa de compartilhar/salvar, apagado em seguida e limpo novamente na
  próxima abertura em caso de interrupção. A URL assinada do histórico permanece
  somente em memória, aceita apenas o Webdoc oficial e nunca entra em log. O app
  não escolhe destinatário sozinho; planos usam apenas `peID` devolvido pela sessão.
- A foto não possui ampliação e o `data:` URL continua somente em memória. Copiar
  o RGA exige toque explícito; somente nessa ação o valor vai para o clipboard do
  sistema, onde permanece sob controle do aparelho até ser substituído.
- Quantidade de refeições e recarga exata são derivadas somente
  dos saldos/extratos já em memória e nunca são persistidas ou enviadas.
- O número completo é validado apenas como dígitos, usado para renderizar Code 128
  no aparelho e nunca entra em log, diagnóstico, AsyncStorage ou URL construída.
- O diagnóstico local recebe somente estados e contagens agregadas. Não recebe
  nome, RGA, disciplina, nota, saldo, URL, corpo de resposta ou credencial.
- Backend/terceiros: nenhum dado é enviado pelo app nesse modo; as requisições
  de leitura acontecem dentro da sessão oficial UFGD.
- Cookie de sessão: fica no cookie jar nativo do app, fora do JavaScript, para o
  aluno não relogar a cada abertura. `Sair da conta` apaga o cookie. O usuário também pode apagar o histórico
  hash-only na tela Perfil.

### CLI e self-host

- Token: ambiente/`.env` da máquina do próprio aluno.
- Senha: nunca persistida; `server/auth.py` a usa somente durante o login.
- Snapshot: hashes, flag de publicação e rótulos locais.
- Valores de nota: apenas em memória ou terminal quando solicitado.
- Terceiros: Resend recebe email e conteúdo do evento somente se configurado.

Não há controlador central neste modo além do próprio usuário.

### App device-sentinel nativo

No aparelho:

- cookie UFGDNET no Keychain/Keystore;
- códigos de turma, rótulos e hashes no AsyncStorage;
- estado e data da última sincronização.

No Firebase:

- uid anônimo, push token e email opcional;
- códigos de turma e vínculos de membros;
- hashes de estado;
- eventos legíveis, como publicação de uma avaliação e seu rótulo;
- timestamps de consentimento, atividade e reports temporários.

O Firebase não recebe senha, cookie UFGDNET, CPF ou valor da nota. Reports são
removidos depois do quórum ou quando passam da janela de 30 minutos. Turmas mantêm
o último evento confirmado enquanto existirem.

O sentinela coletivo observa somente criação de avaliação e sua flag de
publicação. Faltas e correções de valor já publicado são individuais e não são
enviadas nem notificadas por esse fluxo.

### Servidor central

- email obrigatório e consentimento;
- token cifrado com AES-256-GCM;
- códigos de turma e snapshots hash-only;
- metadados operacionais de falha/status.

Durante cada poll, o token existe em claro na RAM. O operador com root e acesso à
`MASTER_KEY` pode decifrá-lo; o modo central não é zero-knowledge.

## Finalidade e base legal

Finalidade exclusiva: detectar mudanças e enviar notificações solicitadas pelo
aluno. Base legal pretendida: consentimento explícito do titular (LGPD art. 7º, I).
O botão de cadastro do app e `register.py --consent` registram esse ato.

## Direitos do titular

- Expo Go: “Apagar histórico local” remove snapshots; “Sair da conta” destrói o
  navegador privado.
- App: “Apagar meus dados e sair” remove usuário, reports, vínculos, auth anônima,
  token e snapshots locais.
- Central: `register.py del <email>` remove usuário e registros em cascade.
- Revogação UFGD: trocar credencial/solicitar rotação do token invalida o bearer.
- Acesso/correção: o operador do deploy deve fornecer um canal de atendimento.

Contato do controlador: **preencher antes do deploy público**.

## Segurança e retenção

- TLS sempre verificado.
- Firestore bloqueia acesso direto do cliente.
- App Check, auth, validação e quórum protegem callables.
- Arquivos locais sensíveis usam `0600` e não entram em Git/Docker.
- Logs devem conter IDs internos e tipos de erro, nunca token, URL de CAS, corpo
  de provider, foto ou dados acadêmicos completos.
- Backups e prazo de retenção do deploy central precisam ser definidos pelo operador.

## Riscos residuais

- Bearer token exposto equivale a sessão comprometida.
- Push token/email e nomes de disciplina são dados pessoais ou associáveis.
- App attestation reduz abuso, mas não prova matematicamente a resposta da UFGD.
- Sistemas móveis podem atrasar notificações.
- UFGD, Firebase e Resend possuem suas próprias políticas e jurisdições.
