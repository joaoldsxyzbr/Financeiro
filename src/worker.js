const MAX_VALUE = 100000000000;
const headers = {
  "Content-Type":"application/json; charset=utf-8",
  "Cache-Control":"no-store",
  "X-Content-Type-Options":"nosniff",
  "Referrer-Policy":"no-referrer",
  "X-Frame-Options":"DENY"
};
const json = (value,status=200) => new Response(JSON.stringify(value),{status,headers});
const error = (status,message) => Object.assign(new Error(message),{status});
const validMonth = value => typeof value === "string" && /^(20\d{2}|2100)-(0[1-9]|1[0-2])$/.test(value);
function shiftMonth(value,offset) {
  const [year,month] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year,month-1+offset,1));
  return date.getUTCFullYear() + "-" + String(date.getUTCMonth()+1).padStart(2,"0");
}
function normalizeTransaction(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) throw error(400,"Lançamento inválido.");
  const descricao = typeof data.description === "string" ? data.description.trim() : "";
  const categoria = typeof data.category === "string" ? data.category.trim() : "";
  if (!descricao || descricao.length > 100 || /[\u0000-\u001f]/.test(descricao)) throw error(400,"Descrição inválida.");
  if (!categoria || categoria.length > 40 || /[\u0000-\u001f]/.test(categoria)) throw error(400,"Categoria inválida.");
  if (!validMonth(data.date)) throw error(400,"Mês inválido: informe AAAA-MM.");
  if (!Number.isSafeInteger(data.amount_cents) || data.amount_cents < 1 || data.amount_cents > MAX_VALUE) throw error(400,"Valor inválido.");
  if (data.type !== "income" && data.type !== "expense") throw error(400,"Tipo inválido.");
  if (data.status !== "pending" && data.status !== "paid") throw error(400,"Status inválido.");
  return {
    data:data.date, descricao,
    valor: data.type === "income" ? data.amount_cents : -data.amount_cents,
    categoria, status: data.status === "paid" ? "pago" : "pendente"
  };
}
async function parseRequest(request) {
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) throw error(415,"Envie JSON.");
  const raw=await request.text();
  if(raw.length > 5000)throw error(413,"Conteúdo muito grande.");
  try{return JSON.parse(raw)}catch{throw error(400,"JSON inválido.")}
}
async function authorized(request,expected) {
  const auth=request.headers.get("authorization") || "";
  if (!auth.startsWith("Bearer "))return false;
  const token=auth.slice(7);
  if(token.length<16 || token.length>1024)return false;
  const encoder=new TextEncoder();
  const [a,b]=await Promise.all([crypto.subtle.digest("SHA-256",encoder.encode(token)),crypto.subtle.digest("SHA-256",encoder.encode(expected))]);
  let difference=0;const x=new Uint8Array(a),y=new Uint8Array(b);
  for(let i=0;i<x.length;i++) difference |= x[i]^y[i];
  return difference===0;
}
function requiredMonth(url) {
  const value=url.searchParams.get("month");
  if (!validMonth(value))throw error(400,"Mês inválido. Use AAAA-MM.");
  return value;
}
// rowid é implícito do SQLite; a tabela possui somente cinco colunas.
const select = "SELECT rowid AS id, data AS date, descricao AS description, CASE WHEN valor>0 THEN 'income' ELSE 'expense' END AS type, ABS(valor) AS amount_cents, categoria AS category, CASE WHEN status='pago' THEN 'paid' ELSE 'pending' END AS status FROM registros";
async function list(db,month) {
  const r=await db.prepare(select+" WHERE data=? ORDER BY rowid DESC LIMIT 5001").bind(month).all();
  if(r.results.length>5000)throw error(409,"Limite mensal de 5.000 registros atingido.");
  return json({transactions:r.results});
}
async function trend(db,month) {
  const begin=shiftMonth(month,-5);
  const r=await db.prepare("SELECT data AS month, SUM(CASE WHEN valor>0 THEN valor ELSE 0 END) AS income_cents, SUM(CASE WHEN valor<0 THEN -valor ELSE 0 END) AS expense_cents FROM registros WHERE data>=? AND data<=? GROUP BY data").bind(begin,month).all();
  const months=Array.from({length:6},(_,i)=>({month:shiftMonth(begin,i),income_cents:0,expense_cents:0}));
  const map=new Map(months.map(item=>[item.month,item]));
  for(const item of r.results){const m=map.get(item.month);if(m){m.income_cents=item.income_cents||0;m.expense_cents=item.expense_cents||0;}}
  return json({months});
}
async function create(db,request) {
  const x=normalizeTransaction(await parseRequest(request));
  const r=await db.prepare("INSERT INTO registros (data,descricao,valor,categoria,status) VALUES (?,?,?,?,?)").bind(x.data,x.descricao,x.valor,x.categoria,x.status).run();
  return json({created:true,id:r.meta.last_row_id},201);
}
async function update(db,request,id) {
  const x=normalizeTransaction(await parseRequest(request));
  const r=await db.prepare("UPDATE registros SET data=?,descricao=?,valor=?,categoria=?,status=? WHERE rowid=?").bind(x.data,x.descricao,x.valor,x.categoria,x.status,id).run();
  if(!r.meta?.changes)throw error(404,"Registro não encontrado.");
  return json({updated:true});
}
async function remove(db,id) {
  const r=await db.prepare("DELETE FROM registros WHERE rowid=?").bind(id).run();
  if(!r.meta?.changes)throw error(404,"Registro não encontrado.");
  return json({deleted:true});
}
export default {
  async fetch(request,env) {
    const url=new URL(request.url);
    if(!url.pathname.startsWith("/api/"))return env.ASSETS?env.ASSETS.fetch(request):new Response("Não encontrado",{status:404});
    if(url.pathname==="/api/health"&&request.method==="GET")return json({configured:Boolean(env.DB&&typeof env.FINANCEIRO_API_TOKEN==="string"&&env.FINANCEIRO_API_TOKEN.length>=32)});
    if(!env.DB||typeof env.FINANCEIRO_API_TOKEN!=="string"||env.FINANCEIRO_API_TOKEN.length<32)return json({error:"Configure FINANCEIRO_API_TOKEN para acessar registros reais."},503);
    try {
      const origin=request.headers.get("origin");
      if(origin&&origin!==url.origin)throw error(403,"Origem não autorizada.");
      if(!await authorized(request,env.FINANCEIRO_API_TOKEN))throw error(401,"Chave de acesso inválida.");
      if(url.pathname==="/api/transactions"&&request.method==="GET")return list(env.DB,requiredMonth(url));
      if(url.pathname==="/api/trends"&&request.method==="GET")return trend(env.DB,requiredMonth(url));
      if(url.pathname==="/api/transactions"&&request.method==="POST")return create(env.DB,request);
      const match=url.pathname.match(/^\/api\/transactions\/([1-9]\d{0,15})$/);
      if(match) {
        const id=Number(match[1]);
        if(!Number.isSafeInteger(id))throw error(400,"ID inválido.");
        if(request.method==="PUT")return update(env.DB,request,id);
        if(request.method==="DELETE")return remove(env.DB,id);
      }
      throw error(404,"Rota não encontrada.");
    } catch(e) {
      if(!e.status)console.error("Erro interno do Financeiro",e.name);
      return json({error:e.status?e.message:"Erro interno ao consultar registros."},e.status||500);
    }
  }
};
export {normalizeTransaction,validMonth,shiftMonth};