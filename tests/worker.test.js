import test from "node:test";
import assert from "node:assert/strict";
import worker, { normalizeTransaction, validDate, validMonth, dateOffset, shiftMonth } from "../src/worker.js";

const valid = {
  description: "Compra de exemplo",
  category: "Compras",
  type: "expense",
  status: "pending",
  amount_cents: 19990,
  date: "2026-01-31",
  notes: "",
  installments: 3
};

test("datas e parcelas preservam o dia quando possível", () => {
  assert.equal(dateOffset("2026-01-31", 1), "2026-02-28");
  assert.equal(dateOffset("2026-01-31", 2), "2026-03-31");
  assert.equal(shiftMonth("2026-12", 1), "2027-01");
  assert.equal(validDate("2026-02-30"), false);
  assert.equal(validMonth("2026-13"), false);
});

test("valores ficam em centavos inteiros", () => {
  assert.equal(normalizeTransaction(valid).amount_cents, 19990);
  assert.throws(() => normalizeTransaction({ ...valid, amount_cents: 19.9 }), /Valor inválido/);
  assert.throws(() => normalizeTransaction({ ...valid, amount_cents: -1 }), /Valor inválido/);
});

test("não permite mais de 24 parcelas nem entrada inválida", () => {
  assert.throws(() => normalizeTransaction({ ...valid, installments: 25 }), /parcelas inválida/);
  assert.throws(() => normalizeTransaction({ ...valid, description: "" }), /Descrição inválida/);
  assert.throws(() => normalizeTransaction({ ...valid, date: "2026-02-30" }), /Data inválida/);
});

test("sem D1 e sem segredo, API real fica bloqueada", async () => {
  const health = await worker.fetch(new Request("https://site.example/api/health"), {});
  assert.deepEqual(await health.json(), { configured: false });
  const blocked = await worker.fetch(new Request("https://site.example/api/transactions?month=2026-10"), {});
  assert.equal(blocked.status, 503);
});

test("chave incorreta não permite leitura", async () => {
  const response = await worker.fetch(new Request("https://site.example/api/transactions?month=2026-10", {
    headers: { Authorization: "Bearer chave-nao-valida-para-acesso" }
  }), { DB: {}, FINANCEIRO_API_TOKEN: "a".repeat(48) });
  assert.equal(response.status, 401);
});
