import test from "node:test";
import assert from "node:assert/strict";
import worker, { normalizeTransaction, validMonth, shiftMonth } from "../src/worker.js";
import { hashPassword, verifyPassword, issueSession, sessionUserId, validateNewUser } from "../src/auth.js";

const secret="somente_um_segredo_de_teste_aleatorio_".repeat(2);
const base={description:"Mercado",type:"expense",category:"Alimentação",amount_cents:85990,date:"2026-11",status:"pending"};

test("mês, valor e tipo validados",()=>{
  assert.equal(validMonth("2026-11"),true);
  assert.equal(validMonth("2026-11-18"),false);
  assert.equal(shiftMonth("2026-12",1),"2027-01");
  assert.deepEqual(normalizeTransaction(base),{data:"2026-11",tipo:"saida",descricao:"Mercado",valor:85990,categoria:"Alimentação",status:"pendente"});
  assert.throws(()=>normalizeTransaction({...base,amount_cents:1.9}),/Valor inválido/);
});
test("senhas têm salt e verificação segura",async()=>{
  const a=await hashPassword("Uma senha segura #2026");
  const b=await hashPassword("Uma senha segura #2026");
  assert.notEqual(a,b);
  assert.equal(await verifyPassword("Uma senha segura #2026",a),true);
  assert.equal(await verifyPassword("outra senha bem diferente",a),false);
  assert.deepEqual(validateNewUser({nome:"Maria",usuario:"maria_02",senha:"Uma senha segura #2026"}).usuario,"maria_02");
});
test("sessão é assinada e rejeita alterações",async()=>{
  const token=await issueSession(2,secret);
  assert.equal(await sessionUserId(token,secret),2);
  assert.equal(await sessionUserId(token+"adulterado",secret),null);
  assert.equal(await sessionUserId(token,"outro_segredo_com_comprimento_suficiente_000"),null);
});
test("API é fechada sem configuração",async()=>{
  const health=await worker.fetch(new Request("https://financeiro.example/api/health"),{DB:{}});
  assert.deepEqual(await health.json(),{configured:false});
  const data=await worker.fetch(new Request("https://financeiro.example/api/transactions?month=2026-11"),{DB:{}});
  assert.equal(data.status,503);
});
function dbMock() {
  const calls=[];
  const users=[
    {id:1,nome:"Maria",usuario:"maria",senha_hash:""},
    {id:2,nome:"João",usuario:"joao",senha_hash:""}
  ];
  const db={
    prepare(sql) {
      const query={sql,args:[],bind(...args){this.args=args;return this;},
        async all(){calls.push(this);return {results:[]};},
        async first(){calls.push(this);return users.find(u=>u.id===this.args[0])||null;},
        async run(){calls.push(this);return {meta:{changes:0}};}
      };
      return query;
    }
  };
  return {db,calls};
}
test("consulta e gráfico são filtrados pelo usuário autenticado",async()=>{
  const {db,calls}=dbMock();
  const token=await issueSession(1,secret);
  const env={DB:db,FINANCEIRO_API_TOKEN:secret};
  for(const path of ["/api/transactions?month=2026-11","/api/trends?month=2026-11"]){
    const response=await worker.fetch(new Request("https://financeiro.example"+path,{headers:{Authorization:"Bearer "+token}}),env);
    assert.equal(response.status,200);
  }
  assert.ok(calls.some(x=>x.sql.includes("WHERE data=? AND usuario_id=?")&&x.args[1]===1));
  assert.ok(calls.some(x=>x.sql.includes("WHERE usuario_id=? AND data>=?")&&x.args[0]===1));
});
test("alterar ou excluir exige propriedade da linha",async()=>{
  const {db,calls}=dbMock();
  const token=await issueSession(2,secret);
  const env={DB:db,FINANCEIRO_API_TOKEN:secret};
  const prefix="https://financeiro.example/api/transactions/25";
  const changed=await worker.fetch(new Request(prefix,{
    method:"PUT",headers:{Authorization:"Bearer "+token,"Content-Type":"application/json"},
    body:JSON.stringify(base)
  }),env);
  assert.equal(changed.status,404);
  const deleted=await worker.fetch(new Request(prefix,{method:"DELETE",headers:{Authorization:"Bearer "+token}}),env);
  assert.equal(deleted.status,404);
  assert.ok(calls.some(x=>x.sql.includes("WHERE rowid=? AND usuario_id=?")&&x.args.at(-1)===2));
});
test("sem login usuário não acessa registros",async()=>{
  const response=await worker.fetch(new Request("https://financeiro.example/api/transactions?month=2026-11"),{DB:dbMock().db,FINANCEIRO_API_TOKEN:secret});
  assert.equal(response.status,401);
});
test("login inválido não retorna erro 500",async()=>{
  const env={DB:{prepare(){return {bind(){return this;},async first(){return null;}};}},FINANCEIRO_API_TOKEN:secret};
  const request=new Request("https://financeiro.example/api/login",{
    method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({usuario:"inexistente",proof:"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"})
  });
  const response=await worker.fetch(request,env);
  assert.equal(response.status,401);
});
test("pattern HTML de usuário usa regex compatível com a flag v",()=>{
  const re=new RegExp("^[A-Za-z0-9._\\-]{3,50}$","v");
  assert.equal(re.test("joaoldsxyzbr"),true);
  assert.equal(re.test("usuario-com-hifen"),true);
  assert.equal(re.test("invalido espaço"),false);
});