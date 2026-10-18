const MONEY_LIMIT = 100000000000;
const MAX_MONTH_ROWS = 5000;
const HEADER = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "X-Frame-Options": "DENY"
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: HEADER });
}

function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}

function monthKey(date) {
  return date.getUTCFullYear() + "-" + String(date.getUTCMonth() + 1).padStart(2, "0");
}

function shiftMonth(month, delta) {
  const [year, part] = month.split("-").map(Number);
  return monthKey(new Date(Date.UTC(year, part - 1 + delta, 1)));
}

function validMonth(value) {
  return typeof value === "string" && /^(20\d{2}|2100)-(0[1-9]|1[0-2])$/.test(value);
}

function validDate(value) {
  if (typeof value !== "string" || !/^(20\d{2}|2100)-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(value)) return false;
  const date = new Date(value + "T00:00:00Z");
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

function dateOffset(original, monthOffset) {
  const [year, month, day] = original.split("-").map(Number);
  const first = new Date(Date.UTC(year, month - 1 + monthOffset, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  return monthKey(first) + "-" + String(Math.min(day, last)).padStart(2, "0");
}

function normalizeTransaction(data, editing = false) {
  if (typeof data !== "object" || data === null || Array.isArray(data)) throw httpError(400, "Dados do lançamento inválidos.");
  const description = typeof data.description === "string" ? data.description.trim() : "";
  const category = typeof data.category === "string" ? data.category.trim() : "";
  const notes = typeof data.notes === "string" ? data.notes.trim() : "";
  if (!description || description.length > 100 || /[\u0000-\u001f]/.test(description)) throw httpError(400, "Descrição inválida.");
  if (!category || category.length > 40 || /[\u0000-\u001f]/.test(category)) throw httpError(400, "Categoria inválida.");
  if (notes.length > 300 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(notes)) throw httpError(400, "Observações inválidas.");
  if (data.type !== "income" && data.type !== "expense") throw httpError(400, "Tipo inválido.");
  if (data.status !== "paid" && data.status !== "pending") throw httpError(400, "Situação inválida.");
  if (!Number.isSafeInteger(data.amount_cents) || data.amount_cents < 1 || data.amount_cents > MONEY_LIMIT) throw httpError(400, "Valor inválido.");
  if (!validDate(data.date)) throw httpError(400, "Data inválida.");
  const installments = editing ? 1 : (data.installments ?? 1);
  if (!Number.isInteger(installments) || installments < 1 || installments > 24) throw httpError(400, "Quantidade de parcelas inválida.");
  if (!validDate(dateOffset(data.date, installments - 1))) throw httpError(400, "Data das parcelas fora do intervalo permitido.");
  return { description, category, notes, type: data.type, status: data.status, amount_cents: data.amount_cents, date: data.date, installments };
}

async function readPayload(request) {
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    throw httpError(415, "Envie dados em JSON.");
  }
  const raw = await request.text();
  if (raw.length > 6000) throw httpError(413, "Dados muito grandes.");
  try { return JSON.parse(raw); } catch { throw httpError(400, "JSON inválido."); }
}

async function checkToken(request, expected) {
  const header = request.headers.get("authorization") || "";
  if (!header.startsWith("Bearer ")) return false;
  const token = header.slice(7);
  if (token.length < 16 || token.length > 1024) return false;
  const encoder = new TextEncoder();
  const [givenHash, expectedHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(token)),
    crypto.subtle.digest("SHA-256", encoder.encode(expected))
  ]);
  const a = new Uint8Array(givenHash);
  const b = new Uint8Array(expectedHash);
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a[i] ^ b[i];
  return difference === 0;
}

function monthInput(url) {
  const month = url.searchParams.get("month");
  if (!validMonth(month)) throw httpError(400, "Mês inválido. Use AAAA-MM.");
  return month;
}

async function listTransactions(db, month) {
  const begin = month + "-01";
  const end = shiftMonth(month, 1) + "-01";
  const result = await db.prepare("SELECT id, description, type, category, amount_cents, date, status, notes, installment_group, installment_number, installment_total FROM transactions WHERE date >= ? AND date < ? ORDER BY date DESC, created_at DESC LIMIT ?")
    .bind(begin, end, MAX_MONTH_ROWS + 1).all();
  if (result.results.length > MAX_MONTH_ROWS) throw httpError(409, "Limite de lançamentos do mês atingido. Consulte o suporte antes de continuar.");
  return json({ transactions: result.results });
}

async function getTrends(db, month) {
  const first = shiftMonth(month, -5);
  const end = shiftMonth(month, 1);
  const result = await db.prepare("SELECT substr(date, 1, 7) AS month, type, SUM(amount_cents) AS total FROM transactions WHERE date >= ? AND date < ? GROUP BY month, type")
    .bind(first + "-01", end + "-01").all();
  const months = Array.from({ length: 6 }, (_, index) => ({
    month: shiftMonth(first, index), income_cents: 0, expense_cents: 0
  }));
  const map = new Map(months.map((row) => [row.month, row]));
  for (const row of result.results) {
    const item = map.get(row.month);
    if (item && (row.type === "income" || row.type === "expense")) item[row.type + "_cents"] = row.total;
  }
  return json({ months });
}

async function insertTransaction(db, request) {
  const data = normalizeTransaction(await readPayload(request));
  const group = data.installments > 1 ? crypto.randomUUID() : null;
  const statements = [];
  const ids = [];
  for (let i = 0; i < data.installments; i++) {
    const id = crypto.randomUUID();
    ids.push(id);
    statements.push(
      db.prepare("INSERT INTO transactions (id, description, type, category, amount_cents, date, status, notes, installment_group, installment_number, installment_total) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(id, data.description, data.type, data.category, data.amount_cents, dateOffset(data.date, i), data.status, data.notes, group, group ? i + 1 : null, group ? data.installments : null)
    );
  }
  // D1 executes db.batch transactionally: either all installments are created or none.
  await db.batch(statements);
  return json({ ids, created: ids.length }, 201);
}

async function updateTransaction(db, request, id) {
  const data = normalizeTransaction(await readPayload(request), true);
  const result = await db.prepare("UPDATE transactions SET description = ?, type = ?, category = ?, amount_cents = ?, date = ?, status = ?, notes = ?, updated_at = datetime('now') WHERE id = ?")
    .bind(data.description, data.type, data.category, data.amount_cents, data.date, data.status, data.notes, id).run();
  if (!result.meta?.changes) throw httpError(404, "Lançamento não encontrado.");
  return json({ updated: true });
}

async function deleteTransaction(db, id) {
  const result = await db.prepare("DELETE FROM transactions WHERE id = ?").bind(id).run();
  if (!result.meta?.changes) throw httpError(404, "Lançamento não encontrado.");
  return json({ deleted: true });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/")) {
      return env.ASSETS ? env.ASSETS.fetch(request) : new Response("Não encontrado", { status: 404 });
    }
    if (url.pathname === "/api/health" && request.method === "GET") {
      return json({ configured: Boolean(env.DB && typeof env.FINANCEIRO_API_TOKEN === "string" && env.FINANCEIRO_API_TOKEN.length >= 32) });
    }
    if (!env.DB || !env.FINANCEIRO_API_TOKEN || env.FINANCEIRO_API_TOKEN.length < 32) {
      return json({ error: "Configure um novo D1 e uma chave segura para habilitar a API." }, 503);
    }
    try {
      const origin = request.headers.get("origin");
      if (origin && origin !== url.origin) throw httpError(403, "Origem não autorizada.");
      if (!await checkToken(request, env.FINANCEIRO_API_TOKEN)) throw httpError(401, "Chave de acesso inválida.");
      if (url.pathname === "/api/transactions" && request.method === "GET") return await listTransactions(env.DB, monthInput(url));
      if (url.pathname === "/api/trends" && request.method === "GET") return await getTrends(env.DB, monthInput(url));
      if (url.pathname === "/api/transactions" && request.method === "POST") return await insertTransaction(env.DB, request);
      const match = url.pathname.match(/^\/api\/transactions\/([0-9a-f-]{36})$/);
      if (match && request.method === "PUT") return await updateTransaction(env.DB, request, match[1]);
      if (match && request.method === "DELETE") return await deleteTransaction(env.DB, match[1]);
      throw httpError(404, "Rota não encontrada.");
    } catch (error) {
      if (!error.status) console.error("Falha interna na API Financeiro", error.name);
      return json({ error: error.status ? error.message : "Erro interno. Verifique a configuração do novo D1." }, error.status || 500);
    }
  }
};

export { normalizeTransaction, shiftMonth, dateOffset, validDate, validMonth };