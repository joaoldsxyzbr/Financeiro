// Cadastro administrativo local no D1 remoto. Executar manualmente:
// node scripts/create-user.js
// Requer conta Cloudflare autenticada no Wrangler e o binding do D1 configurado.
import { randomBytes, pbkdf2Sync } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import readline from "node:readline";

if (!process.stdin.isTTY) {
  console.error("Execute este comando num terminal interativo.");
  process.exit(1);
}

const questions = readline.createInterface({ input: process.stdin, output: process.stdout });
const question = (prompt) => new Promise(resolve => questions.question(prompt, resolve));

function askHidden(prompt) {
  questions.pause();
  return new Promise((resolve, reject) => {
    process.stdout.write(prompt);
    let answer = "";
    const stdin = process.stdin;
    stdin.setRawMode(true);
    stdin.resume();
    const clean = () => { stdin.off("data", onData); stdin.setRawMode(false); questions.resume(); };
    function onData(buffer) {
      const text = buffer.toString("utf8");
      if (text === "\r" || text === "\n") {
        process.stdout.write("\n"); clean(); resolve(answer);
      } else if (text === "\u0003") {
        process.stdout.write("\n"); clean(); reject(new Error("Operação cancelada."));
      } else if (text === "\u007f" || text === "\b") {
        answer = answer.slice(0, -1);
      } else if (!text.includes("\u001b")) {
        answer += text;
      }
    }
    stdin.on("data", onData);
  });
}

const escapeSql = (value) => value.replaceAll("'", "''");
let dir;
try {
  console.log("Financeiro — cadastro de usuário no D1 remoto\n");
  const nome = (await question("Nome: ")).trim();
  const usuario = (await question("Usuário (3 a 50 letras/números/._-): ")).trim().toLowerCase();
  questions.pause();
  const senha = await askHidden("Senha (12 a 128 caracteres, não aparece na tela): ");
  const confirmacao = await askHidden("Confirme a senha: ");
  questions.close();

  if (!nome || nome.length > 100 || /[\u0000-\u001f]/.test(nome)) throw new Error("Nome inválido.");
  if (!/^[a-z0-9._-]{3,50}$/.test(usuario)) throw new Error("Nome de usuário inválido.");
  if (senha.length < 12 || senha.length > 128 || senha !== confirmacao) throw new Error("Senha inválida ou confirmação diferente.");

  const salt = randomBytes(16);
  const hash = pbkdf2Sync(senha, salt, 600000, 32, "sha256");
  const encoded = ["pbkdf2-sha256", "600000", salt.toString("base64url"), hash.toString("base64url")].join("$");
  dir = mkdtempSync(join(tmpdir(), "financeiro-cadastro-"));
  const file = join(dir, "cadastrar.sql");
  writeFileSync(file, "INSERT INTO usuarios (nome,usuario,senha_hash) VALUES ('" + escapeSql(nome) + "','" + escapeSql(usuario) + "','" + encoded + "');\n", { mode: 0o600 });
  const command = process.platform === "win32" ? "npx.cmd" : "npx";
  console.log("\nGravando no D1 exclusivo 'financeiro'…");
  const result = spawnSync(command, ["wrangler", "d1", "execute", "financeiro", "--remote", "--file", file], { stdio: "inherit", shell: false });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error("O cadastro não foi concluído. Verifique o Wrangler.");
  console.log("\nUsuário cadastrado. Entre no site com o usuário e a senha escolhidos.");
} catch (error) {
  questions.close();
  console.error("Erro:", error.message);
  process.exitCode = 1;
} finally {
  if (dir) rmSync(dir, { recursive: true, force: true });
}
