# Atribuição e validação de carga horária docente

Aplicação web com React, TypeScript, Express, Prisma e SQLite. A interface segue as referências de tipografia, paleta e clareza do [Guia de estilo do CPS](https://cps.sp.gov.br/guia-estilo/index.php).

## Requisitos

- Node.js 20.19+ ou 22.12+
- npm

## Configuração inicial no Windows

No PowerShell, na pasta do projeto:

```powershell
npm install
Copy-Item .env.example .env
```

Edite `.env` e preencha `ADMIN_EMAIL` e `ADMIN_PASSWORD` com o e-mail administrativo e uma senha exclusiva de pelo menos 12 caracteres. Não compartilhe nem versiona esse arquivo.

Inicialize o banco e crie a primeira conta administrativa:

```powershell
npm run db:generate
npm run db:push
npm run admin:create
```

`npm run admin:create` cria uma conta uma única vez e não altera senhas existentes. Depois de criar o admin, remova os valores de `ADMIN_EMAIL` e `ADMIN_PASSWORD` do `.env`; a conta continua cadastrada no banco.

O painel do admin cadastra secretarias para o uso normal. Para criar uma conta de secretaria a partir do PowerShell, sem cadastrar uma senha no arquivo `.env`, configure `SECRETARY_EMAIL`, `SECRETARY_PASSWORD`, `SECRETARY_NAME` e `SECRETARY_SEAT` somente na sessão do terminal e execute `npm run secretary:create`. Senhas devem ser compartilhadas por um canal privado.

Inicie o frontend e a API:

```powershell
npm run dev
```

Abra o endereço Vite mostrado no terminal (normalmente `http://localhost:5173`). Os dois processos ficam ativos no terminal; use `Ctrl+C` para encerrá-los.

## Contas e permissões

- O perfil é obtido exclusivamente da conta autenticada; a tela de login não permite selecionar ou alterar o perfil.
- A conta inicial tem perfil de administrador. No painel, o admin cria uma conta individual por secretaria, informando e-mail, senha inicial e unidade autorizada.
- Cada e-mail pode pertencer a apenas um perfil e cada conta de secretaria fica associada a uma única sede.
- O admin pode editar o nome, e-mail, sede e senha de uma secretaria ou excluir o acesso. Alterar uma conta encerra as sessões daquela pessoa; ao redefinir a senha, informe uma nova senha de pelo menos 12 caracteres. Deixe o campo de senha vazio para mantê-la.
- Administradores podem cadastrar, editar e excluir outras contas ADMIN; todas recebem as mesmas permissões. Por segurança, não é possível editar ou excluir a conta da sessão atual nem remover o último administrador ativo. As sessões da conta editada são encerradas.
- Senhas são armazenadas com hash bcrypt. A sessão usa cookie `HttpOnly`, `SameSite=Strict`, expiração e token armazenado em hash.
- O navegador não controla as permissões: endpoints de administração exigem o perfil admin, e validações exigem uma conta de secretaria vinculada à sede correspondente.

## Importação da planilha

O painel administrativo aceita `.xls`, `.xlsx`, `.ods` e `.csv`, com até 5 MB e 5.000 linhas de dados. Em pastas de trabalho, procura os cabeçalhos `Sede`, `Docente`, `Matrícula`, `EMAIL` e `Total Horas` nas primeiras 30 linhas de todas as abas. Cabeçalhos equivalentes são ignorados se forem repetidos em abas com dados idênticos; quando existem abas compatíveis com dados diferentes, o admin pode informar o nome da aba desejada. Os cabeçalhos não diferenciam maiúsculas/minúsculas ou acentos. CSV com separador vírgula ou ponto e vírgula é aceito.

Cada arquivo válido **substitui a base ativa em uma transação**. Cabeçalho, linhas, e-mails, horas e matrículas duplicadas são validados antes da transação. Se o arquivo falhar, as atribuições atuais permanecem; um diálogo apresenta o primeiro motivo encontrado e orienta a edição e o novo envio da planilha. A importação e a pessoa administradora ficam registradas no histórico, que é preservado quando a conta de quem importou é excluída.

## Carga horária e validação

- `Total Horas` representa a carga solicitada para aquela unidade.
- A secretaria pode rejeitar somente se informar uma observação. O servidor também exige esse motivo e grava situação, data/hora e e-mail validador.
- A carga solicitada de cada atribuição é apresentada independentemente; horas aprovadas em outras redes/unidades não são exibidas nem somadas ao validar.
- A administração visualiza o motivo das atribuições rejeitadas.
- Uma atribuição rejeitada pode ter as horas solicitadas ajustadas pelo admin e ser reenviada como pendente à sede. A secretaria precisa validar novamente; decisões e motivos anteriores permanecem no histórico visível à administração.
- O painel administrativo permite combinar filtros de sede e status; a secretaria pode filtrar as atribuições da própria sede por status.
- “Esvaziar base” remove as atribuições ativas, mas preserva contas e histórico de importação.

## Banco e comandos

O schema em `prisma/schema.prisma` contém `Professores_Atribuicoes`, `Permissoes_Sede`, contas, sessões, histórico de validações e histórico de importação. Para atualizar um banco existente após alterações no schema, execute `npm run db:generate` e `npm run db:push`; não use reset, pois isso apagaria os dados. O arquivo SQLite local usa a URL configurada em `DATABASE_URL`.

```powershell
npm run build       # verifica tipos e compila frontend/API
npm run db:studio   # inspeciona o banco local
```

Para implantação fora da máquina local, configure `APP_ORIGIN` com a origem HTTPS pública exata, habilite `SESSION_COOKIE_SECURE=true`, proteja o banco e as variáveis de ambiente e execute a API atrás de um proxy seguro. A configuração de desenvolvimento vincula a API a `127.0.0.1`.
