const byId = (id) => document.getElementById(id);
const money = (cents) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
const monthText = (key) => {
  const [year, month] = key.split("-").map(Number);
  return new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(new Date(year, month - 1, 1));
};
const shortMonth = (key) => {
  const [year, month] = key.split("-").map(Number);
  return new Intl.DateTimeFormat("pt-BR", { month: "short" }).format(new Date(year, month - 1, 1)).replace(".", "");
};
const monthKey = (date) => String(date.getFullYear()) + "-" + String(date.getMonth() + 1).padStart(2, "0");
const plusMonths = (key, offset) => {
  const [year, month] = key.split("-").map(Number);
  return monthKey(new Date(year, month - 1 + offset, 1));
};
const formatDate = (iso) => monthText(iso);
const categories = {
  expense: ["Moradia", "Alimentação", "Transporte", "Saúde", "Educação", "Cartão", "Assinaturas", "Lazer", "Compras", "Outros"],
  income: ["Salário", "Renda extra", "Reembolso", "Investimentos", "Presentes", "Outros"]
};
const state = {
  mode: "checking",
  token: "",
  month: plusMonths(monthKey(new Date()), 1),
  view: "dashboard",
  records: [],
  trends: [],
  editing: null
};

function el(tag, className, value) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (value !== undefined) node.textContent = value;
  return node;
}

function showToast(message, isError = false) {
  const toast = byId("toast");
  toast.textContent = message;
  toast.classList.toggle("error", isError);
  toast.hidden = false;
  clearTimeout(showToast.timeoutId);
  showToast.timeoutId = setTimeout(() => { toast.hidden = true; }, 3800);
}

function parseMoney(value) {
  let number = String(value).replace(/R\$/g, "").replace(/\s/g, "");
  if (number.includes(",")) number = number.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(?:\.\d{3})+$/.test(number)) number = number.replace(/\./g, "");
  if (!/^\d+(?:\.\d{1,2})?$/.test(number)) throw new Error("Informe um valor válido, por exemplo 125,90.");
  const [units, fraction = ""] = number.split(".");
  const cents = Number(units) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents) || cents < 1 || cents > 100000000000) {
    throw new Error("O valor precisa ser maior que zero e dentro do limite permitido.");
  }
  return cents;
}

function dateForMonth(key) { return key; }

function createDemoRecords() {
  const items = [];
  const nowKey = monthKey(new Date());
  const examples = [
    ["Salário demonstrativo", "income", "Salário", 290000, 5],
    ["Moradia fictícia", "expense", "Moradia", 85000, 8],
    ["Supermercado fictício", "expense", "Alimentação", 48250, 12],
    ["Transporte fictício", "expense", "Transporte", 18000, 16],
    ["Internet fictícia", "expense", "Assinaturas", 10990, 20]
  ];
  for (let delta = -6; delta <= 2; delta++) {
    const key = plusMonths(nowKey, delta);
    for (const [index, example] of examples.entries()) {
      const [description, type, category, base, day] = example;
      const amount = base + (delta + 6) * (type === "income" ? 1150 : (index + 1) * 95);
      const date = key;
      items.push({
        id: "demo-" + delta + "-" + index,
        description,
        type,
        category,
        amount_cents: amount,
        date,
        status: key < nowKey || (key === nowKey && day <= new Date().getDate()) ? "paid" : "pending",
        notes: "",
        installment_number: null,
        installment_total: null
      });
    }
  }
  return items;
}

function updateMode() {
  const notice = byId("mode-notice");
  if (state.mode === "demo") {
    notice.className = "notice warning";
    notice.textContent = "Modo demonstração — valores fictícios. Alterações são temporárias e não são salvas. Nenhum D1 está conectado.";
    byId("sidebar-mode").textContent = "Demonstração (sem D1)";
  } else if (state.mode === "live") {
    notice.className = "notice";
    notice.textContent = "Dados privados no novo D1 do Financeiro. A chave de acesso permanece apenas nesta aba.";
    byId("sidebar-mode").textContent = state.token ? "D1 conectado" : "Acesso protegido";
  }
}

function currentRows() {
  return state.records.filter((row) => row.date.slice(0, 7) === state.month);
}

function summarize(rows) {
  const totals = { income: 0, expense: 0, pending: 0, pendingCount: 0, receivable: 0, realizedIncome: 0, realizedExpense: 0 };
  for (const row of rows) {
    totals[row.type] += row.amount_cents;
    if (row.status === "pending") {
      totals.pendingCount++;
      if (row.type === "expense") totals.pending += row.amount_cents;
      else totals.receivable += row.amount_cents;
    } else {
      if (row.type === "income") totals.realizedIncome += row.amount_cents;
      else totals.realizedExpense += row.amount_cents;
    }
  }
  return totals;
}

function renderMetrics(rows) {
  const totals = summarize(rows);
  byId("metric-income").textContent = money(totals.income);
  byId("metric-expense").textContent = money(totals.expense);
  byId("metric-balance").textContent = money(totals.income - totals.expense);
  byId("metric-pending").textContent = money(totals.pending);
  byId("metric-realized").textContent = money(totals.realizedIncome - totals.realizedExpense);
  byId("metric-count").textContent = String(rows.length);
  byId("metric-pending-count").textContent = String(totals.pendingCount);
  byId("metric-receivable").textContent = money(totals.receivable);
}

function monthTotals() {
  if (state.mode === "live") return state.trends;
  const months = Array.from({ length: 6 }, (_, i) => plusMonths(state.month, i - 5));
  return months.map((month) => {
    const totals = summarize(state.records.filter((row) => row.date.slice(0, 7) === month));
    return { month, income_cents: totals.income, expense_cents: totals.expense };
  });
}

function renderChart() {
  const target = byId("trend-chart");
  target.replaceChildren();
  const data = monthTotals();
  const max = Math.max(1, ...data.flatMap((item) => [item.income_cents, item.expense_cents]));
  const accessible = [];
  for (const item of data) {
    const container = el("div", "chart-month" + (item.month === state.month ? " current" : ""));
    const bars = el("div", "chart-bars");
    for (const [type, value] of [["income", item.income_cents], ["expense", item.expense_cents]]) {
      const bar = el("div", "bar " + type);
      bar.style.height = Math.max(2, value / max * 100) + "%";
      bar.title = (type === "income" ? "Receitas: " : "Despesas: ") + money(value);
      bars.append(bar);
    }
    container.append(bars, el("span", "month-name", shortMonth(item.month)));
    target.append(container);
    accessible.push(monthText(item.month) + ": receitas " + money(item.income_cents) + ", despesas " + money(item.expense_cents));
  }
  target.setAttribute("aria-label", accessible.join("; "));
}

function actionButton(symbol, label, callback) {
  const button = el("button", "", symbol);
  button.type = "button";
  button.setAttribute("aria-label", label);
  button.title = label;
  button.addEventListener("click", callback);
  return button;
}

function renderRows(rows) {
  const query = byId("search-input").value.trim().toLocaleLowerCase("pt-BR");
  const type = byId("type-filter").value;
  const status = byId("status-filter").value;
  const filtered = rows.filter((row) =>
    (type === "all" || row.type === type) &&
    (status === "all" || row.status === status) &&
    (row.description + " " + row.category + " " + (row.notes || "")).toLocaleLowerCase("pt-BR").includes(query)
  ).sort((a, b) => b.date.localeCompare(a.date) || a.description.localeCompare(b.description, "pt-BR"));
  const body = byId("transactions-body");
  body.replaceChildren();
  for (const row of filtered) {
    const tr = el("tr");
    const name = el("td");
    name.append(el("span", "item-name", row.description));
    const date = el("td", "", formatDate(row.date));
    const category = el("td", "", row.category);
    const statusCell = el("td");
    statusCell.append(el("span", "badge " + row.status, row.status === "paid" ? (row.type === "income" ? "Recebido" : "Pago") : "Pendente"));
    const value = el("td", "amount-col");
    value.append(el("span", "value " + row.type, (row.type === "income" ? "+ " : "− ") + money(row.amount_cents)));
    const actions = el("td", "actions-col");
    const buttons = el("div", "row-actions");
    buttons.append(
      actionButton(row.status === "paid" ? "↶" : "✓", row.status === "paid" ? "Marcar pendente" : "Marcar pago/recebido", () => changeStatus(row)),
      actionButton("✎", "Editar " + row.description, () => openTransaction(row)),
      actionButton("×", "Excluir " + row.description, () => deleteTransaction(row))
    );
    actions.append(buttons);
    tr.append(name, date, category, statusCell, value, actions);
    body.append(tr);
  }
  byId("empty-state").hidden = filtered.length > 0;
  byId("result-count").textContent = filtered.length + (filtered.length === 1 ? " lançamento" : " lançamentos");
}

function render() {
  byId("month-picker").value = state.month;
  byId("month-label").textContent = monthText(state.month);
  byId("page-title").textContent = state.view === "dashboard" ? "Visão geral" : "Lançamentos";
  byId("transactions-title").textContent = state.view === "dashboard" ? "Lançamentos do mês" : "Todos os lançamentos";
  document.querySelector(".dashboard-only").hidden = state.view !== "dashboard";
  for (const button of document.querySelectorAll("[data-view-button]")) {
    const active = button.dataset.viewButton === state.view;
    button.classList.toggle("active", active);
    if (active) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  }
  updateMode();
  const rows = currentRows();
  renderMetrics(rows);
  renderChart();
  renderRows(rows);
}

async function request(path, options = {}) {
  const response = await fetch("/api/" + path, {
    ...options,
    cache: "no-store",
    headers: {
      "Accept": "application/json",
      "Authorization": "Bearer " + state.token,
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {})
    }
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401) {
      state.token = "";
      updateMode();
      if (!byId("auth-dialog").open) byId("auth-dialog").showModal();
    }
    throw new Error(result.error || "Não foi possível comunicar com o servidor.");
  }
  return result;
}

async function reload() {
  if (state.mode === "live") {
    if (!state.token) return;
    const requestedMonth = state.month;
    const [list, trends] = await Promise.all([
      request("transactions?month=" + encodeURIComponent(requestedMonth)),
      request("trends?month=" + encodeURIComponent(requestedMonth))
    ]);
    if (requestedMonth !== state.month) return;
    state.records = list.transactions;
    state.trends = trends.months;
  }
  render();
}

async function perform(operation) {
  try {
    await operation();
    await reload();
  } catch (error) {
    showToast(error.message, true);
  }
}

function setMonth(month) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return;
  state.month = month;
  reload().catch((error) => showToast(error.message, true));
}

function updateCategories(type, selected = "") {
  const select = byId("field-category");
  select.replaceChildren();
  const choices = categories[type] || categories.expense;
  for (const option of selected && !choices.includes(selected) ? [...choices, selected] : choices) {
    const node = el("option", "", option);
    node.value = option;
    select.append(node);
  }
  select.value = selected || choices[0];
}

function openTransaction(row = null) {
  state.editing = row ? row.id : null;
  byId("dialog-title").textContent = row ? "Editar lançamento" : "Novo lançamento";
  byId("save-button").textContent = row ? "Salvar alterações" : "Salvar lançamento";
  byId("transaction-form").reset();
  byId("field-type").value = row ? row.type : "expense";
  updateCategories(byId("field-type").value, row?.category);
  byId("field-status").value = row ? row.status : "pending";
  byId("field-description").value = row ? row.description : "";
  byId("field-amount").value = row ? (row.amount_cents / 100).toFixed(2).replace(".", ",") : "";
  byId("field-date").value = row ? row.date : dateForMonth(state.month);
  byId("transaction-dialog").showModal();
  byId("field-description").focus();
}

async function saveTransaction(event) {
  event.preventDefault();
  const button = byId("save-button");
  try {
    const data = {
      type: byId("field-type").value,
      status: byId("field-status").value,
      description: byId("field-description").value.trim(),
      amount_cents: parseMoney(byId("field-amount").value),
      date: byId("field-date").value,
      category: byId("field-category").value
    };
    if (!data.description || data.description.length > 100) throw new Error("Informe uma descrição válida.");
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(data.date)) throw new Error("Informe apenas mês e ano.");
    button.disabled = true;
    if (state.mode === "demo") {
      if (state.editing) {
        const row = state.records.find((item) => item.id === state.editing);
        if (!row) throw new Error("Lançamento não encontrado.");
        Object.assign(row, data);
      } else state.records.push({ ...data, id: crypto.randomUUID() });
    } else {
      await request(state.editing ? "transactions/" + encodeURIComponent(state.editing) : "transactions", {
        method: state.editing ? "PUT" : "POST",
        body: JSON.stringify(data)
      });
    }
    state.month = data.date;
    byId("transaction-dialog").close();
    await reload();
    showToast("Lançamento salvo com sucesso.");
  } catch (error) {
    showToast(error.message, true);
  } finally { button.disabled = false; }
}

async function changeStatus(row) {
  await perform(async () => {
    const nextStatus = row.status === "pending" ? "paid" : "pending";
    if (state.mode === "demo") row.status = nextStatus;
    else await request("transactions/" + encodeURIComponent(row.id), {
      method: "PUT",
      body: JSON.stringify({ ...row, status: nextStatus })
    });
    showToast(nextStatus === "paid" ? "Lançamento confirmado." : "Lançamento marcado como pendente.");
  });
}

async function deleteTransaction(row) {
  if (!window.confirm('Excluir "' + row.description + '"? Esta ação não pode ser desfeita.')) return;
  await perform(async () => {
    if (state.mode === "demo") state.records = state.records.filter((item) => item.id !== row.id);
    else await request("transactions/" + encodeURIComponent(row.id), { method: "DELETE" });
    showToast("Lançamento excluído.");
  });
}

function bindEvents() {
  document.querySelectorAll("[data-view-button]").forEach((button) => button.addEventListener("click", () => {
    state.view = button.dataset.viewButton;
    render();
  }));
  document.querySelectorAll("[data-add]").forEach((button) => button.addEventListener("click", () => openTransaction()));
  document.querySelectorAll("[data-close]").forEach((button) => button.addEventListener("click", () => byId(button.dataset.close).close()));
  byId("prev-month").addEventListener("click", () => setMonth(plusMonths(state.month, -1)));
  byId("next-month").addEventListener("click", () => setMonth(plusMonths(state.month, 1)));
  byId("today-month").addEventListener("click", () => setMonth(monthKey(new Date())));
  byId("month-picker").addEventListener("change", (event) => setMonth(event.target.value));
  byId("search-input").addEventListener("input", () => renderRows(currentRows()));
  byId("type-filter").addEventListener("change", () => renderRows(currentRows()));
  byId("status-filter").addEventListener("change", () => renderRows(currentRows()));
  byId("field-type").addEventListener("change", (event) => updateCategories(event.target.value));
  byId("transaction-form").addEventListener("submit", saveTransaction);
  byId("auth-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const token = byId("auth-token").value.trim();
    state.token = token;
    byId("auth-error").textContent = "";
    try {
      await reload();
      byId("auth-token").value = "";
      byId("auth-dialog").close();
      updateMode();
      showToast("Acesso autorizado.");
    } catch (error) {
      state.token = "";
      byId("auth-error").textContent = error.message;
    }
  });
}

async function start() {
  bindEvents();
  try {
    const response = await fetch("/api/health", { cache: "no-store" });
    if (!response.ok) throw new Error("Worker indisponível");
    const health = await response.json();
    state.mode = health.configured ? "live" : "demo";
  } catch {
    state.mode = "demo";
  }
  if (state.mode === "demo") state.records = createDemoRecords();
  render();
  if (state.mode === "live") byId("auth-dialog").showModal();
}
start();