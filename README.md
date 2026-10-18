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

A tabela tem exatamente seis colunas, com `tipo` entre `data` e `descricao`. O tipo da movimentação é explícito e os valores são positivos. A aplicação usa o `rowid` automático do SQLite para editar ou excluir registros. Não há dados de exemplo no banco.

## Site

Dashboard com receitas, despesas, saldo, pendências, evolução semestral e lançamentos para cada mês. Permite cadastrar, pesquisar, filtrar, editar, excluir e marcar como pago/pendente. Sem parcelas e sem data diária. Dados fictícios em modo demonstração só existem na memória da aba.

## Próximos passos para o site real

1. A tabela e o binding do novo D1 já estão prontos.
2. Configurar no Worker o segredo privado `FINANCEIRO_API_TOKEN`, uma chave aleatória exclusiva com **pelo menos 32 caracteres** (por exemplo `npx wrangler secret put FINANCEIRO_API_TOKEN`). Nunca incluir a chave neste repositório ou em chats.
3. Fazer o deploy do Worker com `npx wrangler deploy` após configurar o segredo.
4. Acessar o site e informar a chave no login. Ela fica somente na memória da aba.

**Sem segredo o Worker bloqueia a API real.** O modo de demonstração não grava nada no D1. Não existe deploy automático configurado. `migrations/0001_init.sql` replica a tabela criada e pode ser reaplicado com segurança no mesmo banco se necessário. Para testar: `npm test`, `node --check public/js/app.js` e `node --check src/worker.js`.

Consulte [AGENTS.md](AGENTS.md).
## Tabela de usuários

A tabela `usuarios` foi criada no mesmo D1 `financeiro`. Ela tem:

| Coluna | Uso |
|---|---|
| `id` | Identificador automático (inteiro) |
| `nome` | Nome do usuário, obrigatório |
| `email` | E-mail único, sem diferenciar maiúsculas e minúsculas |
| `senha_hash` | Hash seguro de senha, obrigatório; **nunca** armazenar senha em texto puro |
| `ativo` | 1 = ativo, 0 = inativo (padrão 1) |
| `criado_em` | Data de criação automática, em UTC |

**Atenção:** a tabela está vazia; nenhum usuário foi criado. O site **ainda não possui cadastro nem login por usuário**, e a tabela `registros` ainda não pertence a usuários individuais. A API continua usando a chave privada `FINANCEIRO_API_TOKEN`. Implementar autenticação real posteriormente exigirá hash robusto com sal, sessões seguras e autorização por usuário. A migração `migrations/0002_usuarios.sql` registra o esquema.
