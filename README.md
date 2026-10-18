# Financeiro

Site para controle financeiro pessoal, em **JavaScript puro, HTML, CSS, SQL, Cloudflare Workers e D1**, sem React, Vite ou frameworks.

## Banco novo já criado

- D1: **financeiro**
- ID: `66379719-dc22-4e1f-9645-ae5a52ff43af`
- Binding: `DB` (já incluído em `wrangler.jsonc`)
- Tabela: **registros** (já criada no banco remoto)

| Coluna | Conteúdo |
|---|---|
| `data` | Apenas mês e ano, `2026-11` |
| `tipo` | `entrada` ou `saida` |
| `descricao` | Texto |
| `valor` | Centavos inteiros positivos (`290000` = R$ 2.900,00) |
| `categoria` | Texto |
| `status` | `pendente` ou `pago` |

A tabela tem as seis colunas financeiras, mais `usuario_id` obrigatório (chave estrangeira para `usuarios.id`), garantindo que cada lançamento pertença a uma conta. Ela mantém `tipo` entre `data` e `descricao`. O tipo da movimentação é explícito e os valores são positivos. A aplicação usa o `rowid` automático do SQLite para editar ou excluir registros. Não há dados de exemplo no banco.

## Site

Dashboard com receitas, despesas, saldo, pendências, evolução semestral e lançamentos para cada mês. Permite cadastrar, pesquisar, filtrar, editar, excluir e marcar como pago/pendente. Sem parcelas e sem data diária. Dados fictícios em modo demonstração só existem na memória da aba.

## Próximos passos para o site real

1. A tabela e o binding do novo D1 já estão prontos.
2. Configurar no Worker o segredo privado `FINANCEIRO_API_TOKEN`, uma chave aleatória exclusiva com **pelo menos 32 caracteres** (por exemplo `npx wrangler secret put FINANCEIRO_API_TOKEN`). Nunca incluir a chave neste repositório ou em chats.
3. Fazer o deploy do Worker com `npx wrangler deploy` após configurar o segredo.
4. Cadastrar cada usuário usando o endpoint administrativo protegido (`POST /api/admin/users`).
5. Acessar o site com o nome de usuário e a senha individual.

**Sem segredo o Worker bloqueia a API real.** O modo de demonstração não grava nada no D1. Não existe deploy automático configurado. `migrations/0001_init.sql` replica a tabela criada e pode ser reaplicado com segurança no mesmo banco se necessário. Para testar: `npm test`, `node --check public/js/app.js` e `node --check src/worker.js`.

Consulte [AGENTS.md](AGENTS.md).
## Tabela de usuários

A tabela `usuarios` está no mesmo D1 `financeiro` e possui apenas quatro colunas. Não é necessário e-mail para identificar os usuários:

| Coluna | Uso |
|---|---|
| `id` | Identificador automático (inteiro) |
| `nome` | Nome do usuário, obrigatório |
| `usuario` | Login único (3 a 50 caracteres; comparação sem diferenciar maiúsculas e minúsculas) |
| `senha_hash` | Hash seguro da senha, obrigatório; **nunca** armazenar senha em texto puro |

**Atenção:** nenhum usuário foi cadastrado automaticamente. O login individual foi implementado no código do Worker, mas ainda requer segredo, usuários cadastrados e deploy. O segredo `FINANCEIRO_API_TOKEN` serve exclusivamente para autorizar a criação administrativa de contas e assinar sessões; não é a senha de cada usuário. A migration `migrations/0002_usuarios.sql` registra o esquema de usuários.
## Isolamento e autenticação

A tabela `registros` possui agora `usuario_id INTEGER NOT NULL REFERENCES usuarios(id)`. O D1 novo estava vazio ao aplicar a mudança. Cada solicitação financeira verifica uma sessão assinada; todas as consultas, somas, inclusões, edições e exclusões passam obrigatoriamente pelo ID da pessoa autenticada.

- Login: `POST /api/login` com `{"usuario":"...","senha":"..."}` devolve um token assinado, válido por 8 horas e guardado apenas na memória da aba.
- Cadastro (somente administrador): `POST /api/admin/users` com Authorization Bearer usando `FINANCEIRO_API_TOKEN` e JSON com `nome`, `usuario` e `senha`.
- `senha_hash`: PBKDF2-SHA256 com sal exclusivo de 16 bytes e 600.000 iterações. A senha não é armazenada em texto puro.
- O cadastro público está desabilitado para evitar contas desconhecidas. Para registrar um usuário, use por exemplo um cliente HTTP administrativo protegido; não compartilhe credenciais em conversas ou repositórios.
- O sistema não possui recuperação de senha, autenticação multifator ou limitação de tentativas de login embutida. Configure rate limiting na Cloudflare antes de uso público.
- Não é necessário passar `usuario_id` do navegador: ele é sempre obtido da sessão. A troca manual de IDs de lançamentos não permite acessar registros de outra conta.
- A migração `0003_registros_usuarios.sql` foi aplicada enquanto `registros` estava vazia. A versão no repositório possui proteção para bloquear execução se houver registros. Faça backup antes de migrações.

**Status:** esquema do D1 remoto atualizado; código do site e Worker no GitHub; novo Worker ainda precisa ser publicado. Os usuários são criados separadamente por administrador, não foram cadastrados automaticamente.