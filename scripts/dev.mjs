import { spawn } from "node:child_process";

const children = [];
let shuttingDown = false;

function run(name, command, args, env = {}) {
  const child = spawn(command, args, {
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, ...env },
  });
  const prefix = `[${name}] `;
  child.stdout.on("data", (chunk) => {
    process.stdout.write(
      chunk
        .toString()
        .split(/\r?\n/)
        .filter(Boolean)
        .map((line) => prefix + line)
        .join("\n") + "\n",
    );
  });
  child.stderr.on("data", (chunk) => {
    process.stderr.write(
      chunk
        .toString()
        .split(/\r?\n/)
        .filter(Boolean)
        .map((line) => prefix + line)
        .join("\n") + "\n",
    );
  });
  child.on("exit", (code) => {
    if (!shuttingDown) {
      console.log(`${prefix}process exited with code ${code}`);
      shutdown(code ?? 0);
    }
  });
  children.push(child);
  return child;
}

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    if (!child.killed) {
      child.kill("SIGTERM");
    }
  }
  setTimeout(() => process.exit(code), 300);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

run("api", process.execPath, ["--watch", "server/index.js"], {
  PORT: process.env.PORT || "3001",
  NODE_ENV: "development",
});
run("web", process.execPath, ["node_modules/vite/bin/vite.js"], {});
