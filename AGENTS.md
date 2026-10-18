# AGENTS.md — Financeiro

## Objetivo
Aplicação web pessoal para controlar receitas, despesas, lançamentos pendentes, parcelas e saldos por mês. Priorizar simplicidade, clareza, segurança e manutenção.

## Regras obrigatórias
1. **Tecnologias:** exclusivamente JavaScript puro (ES modules), HTML, CSS e SQL. Não utilizar React, Vue, Vite, TypeScript ou frameworks/bundlers. Cloudflare Workers para API e Cloudflare D1 para persistência.
2. **Banco de dados:** o Financeiro terá **um D1 novo e exclusivo**, criado e vinculado futuramente pelo usuário como binding `DB`. **Nunca** conectar, alterar, migrar ou importar automaticamente dados dos bancos atuais de gastos ou ponto.
3. **Segurança:** dados reais só pela API do Worker, com autenticação obrigatória; nunca expor credenciais, tokens ou detalhes internos em arquivos públicos. Não armazenar token de acesso permanentemente no navegador. Não habilitar endpoints de escrita sem autenticação. Usar SQL parametrizado; validar e limitar toda entrada também no servidor.
4. **Integridade financeira:** representar dinheiro em centavos inteiros, formatar em BRL e usar datas ISO (`AAAA-MM-DD`) para lançamentos. Não somar dinheiro com ponto flutuante. Todas as operações e resumos devem preservar o mês/ano correto; parcelas precisam de lançamentos separados, criados atomicamente.
5. **Interface:** visual moderno, profissional, responsivo e acessível. Português brasileiro, comunicação curta e direta, navegação simples, estados de carregamento/vazio/erro claros. Sem dados falsos apresentados como reais.
6. **Modo demonstração:** enquanto o novo D1 não estiver configurado, permitir explorar dados **fictícios e temporários apenas em memória**, claramente identificados como demonstração. Nunca sincronizar dados de demonstração com o D1.
7. **Organização:** `public/` para HTML/CSS/JS, `src/worker.js` para a API e `migrations/` para o esquema SQL. Manter arquivos pequenos e responsabilidade definida. Sem dependências desnecessárias.
8. **Mudanças:** preservar funcionalidades existentes, testar antes de concluir, documentar alterações que exigem configuração; não editar outras aplicações nem Cloudflare D1 sem autorização explícita.

## Checklist de entrega
- Nada conectado a D1 antigo.
- Autenticação exigida para API real.
- Lançamentos e totais coerentes em centavos.
- Interface utilizável em desktop e celular.
- Modo demonstração claramente sinalizado até configurar DB e credencial.
