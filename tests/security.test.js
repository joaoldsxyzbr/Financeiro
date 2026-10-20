import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import worker, { secretsFor } from "../src/worker.js";
import { checkProof, storeProof, issueSession, sessionUserId } from "../src/auth.js";

const key32 = prefix => prefix.repeat(4).slice(0, 32);
const legacyKey = key32("legado_financeiro_");
const passwordKey = key32("chave_nova_de_senha_");
const sessionSecret = key32("segredo_proprio_sessao_");
const adminToken = key32("token_administrativo_");

const b64 = bytes => Buffer.from(bytes).toString("base64url");
const proof = b64(new Uint8Array(32).fill(7));
const wrongProof = b64(new Uint8Array(32).fill(9));
const salt = b64(new Uint8Array(16).fill(3));

function dbMock() {
  return { prepare() { return { bind() { return this; }, async first() { return null; }, async all() { return { results: [] }; }, async run() { return { meta: { changes: 0 } }; } }; } };
}

test("verificador HMAC antigo autentica pela chave legada e migra para a nova",async()=>{
  const legacyHash=await storeProof(proof,salt,600000,legacyKey,"joao");
  const migrated=await checkProof(legacyHash,proof,passwordKey,legacyKey,"joao");
  assert.equal(migrated.valid,true);
  assert.match(migrated.upgrade,/^pbkdf2-hmac\$600000\$/);
  const renewed=await checkProof(migrated.upgrade,proof,passwordKey,null,"joao");
  assert.equal(renewed.valid,true);
  assert.equal(renewed.upgrade,null);
  assert.equal((await checkProof(legacyHash,proof,passwordKey,null,"joao")).valid,false);
  assert.equal((await checkProof(legacyHash,wrongProof,passwordKey,legacyKey,"joao")).valid,false);
});
test("hash pbkdf2-sha256 antigo continua válido e migra",async()=>{
  const raw="pbkdf2-sha256$600000$"+salt+"$"+proof;
  const migrated=await checkProof(raw,proof,passwordKey,legacyKey,"joao");
  assert.equal(migrated.valid,true);
  assert.match(migrated.upgrade,/^pbkdf2-hmac\$/);
});
test("sessão é assinada com segredo próprio e separado",async()=>{
  const token=await issueSession(1,sessionSecret);
  assert.equal(await sessionUserId(token,sessionSecret),1);
  assert.equal(await sessionUserId(token,legacyKey),null);
});
test("secretsFor separa funções com fallback seguro",()=>{
  const separated=secretsFor({FINANCEIRO_API_TOKEN:adminToken,SESSION_SECRET:sessionSecret,PASSWORD_HMAC_KEY:passwordKey});
  assert.equal(separated.session,sessionSecret);
  assert.equal(separated.password,passwordKey);
  assert.equal(separated.admin,adminToken);
  assert.equal(separated.legacyPassword,adminToken);
  const fallback=secretsFor({FINANCEIRO_API_TOKEN:adminToken});
  assert.equal(fallback.session,adminToken);
  assert.equal(fallback.password,adminToken);
});
test("login acima do limite devolve 429",async()=>{
  const env={DB:dbMock(),FINANCEIRO_API_TOKEN:adminToken,LOGIN_RATE_LIMITER:{limit:async()=>({success:false})}};
  const params=await worker.fetch(new Request("https://financeiro.example/api/login/params?usuario=joao"),env);
  assert.equal(params.status,429);
  const login=await worker.fetch(new Request("https://financeiro.example/api/login",{
    method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({usuario:"joao",proof})
  }),env);
  assert.equal(login.status,429);
});
test("sem binding de limite a API continua funcionando",async()=>{
  const env={DB:dbMock(),FINANCEIRO_API_TOKEN:adminToken};
  const response=await worker.fetch(new Request("https://financeiro.example/api/login/params?usuario=joao"),env);
  assert.equal(response.status,200);
});
test("health informa a configuração de segurança atual",async()=>{
  const base=await (await worker.fetch(new Request("https://financeiro.example/api/health"),{DB:{}})).json();
  assert.deepEqual(base,{configured:false,session_secret:false,password_key:false,rate_limiter:false});
  const full=await (await worker.fetch(new Request("https://financeiro.example/api/health"),{
    DB:{},FINANCEIRO_API_TOKEN:adminToken,SESSION_SECRET:sessionSecret,PASSWORD_HMAC_KEY:passwordKey,
    LOGIN_RATE_LIMITER:{limit:async()=>({success:true})}
  })).json();
  assert.deepEqual(full,{configured:true,session_secret:true,password_key:true,rate_limiter:true});
});

test("binding de limite no wrangler.jsonc confere com o nome usado no worker",()=>{
  const config=JSON.parse(readFileSync(new URL("../wrangler.jsonc",import.meta.url),"utf8"));
  const binding=config.ratelimits?.find(r=>r.name==="LOGIN_RATE_LIMITER");
  assert.ok(binding,"wrangler.jsonc deve declarar o binding LOGIN_RATE_LIMITER");
  assert.equal(binding.simple.limit,20);
  assert.equal(binding.simple.period,60);
  const workerSrc=readFileSync(new URL("../src/worker.js",import.meta.url),"utf8");
  assert.ok(workerSrc.includes("env.LOGIN_RATE_LIMITER"),"worker.js deve usar env.LOGIN_RATE_LIMITER");
});
