const defaults = {
  expense: ["Moradia", "Alimentação", "Transporte", "Saúde", "Educação", "Cartão", "Assinaturas", "Lazer", "Compras", "Outros"],
  income: ["Salário", "Renda extra", "Reembolso", "Investimentos", "Presentes", "Outros"]
};
const fail = (status, message) => Object.assign(new Error(message), {status});
const dbType = type => type === "income" ? "entrada" : type === "expense" ? "saida" : null;
const appType = type => type === "entrada" ? "income" : "expense";
export function normalizeCategory(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw fail(400, "Categoria inválida.");
  const nome = typeof input.name === "string" ? input.name.trim() : "";
  const tipo = dbType(input.type);
  if (!nome || nome.length > 40 || /[\u0000-\u001f\u007f]/.test(nome)) throw fail(400, "Nome inválido (1 a 40 caracteres).");
  if (!tipo) throw fail(400, "Tipo inválido.");
  return {nome, tipo};
}
export function defaultCategories() {
  return Object.entries(defaults).flatMap(([type, names]) => names.map(name => ({name, type})));
}
export async function seedUserCategories(db, userId) {
  const statements = defaultCategories().map(item =>
    db.prepare("INSERT OR IGNORE INTO categorias (usuario_id,tipo,nome) VALUES (?,?,?)")
      .bind(userId, dbType(item.type), item.name));
  await db.batch(statements);
}
export async function listCategories(db, userId) {
  const result = await db.prepare("SELECT id,nome,tipo FROM categorias WHERE usuario_id=? ORDER BY tipo,nome COLLATE NOCASE").bind(userId).all();
  return result.results.map(item => ({id:item.id,name:item.nome,type:appType(item.tipo)}));
}
function uniqueError(err) {
  if (/UNIQUE constraint failed/i.test(String(err?.message))) throw fail(409, "Já existe uma categoria com esse nome e tipo.");
  throw err;
}
export async function createCategory(db, userId, input) {
  const {nome,tipo} = normalizeCategory(input);
  try {
    const result = await db.prepare("INSERT INTO categorias (usuario_id,nome,tipo) VALUES (?,?,?)")
      .bind(userId,nome,tipo).run();
    return {id:result.meta.last_row_id,name:nome,type:appType(tipo)};
  } catch(err) { uniqueError(err); }
}
async function ownedCategory(db, userId, categoryId) {
  const category = await db.prepare("SELECT id,nome,tipo FROM categorias WHERE id=? AND usuario_id=?")
    .bind(categoryId,userId).first();
  if (!category) throw fail(404, "Categoria não encontrada.");
  return category;
}
export async function updateCategory(db, userId, categoryId, input) {
  const previous = await ownedCategory(db,userId,categoryId);
  const {nome,tipo} = normalizeCategory(input);
  const used = await db.prepare("SELECT 1 AS used FROM registros WHERE usuario_id=? AND tipo=? AND categoria=? COLLATE NOCASE LIMIT 1")
    .bind(userId,previous.tipo,previous.nome).first();
  if (used && tipo !== previous.tipo) throw fail(409, "Esta categoria está em uso. Para mudar o tipo, crie outra categoria.");
  try {
    await db.batch([
      db.prepare("UPDATE categorias SET nome=?,tipo=? WHERE id=? AND usuario_id=?")
        .bind(nome,tipo,categoryId,userId),
      db.prepare("UPDATE registros SET categoria=? WHERE usuario_id=? AND tipo=? AND categoria=? COLLATE NOCASE")
        .bind(nome,userId,previous.tipo,previous.nome)
    ]);
    return {id:categoryId,name:nome,type:appType(tipo)};
  } catch(err) { uniqueError(err); }
}
export async function deleteCategory(db,userId,categoryId) {
  const result = await db.prepare(
    "DELETE FROM categorias WHERE id=? AND usuario_id=? AND NOT EXISTS (SELECT 1 FROM registros WHERE usuario_id=? AND tipo=categorias.tipo AND categoria=categorias.nome COLLATE NOCASE)"
  ).bind(categoryId,userId,userId).run();
  if (result.meta?.changes) return;
  await ownedCategory(db,userId,categoryId);
  throw fail(409, "Esta categoria está em uso em lançamentos. Edite os lançamentos antes de excluí-la.");
}
export async function assertTransactionCategory(db,userId,record) {
  const row = await db.prepare("SELECT nome FROM categorias WHERE usuario_id=? AND tipo=? AND nome=? COLLATE NOCASE")
    .bind(userId,record.tipo,record.categoria).first();
  if (!row) throw fail(400, "Categoria não encontrada para esse tipo. Cadastre-a na aba Categorias.");
  record.categoria = row.nome;
}
