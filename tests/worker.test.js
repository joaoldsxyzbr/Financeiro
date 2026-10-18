import test from "node:test";
import assert from "node:assert/strict";
import worker,{normalizeTransaction,validMonth,shiftMonth} from "../src/worker.js";

const base={description:"Aluguel",type:"expense",category:"Moradia",amount_cents:85990,date:"2026-11",status:"pending"};

test("somente mês e ano",()=>{
  assert.equal(validMonth("2026-11"),true);
  assert.equal(validMonth("2026-11-18"),false);
  assert.equal(validMonth("2026-13"),false);
  assert.equal(shiftMonth("2026-12",1),"2027-01");
});
test("cinco colunas exatas e sinal do valor",()=>{
  assert.deepEqual(normalizeTransaction(base),{data:"2026-11",descricao:"Aluguel",valor:-85990,categoria:"Moradia",status:"pendente"});
  assert.equal(normalizeTransaction({...base,type:"income",status:"paid"}).valor,85990);
  assert.equal(normalizeTransaction({...base,status:"paid"}).status,"pago");
});
test("validação financeira",()=>{
  assert.throws(()=>normalizeTransaction({...base,amount_cents:19.9}),/Valor inválido/);
  assert.throws(()=>normalizeTransaction({...base,amount_cents:0}),/Valor inválido/);
  assert.throws(()=>normalizeTransaction({...base,date:"2026-11-18"}),/Mês inválido/);
});
test("sem segredo não permite API real",async()=>{
  const health=await worker.fetch(new Request("https://financeiro.example/api/health"),{DB:{}});
  assert.deepEqual(await health.json(),{configured:false});
  const blocked=await worker.fetch(new Request("https://financeiro.example/api/transactions?month=2026-11"),{DB:{}});
  assert.equal(blocked.status,503);
});
test("segredo incorreto não permite acesso",async()=>{
  const blocked=await worker.fetch(new Request("https://financeiro.example/api/transactions?month=2026-11",{headers:{Authorization:"Bearer acesso-incorreto-e-nao-valido"}}),{DB:{},FINANCEIRO_API_TOKEN:"x".repeat(48)});
  assert.equal(blocked.status,401);
});
