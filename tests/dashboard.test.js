import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const html = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
const app = readFileSync(new URL("../public/js/app.js", import.meta.url), "utf8");
test("Visão geral possui somente três KPIs acima dos lançamentos", () => {
  assert.equal((html.match(/class="metric(?: metric-feature)?"/g) || []).length, 3);
  for (const name of ["income", "expense", "balance"]) assert.match(html, new RegExp('id="metric-'+name+'"'));
  assert.ok(html.indexOf('id="metric-balance"') < html.indexOf('class="panel transactions-panel"'));
  assert.doesNotMatch(html, /trend-chart|metric-pending|metric-realized|metric-receivable/);
});
test("Dados mensais não exigem consulta à API de tendências", () => {
  assert.doesNotMatch(app, /renderChart|request\("trends\?/);
  assert.match(app, /renderMetrics\(rows\)/);
  assert.match(app, /renderRows\(rows\)/);
});
