import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeCategory,listCategories,createCategory,updateCategory,deleteCategory,
  assertTransactionCategory,defaultCategories
} from "../src/categories.js";
import { readFileSync } from "node:fs";

function testDb() {
  let sequence=4;
  const cats=[
    {id:1,usuario_id:1,nome:"Salário",tipo:"entrada"},
    {id:2,usuario_id:1,nome:"Cartão",tipo:"saida"},
    {id:3,usuario_id:2,nome:"Cartão",tipo:"saida"}
  ];
  const records=[
    {usuario_id:1,tipo:"saida",categoria:"Cartão"}
  ];
  const db={
    prepare(sql) {
      const query={
        args:[],
        bind(...args){this.args=args;return this;},
        async first(){
          const a=this.args;
          if(sql.startsWith("SELECT id,nome,tipo FROM categorias WHERE id="))
            return cats.find(c=>c.id===a[0]&&c.usuario_id===a[1])||null;
          if(sql.startsWith("SELECT 1 AS used FROM registros"))
            return records.some(r=>r.usuario_id===a[0]&&r.tipo===a[1]&&r.categoria.toLowerCase()===a[2].toLowerCase())?{used:1}:null;
          if(sql.startsWith("SELECT nome FROM categorias"))
            return cats.find(c=>c.usuario_id===a[0]&&c.tipo===a[1]&&c.nome.toLowerCase()===a[2].toLowerCase())||null;
          return null;
        },
        async all(){
          return {results:cats.filter(c=>c.usuario_id===this.args[0])};
        },
        async run(){
          const a=this.args;
          if(sql.startsWith("INSERT INTO categorias")){
            if(cats.some(c=>c.usuario_id===a[0]&&c.tipo===a[2]&&c.nome.toLowerCase()===a[1].toLowerCase()))
              throw new Error("UNIQUE constraint failed: categorias.usuario_id, categorias.tipo, categorias.nome");
            const id=sequence++;
            cats.push({id,usuario_id:a[0],nome:a[1],tipo:a[2]});
            return {meta:{last_row_id:id,changes:1}};
          }
          if(sql.startsWith("UPDATE categorias")){
            const row=cats.find(c=>c.id===a[2]&&c.usuario_id===a[3]);
            if(!row)return {meta:{changes:0}};
            if(cats.some(c=>c!==row&&c.usuario_id===a[3]&&c.tipo===a[1]&&c.nome.toLowerCase()===a[0].toLowerCase()))
              throw new Error("UNIQUE constraint failed");
            row.nome=a[0];row.tipo=a[1];return {meta:{changes:1}};
          }
          if(sql.startsWith("UPDATE registros SET categoria")){
            let count=0;
            for(const row of records) if(row.usuario_id===a[1]&&row.tipo===a[2]&&row.categoria.toLowerCase()===a[3].toLowerCase()){
              row.categoria=a[0];count++;
            }
            return {meta:{changes:count}};
          }
          if(sql.startsWith("DELETE FROM categorias")){
            const row=cats.find(c=>c.id===a[0]&&c.usuario_id===a[1]);
            if(!row)return {meta:{changes:0}};
            if(records.some(r=>r.usuario_id===a[2]&&r.tipo===row.tipo&&r.categoria.toLowerCase()===row.nome.toLowerCase()))
              return {meta:{changes:0}};
            cats.splice(cats.indexOf(row),1);return {meta:{changes:1}};
          }
          return {meta:{changes:0}};
        }
      };
      return query;
    },
    async batch(statements){return Promise.all(statements.map(stmt=>stmt.run()));}
  };
  return {db,cats,records};
}

test("tipos e nomes de categoria são validados",()=>{
  assert.deepEqual(normalizeCategory({name:"  Mercado  ",type:"expense"}),{nome:"Mercado",tipo:"saida"});
  assert.throws(()=>normalizeCategory({name:"   ",type:"expense"}),/Nome inválido/);
  assert.throws(()=>normalizeCategory({name:"Casa",type:"outro"}),/Tipo inválido/);
  assert.throws(()=>normalizeCategory({name:"X".repeat(41),type:"income"}),/Nome inválido/);
  assert.ok(defaultCategories().some(category=>category.name==="Salário"&&category.type==="income"));
});
test("categorias são sempre isoladas por usuário",async()=>{
  const {db}=testDb();
  assert.deepEqual((await listCategories(db,1)).map(c=>c.id),[1,2]);
  assert.deepEqual((await listCategories(db,2)).map(c=>c.id),[3]);
  await assert.rejects(()=>updateCategory(db,1,3,{name:"Alterado",type:"expense"}),/não encontrada/);
  await assert.rejects(()=>deleteCategory(db,1,3),/não encontrada/);
  await assert.rejects(()=>assertTransactionCategory(db,2,{tipo:"entrada",categoria:"Salário"}),/não encontrada/);
});
test("criar, renomear e excluir com proteção de lançamentos",async()=>{
  const {db,records}=testDb();
  const added=await createCategory(db,1,{name:"Casa",type:"expense"});
  assert.equal(added.name,"Casa");
  await assert.rejects(()=>createCategory(db,1,{name:"casa",type:"expense"}),/Já existe/);
  const changed=await updateCategory(db,1,2,{name:"Cartões",type:"expense"});
  assert.equal(changed.name,"Cartões");
  assert.equal(records[0].categoria,"Cartões");
  await assert.rejects(()=>updateCategory(db,1,2,{name:"Cartões",type:"income"}),/em uso/);
  await assert.rejects(()=>deleteCategory(db,1,2),/em uso/);
  const income=await createCategory(db,1,{name:"Cartões",type:"income"});
  assert.equal(income.type,"income");
  await deleteCategory(db,1,added.id);
  assert.ok(!(await listCategories(db,1)).some(c=>c.id===added.id));
});
test("lançamentos exigem categoria do usuário e do tipo certo",async()=>{
  const {db}=testDb();
  const own={categoria:"cartão",tipo:"saida"};
  await assertTransactionCategory(db,1,own);
  assert.equal(own.categoria,"Cartão");
  await assert.rejects(()=>assertTransactionCategory(db,1,{categoria:"Cartão",tipo:"entrada"}),/não encontrada/);
  await assert.rejects(()=>assertTransactionCategory(db,2,{categoria:"Salário",tipo:"entrada"}),/não encontrada/);
});
test("UI possui aba Categorias e modal de gerenciamento",()=>{
  const html=readFileSync(new URL("../public/index.html",import.meta.url),"utf8");
  const app=readFileSync(new URL("../public/js/app.js",import.meta.url),"utf8");
  assert.match(html,/data-view-button="categories"/);
  assert.doesNotMatch(html,/data-view-button="transactions"/);
  for(const id of ["categories-panel","categories-body","category-dialog","category-form","category-name","category-type"])
    assert.ok(html.includes('id="'+id+'"'));
  assert.match(app,/async function refreshCategories/);
  assert.match(app,/async function saveCategory/);
  assert.match(app,/async function removeCategory/);
});
