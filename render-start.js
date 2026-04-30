import { spawn } from "child_process";

function run(name, command, args = []) {
  const child = spawn(command, args, {
    stdio: "inherit",
    shell: true,
    env: process.env
  });

  child.on("exit", (code) => {
    console.log(`[${name}] exited with code ${code}`);
    process.exit(code ?? 1);
  });

  return child;
}

console.log("[Render] Starting SkyEcho Piper TTS server...");
run("piper", "npm", ["run", "piper"]);

setTimeout(() => {
  console.log("[Render] Starting SkyEcho Discord bot/backend...");
  run("bot", "npm", ["start"]);
}, 3000);
