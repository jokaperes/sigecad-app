# Privacidade e consentimento (LGPD)

Este projeto consulta dados acadêmicos. O responsável por qualquer deploy deve
preencher contato, finalidade e retenção antes de aceitar usuários reais.

## Dados por modo

### CLI e self-host

- Token: ambiente/`.env` da máquina do próprio aluno.
- Senha: nunca persistida; `server/auth.py` a usa somente durante o login.
- Snapshot: hashes, flag de publicação e rótulos locais.
- Valores de nota: apenas em memória ou terminal quando solicitado.
- Terceiros: Resend recebe email e conteúdo do evento somente se configurado.

Não há controlador central neste modo além do próprio usuário.

### App device-sentinel

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
