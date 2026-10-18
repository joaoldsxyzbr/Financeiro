// Autenticação sem dependências, usando primitivas Web Crypto nativas do Worker.
const textEncoder = new TextEncoder();
const ITERATIONS = 600000;
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
  const source = await crypto.subtle.importKey("raw", textEncoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: rounds, hash: "SHA-256" }, source, 256
  ));
}
export async function hashPassword(password) {
  if (typeof password !== "string" || password.length < 12 || password.length > 128) throw new Error("Senha inválida.");
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(password, salt, ITERATIONS);
  return "pbkdf2-sha256$" + ITERATIONS + "$" + toBase64Url(salt) + "$" + toBase64Url(hash);
}
export async function verifyPassword(password, encoded) {
  if (typeof password !== "string" || password.length > 128 || typeof encoded !== "string") return false;
  const match = encoded.match(/^pbkdf2-sha256\$(\d{6,7})\$([a-zA-Z0-9_-]{22})\$([a-zA-Z0-9_-]{43})$/);
  if (!match) return false;
  const rounds = Number(match[1]);
  if (rounds < 210000 || rounds > 1000000) return false;
  const check = await pbkdf2(password, fromBase64Url(match[2]), rounds);
  const expected = fromBase64Url(match[3]);
  let diff = 0;
  for (let i = 0; i < check.length; i++) diff |= check[i] ^ expected[i];
  return diff === 0;
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
