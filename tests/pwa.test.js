import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync, existsSync} from "node:fs";
import {inflateSync} from "node:zlib";
import {runInNewContext} from "node:vm";
import {iconPng} from "../src/pwa-icons.js";

const text = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("manifesto é instalável e ícones têm tamanhos previstos", () => {
  const manifest = JSON.parse(text("public/app.webmanifest"));
  assert.equal(manifest.start_url, "/");
  assert.equal(manifest.scope, "/");
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.id, "/");
  assert.deepEqual(manifest.icons.map(icon => icon.sizes), ["192x192", "512x512"]);
  assert.ok(manifest.icons.every(icon => icon.type === "image/png"));
  assert.ok(text("public/index.html").includes('rel="manifest" href="/app.webmanifest"'));
});

test("ícones nativos produzem PNG real com cores do Financeiro", async () => {
  for (const size of [192, 512]) {
    const png = await iconPng(size);
    assert.deepEqual(Array.from(png.subarray(0, 8)), [137,80,78,71,13,10,26,10]);
    const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
    assert.equal(view.getUint32(16), size);
    assert.equal(view.getUint32(20), size);
    assert.equal(view.getUint32(8), 13); // IHDR
    assert.equal(view.getUint32(33), png.length - 57); // IDAT (após IHDR)
    const uncompressed = inflateSync(png.subarray(41, png.length - 16));
    const at = (x, y) => Array.from(uncompressed.subarray(y * (size * 3 + 1) + 1 + x * 3, y * (size * 3 + 1) + 4 + x * 3));
    assert.deepEqual(at(0,0), [11,18,32]);
    assert.deepEqual(at(Math.round(size * 0.20), Math.round(size * 0.20)), [20,156,128]);
    assert.deepEqual(at(Math.round(size * 0.40), Math.round(size * 0.30)), [248,255,252]);
  }
});

test("service worker não intercepta API, requisições com escrita ou outra origem", () => {
  const handlers = {};
  runInNewContext(text("public/sw.js"), {
    URL, self:{location:{origin:"https://financeiro.example"},addEventListener:(type,fn)=>handlers[type]=fn}
  });
  for (const [path,method] of [["/api/transactions","GET"],["/api/login","POST"],["/styles.css","POST"],["https://outro.example/style.css","GET"]]) {
    let intercepted = false;
    handlers.fetch({request:{url:new URL(path,"https://financeiro.example").href,method,mode:"cors"},respondWith:()=>intercepted=true});
    assert.equal(intercepted,false,path);
  }
});

test("worker e Cloudflare servem os ícones sem acessar o D1", () => {
  assert.ok(text("wrangler.jsonc").includes('"/icons/*"'));
  assert.ok(text("src/worker.js").includes("iconPng(size)"));
  assert.ok(text("public/sw.js").includes('"/offline.html"'));
  assert.ok(existsSync(new URL("../public/offline.html", import.meta.url)));
});
