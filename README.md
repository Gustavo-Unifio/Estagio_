# Atribuição e validação de carga horária docente

A aplicação usa React, TypeScript, Express, Prisma e Postgres. A interface segue as referências de tipografia, paleta e clareza do [Guia de estilo do CPS](https://cps.sp.gov.br/guia-estilo/index.php).

## Requisitos

- Node.js 20.19+ ou 22.12+
- npm

## Configuração local no Windows

No PowerShell, na pasta do projeto:

```powershell
npm install
Copy-Item .env.example .env
```

Edite `.env` localmente com as URLs do banco Postgres e configure `APP_ORIGIN` e `SESSION_COOKIE_SECURE=false` para o frontend local. Nunca versione esse arquivo.

Para criar ou atualizar o banco local de desenvolvimento, configure as variáveis apenas na sessão atual do PowerShell e execute os comandos Prisma:

```powershell
$env:DATABASE_URL="postgresql://usuario:senha@host:5432/aplicacao"
$env:DIRECT_URL=$env:DATABASE_URL
npx prisma db push
npm run db:generate
```

A conta administrativa inicial pode ser criada a partir de variáveis temporárias:

```powershell
$env:ADMIN_EMAIL="administrador@exemplo.com"
$env:ADMIN_PASSWORD="senha-exclusiva-com-12-ou-mais"
npm run admin:create
```

`npm run admin:create` cria a conta uma única vez e não altera senhas existentes. Remova as variáveis da sessão ao terminar:

```powershell
Remove-Item Env:ADMIN_EMAIL,Env:ADMIN_PASSWORD,Env:DATABASE_URL,Env:DIRECT_URL
```

Para criar uma secretaria local sem armazenar a senha no arquivo `.env`, configure `SECRETARY_EMAIL`, `SECRETARY_PASSWORD`, `SECRETARY_NAME` e `SECRETARY_SEAT` somente na sessão do PowerShell e execute `npm run secretary:create`.

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

## Banco Postgres e implantação na Vercel

1. Crie um banco Postgres hospedado e guarde separadamente a URL principal e a URL direta. Quando o provedor não oferece pooling, `DIRECT_URL` pode ter o mesmo valor de `DATABASE_URL`.
2. Defina as variáveis somente na sessão do PowerShell para aplicar o schema no banco de produção:

```powershell
$env:DATABASE_URL="postgresql://usuario:senha@host-pooled:5432/aplicacao"
$env:DIRECT_URL="postgresql://usuario:senha@host-direto:5432/aplicacao"
npx prisma db push
npm run db:generate
npx prisma generate
```

Depois crie o administrador inicial:

```powershell
$env:ADMIN_EMAIL="administrador@exemplo.com"
$env:ADMIN_PASSWORD="senha-exclusiva-com-12-ou-mais"
npm run admin:create
```

Remova as variáveis sensíveis da sessão:

```powershell
Remove-Item Env:ADMIN_EMAIL,Env:ADMIN_PASSWORD,Env:DATABASE_URL,Env:DIRECT_URL
```

3. No painel da Vercel, configure `DATABASE_URL`, `DIRECT_URL`, `APP_ORIGIN=https://seu-dominio.vercel.app` e `SESSION_COOKIE_SECURE=true`. `APP_ORIGIN` deve ser a URL HTTPS exata do site.
4. Faça o redeploy. O `postinstall` executará `prisma generate`, o frontend será compilado para `dist` e as rotas `/api/*` serão encaminhadas para `api/index.ts`.

## Banco de testes

Os testes exigem um banco Postgres separado. Defina `TEST_DATABASE_URL` apenas na sessão do PowerShell e execute:

```powershell
$env:TEST_DATABASE_URL="postgresql://usuario:senha@host:5432/aplicacao_testes"
npm test
```

O script de testes valida a URL, aplica o schema somente nesse banco e impede que `TEST_DATABASE_URL` seja igual à `DATABASE_URL` configurada na sessão. Nunca execute os testes contra o banco de produção.

## Comandos úteis

```powershell
npm run build       # verifica tipos e compila frontend/API
npm test            # exige TEST_DATABASE_URL
npm run db:push     # usa DATABASE_URL da sessão ou do ambiente
npm run db:studio   # inspeciona o banco local
```

Para implantação fora da máquina local, configure `APP_ORIGIN` com a origem HTTPS pública exata, habilite `SESSION_COOKIE_SECURE=true`, proteja o banco e as variáveis de ambiente e execute a API atrás de um proxy seguro. A configuração de desenvolvimento vincula a API a `127.0.0.1`.
