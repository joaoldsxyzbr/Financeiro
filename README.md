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

A **Visão geral** mostra três KPIs para o mês selecionado: **Entradas**, **Saídas** e **Saldo**. Em seguida, apenas o card **Lançamentos do mês** com busca, filtros, inclusão, edição, exclusão e confirmação de pagamentos. Não há gráfico de evolução nem blocos extras de análise nessa tela. Sem parcelas e sem data diária. Dados fictícios em modo demonstração só existem na memória da aba.

A segunda aba é **Categorias** (não mais Lançamentos): permite criar, listar, pesquisar, editar e excluir categorias de entrada e saída. O formulário de lançamentos carrega categorias cadastradas no D1 para cada conta.

## Próximos passos para o site real

1. A tabela e o binding do novo D1 já estão prontos.
2. O segredo privado `FINANCEIRO_API_TOKEN` já foi configurado no Worker na Cloudflare. Não incluí-lo no repositório nem compartilhá-lo.
3. (Recomendado) Separar os segredos: `npx wrangler secret put SESSION_SECRET` e `npx wrangler secret put PASSWORD_HMAC_KEY`, ambos com 32 caracteres aleatórios ou mais. Opcional: sem eles, o Worker continua usando `FINANCEIRO_API_TOKEN` para tudo, como antes.
4. Fazer o deploy do Worker com `npx wrangler deploy` após configurar os segredos. O deploy também registra o binding nativo de limite de tentativas do Workers.
5. Cadastre a primeira conta no seu terminal com `node scripts/create-user.js`, ou utilize o endpoint administrativo protegido para outras contas.
6. Acessar o site com o nome de usuário e a senha individual.

**Sem segredo o Worker bloqueia a API real.** O modo de demonstração não grava nada no D1. As migrations representam etapas históricas do esquema; **não as reaplique em produção com dados reais sem verificar o estado atual e fazer backup**, especialmente `0003_registros_usuarios.sql`. Para testar: `npm test`, `node --check public/js/app.js` e `node --check src/worker.js`.

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
- O sistema não possui recuperação de senha nem autenticação multifator. O limite de tentativas usa o binding nativo de rate limiting do Workers (`ratelimits` no `wrangler.jsonc`): 20 requisições por minuto por IP em `/api/login/params`, `/api/login` e `/api/admin/users`, devolvendo 429 quando excedido. O contador é aproximado (por localização da Cloudflare) e, se o binding falhar ou não existir, o login continua funcionando (fail-open).
- Não é necessário passar `usuario_id` do navegador: ele é sempre obtido da sessão. A troca manual de IDs de lançamentos não permite acessar registros de outra conta.
- A migração `0003_registros_usuarios.sql` foi aplicada enquanto `registros` estava vazia. A versão no repositório possui proteção para bloquear execução se houver registros. Faça backup antes de migrações.

**Status:** esquema do D1 remoto atualizado; código do site e Worker no GitHub; novo Worker ainda precisa ser publicado. Os usuários são criados separadamente por administrador, não foram cadastrados automaticamente.
## Aparência

O Financeiro utiliza **modo escuro por padrão** em todo o site, inclusive formulários, pop-ups e telas móveis. A paleta combina fundo azul-marinho/grafite, painéis escuros, textos claros e verde como destaque. A aparência não depende do tema do sistema operacional.
## Primeiro acesso e tela de login

A Cloudflare já possui o Worker `financeiro`, binding `DB` para o D1 correto e o secret privado `FINANCEIRO_API_TOKEN`. O aplicativo usa a **tela de login escura** como página inicial, com usuário e senha; o painel só aparece após uma sessão individual válida. Inclui a opção **Alterar senha** dentro do painel. Nenhuma senha é registrada em texto puro.

**Para cadastrar o primeiro usuário (uma única vez, em seu próprio terminal):**

1. Tenha Node.js instalado e faça login na conta Cloudflare com `npx wrangler login`.
2. Na pasta do repositório, execute `node scripts/create-user.js`.
3. Informe nome, usuário e senha (mínimo de 12 caracteres); a digitação da senha não aparece na tela.
4. O script armazena somente o hash PBKDF2-SHA256, com sal aleatório, no D1 remoto configurado. O arquivo temporário de SQL é apagado após o uso.

O script **não** cadastra nada automaticamente nem altera dados de outros bancos. O cadastro de usuários pelo site permanece fechado (sem autoinscrição pública). O endpoint administrativo de cadastro continua protegido por segredo do Worker.

A Cloudflare faz deploys do Worker `financeiro` via Workers Builds; o GitHub Actions independente, em `.github/workflows/ci.yml`, tem apresentado falhas e precisa de investigação antes de considerar o CI aprovado.
## Correções da tela de login

- Expressão regular do campo **usuário** compatível com a flag `v` do navegador (hífen escapado).
- Ícone SVG próprio, referenciado no HTML, eliminando a necessidade de carregar um favicon ausente.
- A verificação de senhas migrou de Web Crypto PBKDF2 para `node:crypto` PBKDF2: no Workers, Web Crypto bloqueia chamadas com mais de 100.000 iterações. O algoritmo, salt e os **600.000 ciclos dos hashes existentes** foram preservados; nenhuma senha foi alterada.
- Testes do fluxo de login e validação do nome de usuário adicionados. Não considerar CI aprovado nem login real validado até testar a versão publicada.
## Login compatível com Cloudflare Workers (outubro/2026)

A Cloudflare limita **cada chamada PBKDF2** a 100.000 iterações, inclusive por `node:crypto` no runtime publicado. Por isso, o login agora busca apenas sal e número de iterações da conta, deriva o segredo no **Web Crypto do navegador** e envia a prova por HTTPS. O Worker valida com comparação em tempo constante, sem recalcular PBKDF2 acima do limite.

- Os hashes existentes `pbkdf2-sha256` com **600.000 iterações** continuam válidos. Depois do primeiro login correto, são substituídos automaticamente por verificadores `pbkdf2-hmac`, protegidos por HMAC do segredo privado do Worker.
- Hashes criados pela API administrativa usam 100.000 iterações de PBKDF2 na Cloudflare e verificador com HMAC privado; a interface exige senha de no mínimo 12 caracteres na alteração.
- A alteração de senha também deriva o PBKDF2 no navegador; o servidor verifica a prova da senha anterior, sem receber senhas em texto puro.
- Nunca persistir prova de senha, hash de autenticação ou token de sessão no armazenamento do navegador; manter apenas a sessão enquanto a aba estiver aberta.
- Com `PASSWORD_HMAC_KEY` configurado, os verificadores antigos migram sozinhos no próximo login de cada conta; depois disso `FINANCEIRO_API_TOKEN` pode ser rotacionado sem afetar o login. Sem a chave nova, a rotação do token continua exigindo migração controlada.
- A autenticação ainda precisa ser exercitada no Worker publicado; testes de Node.js e Wrangler não comprovam o comportamento do edge.
## Segredos separados e limite de tentativas

Cada função tem segredo próprio: `FINANCEIRO_API_TOKEN` autoriza apenas o cadastro administrativo, `SESSION_SECRET` assina as sessões e `PASSWORD_HMAC_KEY` protege os verificadores de senha com HMAC. Sem os dois novos segredos, o Worker usa `FINANCEIRO_API_TOKEN` para tudo, comportamento igual ao anterior; nada quebra na atualização.

- Verificadores `pbkdf2-hmac` criados com a chave antiga continuam válidos: no primeiro login com `PASSWORD_HMAC_KEY` configurado, cada verificador é regravado com a chave nova, na mesma operação condicional já usada pela migração dos hashes PBKDF2.
- Trocar `SESSION_SECRET` apenas invalida as sessões ativas; basta entrar novamente.
- `GET /api/health` informa o estado: `configured`, `session_secret`, `password_key` e `rate_limiter`. Use para conferir o deploy publicado.
- O limite de tentativas é o binding nativo de rate limiting do Workers, sem dependências externas. É deliberadamente aproximado e por localização; para um uso público mais rígido, adicione também uma regra de rate limiting da Cloudflare na frente.
## Previews de branch (Workers Builds)

Cada branch nova recebe um Preview do Workers Builds (trigger com `npx wrangler preview`). Previews **não herdam** a configuração de produção: o bloco `previews` no `wrangler.jsonc` aponta o binding `DB` para o banco vazio e isolado `financeiro-preview` e define um namespace próprio para o limite de tentativas.

- Sem os segredos aplicados ao Preview, a API responde 503 e o site abre em modo demonstração: os dados reais nunca são expostos nem gravados em branch de teste.
- Nunca apontar o bloco `previews` para o D1 de produção.
- Para um Preview funcional com login: aplicar os segredos ao Preview, aplicar as migrations ao `financeiro-preview` e cadastrar um usuário de teste separado.
## CRUD de categorias

A tabela `categorias` está no D1 `financeiro` e possui `id`, `usuario_id`, `nome` e `tipo`. O nome é único **por usuário e por tipo**, ignorando diferenças entre letras maiúsculas e minúsculas. A migração `migrations/0004_categorias.sql` não modifica ou exclui lançamentos; aproveita as categorias encontradas nos registros existentes e oferece o catálogo inicial.

Todas as rotas abaixo exigem autenticação individual:
- `GET /api/categories` — listar somente as categorias do usuário;
- `POST /api/categories` — criar, enviando `{"name":"Mercado","type":"expense"}`;
- `PUT /api/categories/:id` — editar nome/tipo de categoria própria;
- `DELETE /api/categories/:id` — excluir uma categoria própria, **somente se não estiver em uso**.

A edição de nome também atualiza os nomes de categoria dos lançamentos existentes **do mesmo usuário e tipo**, na mesma operação transacional. Se a categoria for usada, não é permitido mudar seu tipo. Os lançamentos validam no servidor se a categoria pertence ao usuário e ao tipo escolhido. O valor financeiro, a data e o status dos lançamentos são preservados.

Categorias de **entrada** e de **saída** são independentes, inclusive quando têm o mesmo nome. Usuários novos criados pela API administrativa recebem as categorias iniciais; outras contas podem adicionar as suas no painel.
## Instalação como aplicativo (PWA)

O Financeiro tem manifesto, ícones PNG nativos de 192 e 512 pixels, suporte à instalação no Android, iOS e desktop, e service worker sem bibliotecas externas. O navegador precisa acessar o site em HTTPS (ou localhost no desenvolvimento). No celular, use o menu do navegador para instalar/adicionar à tela inicial.

**Privacidade:** apenas CSS, JavaScript e outros arquivos públicos podem ser armazenados pelo service worker. Requisições de `/api/*`, lançamentos financeiros, tokens e senhas nunca são armazenados em cache. Se a internet estiver indisponível, o PWA exibe uma tela explicativa; ele **não oferece acesso aos dados financeiros offline**. Ao reabrir, será necessário entrar novamente, pois a sessão fica na memória da aba.

Arquivos: `public/app.webmanifest`, `public/sw.js`, `public/offline.html` e `src/pwa-icons.js`. Ao alterar arquivos públicos precacheados, atualizar a versão `CACHE` em `public/sw.js`. Verifique antes do deploy com `npm test` e instale o PWA em um navegador real para validar o fluxo.