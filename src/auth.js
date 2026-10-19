// PBKDF2 com 600 mil iterações via Node.js nativo (Workers: Web Crypto limita 100 mil).
import { pbkdf2 as nodePbkdf2 } from "node:crypto";
const textEncoder = new TextEncoder();
const ITERATIONS = 100000; // Limite por chamada PBKDF2 no Cloudflare Workers.
const MAX_SESSION_MS = 8 * 60 * 60 * 1000;

export function validUsername(value) {
  return typeof value === "string" && /^[a-zA-Z0-9._-]{3,50}$/.test(value);
}
export function validateNewUser(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("Cadastro inválido.");
  const nome = typeof data.nome === "string" ? data.nome.trim() : "";
  const usuario = typeof data.usuario === "string" ? data.usuario.trim().toLowerCase() : "";
  const senha = data.senha;
  if (!nome || nome.length > 100 || /[\u0000-\u001f]/.test(nome)) throw new Error("Nome inválido.");
  if (!validUsername(usuario)) throw new Error("Usuário inválido: use 3 a 50 letras, números, ponto, hífen ou sublinhado.");
  if (typeof senha !== "string" || senha.length < 12 || senha.length > 128) throw new Error("Senha deve ter de 12 a 128 caracteres.");
  return { nome, usuario, senha };
}
function toBase64Url(bytes) {
  let value = "";
  for (const byte of bytes) value += String.fromCharCode(byte);
  return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function fromBase64Url(value) {
  if (typeof value !== "string" || !/^[a-zA-Z0-9_-]+$/.test(value)) throw new Error("Código inválido.");
  const binary = atob(value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - value.length % 4) % 4));
  return Uint8Array.from(binary, ch => ch.charCodeAt(0));
}
async function pbkdf2(password, salt, rounds) {
  return new Promise((resolve, reject) => {
    nodePbkdf2(password, salt, rounds, 32, "sha256", (err, digest) => {
      if (err) reject(err);
      else resolve(new Uint8Array(digest));
    });
  });
}
export async function hashPassword(password, secret, username) {
  if (typeof password !== "string" || password.length < 12 || password.length > 128) throw new Error("Senha inválida.");
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(password, salt, ITERATIONS);
  const salt64=toBase64Url(salt), derived=toBase64Url(hash);
  return secret && username
    ? await storeProof(derived,salt64,ITERATIONS,secret,username)
    : "pbkdf2-sha256$" + ITERATIONS + "$" + salt64 + "$" + derived;
}
export async function verifyPassword(password, encoded) {
  if (typeof password !== "string" || password.length > 128 || typeof encoded !== "string") return false;
  const match = encoded.match(/^pbkdf2-sha256\$(\d{6,7})\$([a-zA-Z0-9_-]{22})\$([a-zA-Z0-9_-]{43})$/);
  if (!match) return false;
  const rounds = Number(match[1]);
  if (rounds < 100000 || rounds > 100000) return false;
  const check = await pbkdf2(password, fromBase64Url(match[2]), rounds);
  const expected = fromBase64Url(match[3]);
  let diff = 0;
  for (let i = 0; i < check.length; i++) diff |= check[i] ^ expected[i];
  return diff === 0;
}

const HASH_PATTERN = /^(pbkdf2-sha256|pbkdf2-hmac)\$(\d{6,7})\$([a-zA-Z0-9_-]{22})\$([a-zA-Z0-9_-]{43})$/;
export function passwordInfo(encoded) {
  if(typeof encoded !== "string") return null;
  const match=encoded.match(HASH_PATTERN);
  if(!match) return null;
  const rounds=Number(match[2]);
  if(!Number.isInteger(rounds)||rounds<100000||rounds>1000000) return null;
  return {scheme:match[1],rounds,salt:match[3],digest:match[4]};
}
function equalBase64(a,b) {
  let difference=0;
  const left=fromBase64Url(a),right=fromBase64Url(b);
  if(left.length!==32||right.length!==32)return false;
  for(let i=0;i<32;i++)difference|=left[i]^right[i];
  return difference===0;
}
async function macProof(proof,secret,username) {
  const key=await crypto.subtle.importKey("raw",textEncoder.encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  const data=textEncoder.encode("financeiro-senha-v1|"+username.toLowerCase()+"|"+proof);
  return toBase64Url(new Uint8Array(await crypto.subtle.sign("HMAC",key,data)));
}
export async function storeProof(proof,salt,rounds,secret,username) {
  if(typeof proof!=="string"||!/^[a-zA-Z0-9_-]{43}$/.test(proof))throw new Error("Prova de senha inválida.");
  if(typeof salt!=="string"||!/^[a-zA-Z0-9_-]{22}$/.test(salt))throw new Error("Sal inválido.");
  if(!Number.isInteger(rounds)||rounds<100000||rounds>1000000)throw new Error("Iterações inválidas.");
  const verifier=await macProof(proof,secret,username);
  return "pbkdf2-hmac$"+rounds+"$"+salt+"$"+verifier;
}
export async function checkProof(encoded,proof,secret,username) {
  const info=passwordInfo(encoded);
  if(!info||typeof proof!=="string"||!/^[a-zA-Z0-9_-]{43}$/.test(proof))return {valid:false,upgrade:null};
  const candidate=info.scheme==="pbkdf2-hmac" ? await macProof(proof,secret,username) : proof;
  const valid=equalBase64(candidate,info.digest);
  return {valid,upgrade:valid&&info.scheme==="pbkdf2-sha256"
    ? await storeProof(proof,info.salt,info.rounds,secret,username)
    : null};
}
export function makeSalt() {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(16)));
}

async function hmacKey(secret) {
  return crypto.subtle.importKey("raw", textEncoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}
export async function issueSession(userId, secret) {
  if (!Number.isSafeInteger(userId) || userId < 1) throw new Error("Identificador inválido.");
  const payload = toBase64Url(textEncoder.encode(JSON.stringify({
    sub: userId,
    exp: Date.now() + MAX_SESSION_MS,
    nonce: toBase64Url(crypto.getRandomValues(new Uint8Array(16)))
  })));
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", await hmacKey(secret), textEncoder.encode(payload)));
  return payload + "." + toBase64Url(signature);
}
export async function sessionUserId(token, secret) {
  if (typeof token !== "string" || token.length > 1024) return null;
  const parts = token.split(".");
  if (parts.length !== 2 || !/^[a-zA-Z0-9_-]{43}$/.test(parts[1])) return null;
  let decoded;
  try {
    if (!(await crypto.subtle.verify("HMAC", await hmacKey(secret), fromBase64Url(parts[1]), textEncoder.encode(parts[0])))) return null;
    decoded = JSON.parse(new TextDecoder().decode(fromBase64Url(parts[0])));
  } catch { return null; }
  if (!Number.isSafeInteger(decoded?.sub) || decoded.sub < 1) return null;
  if (!Number.isFinite(decoded.exp) || decoded.exp <= Date.now() || decoded.exp > Date.now() + MAX_SESSION_MS) return null;
  return decoded.sub;
}
export async function verifyAdminToken(request, secret) {
  const bearer = request.headers.get("authorization") || "";
  if (!bearer.startsWith("Bearer ")) return false;
  const provided = bearer.slice(7);
  if (provided.length < 32 || provided.length > 1024) return false;
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", textEncoder.encode(provided)),
    crypto.subtle.digest("SHA-256", textEncoder.encode(secret))
  ]);
  const x = new Uint8Array(a), y = new Uint8Array(b);
  let diff = 0;
  for (let i=0; i<x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}