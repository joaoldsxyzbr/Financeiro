import {randomBytes,pbkdf2Sync} from "node:crypto";
import {spawnSync} from "node:child_process";
import {mkdtempSync,writeFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";

// Administrador: execute "node scripts/create-user.js" após autenticar o Wrangler.
if (!process.stdin.isTTY || !process.stdin.setRawMode) {console.error("Abra um terminal interativo.");process.exit(1);}
const input=process.stdin;
function ask(label,hidden=false) {
  return new Promise((resolve,reject)=>{
    let value="";
    process.stdout.write(label);
    function done() {input.off("data",onData);input.setRawMode(false);process.stdout.write("\n");}
    function onData(buffer) {
      const s=buffer.toString("utf8");
      if(s==="\u0003"){done();reject(new Error("Cancelado."));return;}
      if(s==="\r"||s==="\n"){done();resolve(value);return;}
      if(s==="\u007f"||s==="\b"){if(value.length){value=value.slice(0,-1);if(!hidden)process.stdout.write("\b \b");}return;}
      if(s.includes("\u001b"))return;
      value+=s;if(!hidden)process.stdout.write(s);
    }
    input.setRawMode(true);input.resume();input.on("data",onData);
  });
}
let folder;
try {
  console.log("Financeiro — cadastrar usuário no D1 remoto\n");
  const nome=(await ask("Nome: ")).trim();
  const usuario=(await ask("Usuário: ")).trim().toLowerCase();
  const senha=await ask("Senha (12-128 caracteres, oculta): ",true);
  const repetir=await ask("Confirme a senha (oculta): ",true);
  if(!nome||nome.length>100||/[\u0000-\u001f]/.test(nome))throw new Error("Nome inválido.");
  if(!/^[a-z0-9._-]{3,50}$/.test(usuario))throw new Error("Usuário inválido.");
  if(senha.length<12||senha.length>128||senha!==repetir)throw new Error("Senha inválida ou diferente da confirmação.");
  const salt=randomBytes(16);
  const hash=pbkdf2Sync(senha,salt,600000,32,"sha256");
  const encoded=["pbkdf2-sha256","600000",salt.toString("base64url"),hash.toString("base64url")].join("$");
  const quote=s=>s.replaceAll("'","''");
  folder=mkdtempSync(join(tmpdir(),"financeiro-conta-"));
  const file=join(folder,"cadastro.sql");
  writeFileSync(file,"INSERT INTO usuarios(nome,usuario,senha_hash) VALUES ('"+quote(nome)+"','"+quote(usuario)+"','"+encoded+"');\n",{mode:0o600});
  const command=process.platform==="win32"?"npx.cmd":"npx";
  const result=spawnSync(command,["wrangler","d1","execute","financeiro","--remote","--file",file],{stdio:"inherit",shell:false});
  if(result.error)throw result.error;
  if(result.status!==0)throw new Error("Falha ao cadastrar. Confira o Wrangler.");
  console.log("Conta criada.");
}catch(e){console.error("Erro:",e.message);process.exitCode=1;}
finally{if(folder)rmSync(folder,{force:true,recursive:true});input.setRawMode(false);}
