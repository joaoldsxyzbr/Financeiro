import { hashPassword, verifyPassword, validateNewUser, validUsername, issueSession, sessionUserId, verifyAdminToken } from "./auth.js";

const MAX_VALUE = 100000000000;
const headers = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "X-Frame-Options": "DENY"
};
const json = (value, status=200) => new Response(JSON.stringify(value), {status,headers});
const error = (status, message) => Object.assign(new Error(message), {status});
const validMonth = value => typeof value === "string" && /^(20\d{2}|2100)-(0[1-9]|1[0-2])$/.test(value);

function shiftMonth(value, offset) {
  const [year, month] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month-1+offset, 1));
  return date.getUTCFullYear() + "-" + String(date.getUTCMonth()+1).padStart(2, "0");
}

function normalizeTransaction(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) throw error(400, "Lançamento inválido.");
  const descricao = typeof data.description === "string" ? data.description.trim() : "";
  const categoria = typeof data.category === "string" ? data.category.trim() : "";
  if (!descricao || descricao.length > 100 || /[\u0000-\u001f]/.test(descricao)) throw error(400, "Descrição inválida.");
  if (!categoria || categoria.length > 40 || /[\u0000-\u001f]/.test(categoria)) throw error(400, "Categoria inválida.");
  if (!validMonth(data.date)) throw error(400, "Mês inválido: informe AAAA-MM.");
  if (!Number.isSafeInteger(data.amount_cents) || data.amount_cents < 1 || data.amount_cents > MAX_VALUE) throw error(400, "Valor inválido.");
  if (data.type !== "income" && data.type !== "expense") throw error(400, "Tipo inválido.");
  if (data.status !== "pending" && data.status !== "paid") throw error(400, "Status inválido.");
  return {
    data: data.date, tipo: data.type === "income" ? "entrada" : "saida",
    descricao, valor: data.amount_cents, categoria,
    status: data.status === "paid" ? "pago" : "pendente"
  };
}
async function parseRequest(request) {
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) throw error(415, "Envie JSON.");
  const raw = await request.text();
  if (raw.length > 5000) throw error(413, "Conteúdo muito grande.");
  try { return JSON.parse(raw); } catch { throw error(400, "JSON inválido."); }
}
function requiredMonth(url) {
  const value = url.searchParams.get("month");
  if (!validMonth(value)) throw error(400, "Mês inválido. Use AAAA-MM.");
  return value;
}
function requireSecret(env) {
  return Boolean(env.DB && typeof env.FINANCEIRO_API_TOKEN === "string" && env.FINANCEIRO_API_TOKEN.length >= 32);
}

const select = "SELECT rowid AS id, data AS date, descricao AS description, CASE WHEN tipo='entrada' THEN 'income' ELSE 'expense' END AS type, valor AS amount_cents, categoria AS category, CASE WHEN status='pago' THEN 'paid' ELSE 'pending' END AS status FROM registros";

async function list(db, month, userId) {
  const result = await db.prepare(select + " WHERE data=? AND usuario_id=? ORDER BY rowid DESC LIMIT 5001").bind(month, userId).all();
  if (result.results.length > 5000) throw error(409, "Limite mensal de 5.000 registros atingido.");
  return json({transactions:result.results});
}
async function trend(db, month, userId) {
  const begin = shiftMonth(month, -5);
  const result = await db.prepare("SELECT data AS month, SUM(CASE WHEN tipo='entrada' THEN valor ELSE 0 END) AS income_cents, SUM(CASE WHEN tipo='saida' THEN valor ELSE 0 END) AS expense_cents FROM registros WHERE usuario_id=? AND data>=? AND data<=? GROUP BY data")
    .bind(userId, begin, month).all();
  const months = Array.from({length:6}, (_,i)=>({month:shiftMonth(begin,i),income_cents:0,expense_cents:0}));
  const map = new Map(months.map(item=>[item.month,item]));
  for (const item of result.results) {
    const monthRow = map.get(item.month);
    if (monthRow) {monthRow.income_cents=item.income_cents||0; monthRow.expense_cents=item.expense_cents||0;}
  }
  return json({months});
}
async function create(db, request, userId) {
  const x = normalizeTransaction(await parseRequest(request));
  const result = await db.prepare("INSERT INTO registros (data,tipo,descricao,valor,categoria,status,usuario_id) VALUES (?,?,?,?,?,?,?)")
    .bind(x.data,x.tipo,x.descricao,x.valor,x.categoria,x.status,userId).run();
  return json({created:true,id:result.meta.last_row_id},201);
}
async function update(db, request, id, userId) {
  const x=normalizeTransaction(await parseRequest(request));
  const result = await db.prepare("UPDATE registros SET data=?,tipo=?,descricao=?,valor=?,categoria=?,status=? WHERE rowid=? AND usuario_id=?")
    .bind(x.data,x.tipo,x.descricao,x.valor,x.categoria,x.status,id,userId).run();
  if (!result.meta?.changes) throw error(404, "Registro não encontrado.");
  return json({updated:true});
}
async function remove(db, id, userId) {
  const result = await db.prepare("DELETE FROM registros WHERE rowid=? AND usuario_id=?").bind(id,userId).run();
  if (!result.meta?.changes) throw error(404, "Registro não encontrado.");
  return json({deleted:true});
}
async function login(db, request, secret) {
  const payload = await parseRequest(request);
  if (!payload || !validUsername(payload.usuario) || typeof payload.senha !== "string" || payload.senha.length > 128) throw error(401, "Usuário ou senha incorretos.");
  const row = await db.prepare("SELECT id,nome,usuario,senha_hash FROM usuarios WHERE usuario=?").bind(payload.usuario).first();
  // Mesma quantidade de trabalho com usuário inexistente, reduzindo enumeração por tempo.
  const fallback = "pbkdf2-sha256$600000$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
  const valid = await verifyPassword(payload.senha, row?.senha_hash || fallback);
  if (!row || !valid) throw error(401, "Usuário ou senha incorretos.");
  const token = await issueSession(row.id, secret);
  return json({token, user:{id:row.id,nome:row.nome,usuario:row.usuario}});
}
async function createUser(db, request) {
  let data;
  try { data = validateNewUser(await parseRequest(request)); }
  catch (e) { throw error(400, e.message); }
  const hash = await hashPassword(data.senha);
  try {
    const result = await db.prepare("INSERT INTO usuarios (nome,usuario,senha_hash) VALUES (?,?,?)").bind(data.nome,data.usuario,hash).run();
    return json({created:true,id:result.meta.last_row_id,usuario:data.usuario},201);
  } catch (e) {
    if (String(e.message).includes("UNIQUE")) throw error(409, "Nome de usuário já existe.");
    throw e;
  }
}
async function getUser(db, request, secret) {
  const auth = request.headers.get("authorization") || "";
  if (!auth.startsWith("Bearer ")) throw error(401, "Autenticação obrigatória.");
  const id = await sessionUserId(auth.slice(7), secret);
  if (!id) throw error(401, "Sessão inválida ou expirada.");
  const user = await db.prepare("SELECT id,nome,usuario FROM usuarios WHERE id=?").bind(id).first();
  if (!user) throw error(401, "Usuário não encontrado.");
  return user;
}

async function changePassword(db,request,user){
  const body=await parseRequest(request);
  if(!body||typeof body.senha_atual!=="string"||typeof body.nova_senha!=="string")
    throw error(400,"Informe a senha atual e nova senha.");
  if(body.nova_senha.length<12||body.nova_senha.length>128)
    throw error(400,"A nova senha precisa ter 12 a 128 caracteres.");
  const row=await db.prepare("SELECT senha_hash FROM usuarios WHERE id=?").bind(user.id).first();
  if(!row||!await verifyPassword(body.senha_atual,row.senha_hash))throw error(401,"Senha atual incorreta.");
  const hash=await hashPassword(body.nova_senha);
  await db.prepare("UPDATE usuarios SET senha_hash=? WHERE id=?").bind(hash,user.id).run();
  return json({updated:true});
}
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/")) return env.ASSETS ? env.ASSETS.fetch(request) : new Response("Não encontrado",{status:404});
    if (url.pathname === "/api/health" && request.method==="GET") return json({configured:requireSecret(env)});
    if (!requireSecret(env)) return json({error:"Configure o D1 e FINANCEIRO_API_TOKEN para acessar os registros."},503);
    try {
      const origin = request.headers.get("origin");
      if (origin && origin !== url.origin) throw error(403,"Origem não autorizada.");
      if (url.pathname==="/api/login" && request.method==="POST") return await login(env.DB,request,env.FINANCEIRO_API_TOKEN);
      if (url.pathname==="/api/admin/users" && request.method==="POST") {
        if (!await verifyAdminToken(request,env.FINANCEIRO_API_TOKEN)) throw error(401,"Credencial administrativa inválida.");
        return await createUser(env.DB,request);
      }
      const user = await getUser(env.DB,request,env.FINANCEIRO_API_TOKEN);
      if (url.pathname==="/api/me" && request.method==="GET") return json({user});
      if (url.pathname==="/api/me/password" && request.method==="POST") return await changePassword(env.DB,request,user);
      if (url.pathname==="/api/transactions" && request.method==="GET") return await list(env.DB,requiredMonth(url),user.id);
      if (url.pathname==="/api/trends" && request.method==="GET") return await trend(env.DB,requiredMonth(url),user.id);
      if (url.pathname==="/api/transactions" && request.method==="POST") return await create(env.DB,request,user.id);
      const match=url.pathname.match(/^\/api\/transactions\/([1-9]\d{0,15})$/);
      if (match) {
        const id=Number(match[1]);
        if(!Number.isSafeInteger(id)) throw error(400,"ID inválido.");
        if(request.method==="PUT") return await update(env.DB,request,id,user.id);
        if(request.method==="DELETE") return await remove(env.DB,id,user.id);
      }
      throw error(404,"Rota não encontrada.");
    } catch (e) {
      if(!e.status) console.error("Erro interno Financeiro",e.name);
      return json({error:e.status?e.message:"Erro interno ao consultar registros."},e.status||500);
    }
  }
};
export {normalizeTransaction, validMonth, shiftMonth};