# Financeiro

Site pessoal para acompanhar receitas, despesas, saldos, lançamentos pendentes e parcelas.

**Stack:** JavaScript puro (ES modules), HTML, CSS, Cloudflare Workers e **um Cloudflare D1 novo, exclusivo do projeto**. Sem React, Vite, TypeScript ou bibliotecas de interface.

## O que já está pronto

- Dashboard mensal responsivo com entradas, saídas, saldo previsto, pendências e saldo realizado.
- Gráfico comparativo de seis meses.
- Lançamentos: criar, editar, excluir, marcar pago/pendente, pesquisar, filtrar e gerar até 24 parcelas mensais.
- Modo demonstração com dados fictícios **somente em memória**, sem salvar ou sincronizar com nenhum banco.
- API D1 com validação, SQL parametrizado e chave privada obrigatória.
- Migração SQL inicial em migrations/0001_init.sql.

## Teste rápido

1. Ter Node.js instalado apenas para executar a CLI do Cloudflare (o site continua 100% JS puro, sem bundler).
2. Rode npx wrangler dev.
3. Abra o endereço local indicado. Sem DB + segredo, o app entra em **modo demonstração**; as alterações somem ao recarregar.

Para checagem rápida de sintaxe use:
- node --check public/js/app.js
- node --check src/worker.js

## Quando você criar seu D1 novo

> **Importante:** não reaproveite o D1 antigo de gastos ou de ponto. Este repositório não tem nenhuma conexão com eles.

1. Crie um banco Cloudflare D1 novo, por exemplo com npx wrangler d1 create financeiro.
2. No wrangler.jsonc, adicione **somente o ID real desse banco novo**:

    "d1_databases": [
      {
        "binding": "DB",
        "database_name": "financeiro",
        "database_id": "COLE_AQUI_O_ID_DO_NOVO_D1",
        "migrations_dir": "migrations"
      }
    ]

   Adicione essa propriedade no objeto JSON da raiz, com a vírgula apropriada depois de "assets". Não commit IDs sem confirmar o banco de destino.

3. Execute a migração **apenas no novo banco**: npx wrangler d1 migrations apply financeiro --remote.
4. Configure uma chave privada aleatória de pelo menos 32 caracteres, com npx wrangler secret put FINANCEIRO_API_TOKEN. **Nunca compartilhe nem commite essa chave.**
5. Faça o deploy: npx wrangler deploy. No primeiro acesso, informe a chave na janela de login. Ela permanece apenas na memória desta aba (não é armazenada em localStorage/cookies).

Para desenvolvimento local com banco local, configure uma cópia não rastreada do .dev.vars.example em .dev.vars e adicione o binding DB depois de criar seu D1 novo. Use as migrações locais antes de usar a API.

## Segurança e limitações

- **Não publique a API com credencial fraca.** O Worker bloqueia a API sem DB e sem segredo de ao menos 32 caracteres.
- O login é uma chave privada única de acesso (adequada para uso pessoal restrito). Para vários usuários, deve-se acrescentar autenticação individual/autorização antes de compartilhar o site.
- Nenhuma informação real é incluída por padrão. Não há integração com bancos atuais nem importação automática.
- A demo não persiste os dados. Registros reais só serão persistidos depois de criar, migrar e conectar o novo D1.
- Na edição de uma parcela, apenas aquela parcela é alterada. Excluir uma parcela também exclui apenas ela.
- O valor inserido com várias parcelas é **o valor de cada parcela**, não o total da compra.
- Não há CI/deploy automático configurado. Nenhuma alteração foi feita na sua conta Cloudflare.

As regras de implementação estão em [AGENTS.md](AGENTS.md).
