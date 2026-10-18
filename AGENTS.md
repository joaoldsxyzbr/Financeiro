# AGENTS.md — Financeiro

## Regras permanentes
1. **Tecnologia:** site em HTML, CSS, JavaScript puro (ES Modules) e SQL. Backend Cloudflare Workers, banco Cloudflare D1. Não usar React, Vite, Vue ou TypeScript.
2. **D1 exclusivo:** usar apenas o banco `financeiro` (ID `66379719-dc22-4e1f-9645-ae5a52ff43af`), binding `DB`. Nunca tocar os antigos bancos de gastos ou ponto sem pedido explícito.
3. **Tabela obrigatória:** `registros`, com exatamente seis colunas nesta ordem: `data` (AAAA-MM), `tipo` (`entrada` ou `saida`), `descricao`, `valor` (centavos inteiros positivos), `categoria` e `status` (`pendente` ou `pago`). Identificar linhas pelo `rowid` implícito. Nunca inferir o tipo pelo sinal do valor.
4. **Interface:** painel financeiro responsivo, profissional, simples e claro, em português, com filtro mensal, lançamentos e resumo de receitas/despesas. Sem armazenar dia do mês ou parcelas.
5. **Segurança:** exigir secret `FINANCEIRO_API_TOKEN` com mínimo de 32 caracteres para a API real; nunca expor segredos ou dados privados sem autenticação. Usar SQL parametrizado e validações server-side. Não salvar token no armazenamento do navegador.
6. **Demonstração:** dados fictícios apenas em memória, rotulados como demo; nunca gravar testes no D1.
7. **Código:** organização leve em `public/`, `src/` e `migrations/`, sem dependências desnecessárias, testes antes de publicar.
8. **Deploy:** configurar binding do D1 neste repositório. Não publicar nem criar secret sem autorização/contexto suficiente.
9. **Usuários:** a tabela `usuarios` pertence ao mesmo D1 exclusivo e contém `id`, `nome`, `email` (único, sem distinguir maiúsculas/minúsculas), `senha_hash`, `ativo` (0/1) e `criado_em`. Jamais salvar senhas em texto puro. Ao desenvolver cadastro/login, usar hash apropriado para senhas com sal único e verificação segura. A criação da tabela **não** significa que o login por usuários já esteja integrado: a autenticação atual da API por `FINANCEIRO_API_TOKEN` permanece até substituição completa e testada.
