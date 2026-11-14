import { spawn } from "node:child_process";
import os from "node:os";

const API_PORT = process.env.PORT || "3001";
const VITE_PORT = process.env.VITE_PORT || "5173";

const children = [];
let shuttingDown = false;

function run(name, args, env = {}) {
  const child = spawn(process.execPath, args, {
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
      shutdown(code ?? 1);
    }
  });
  children.push(child);
  return child;
}

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    if (!child.killed) child.kill("SIGTERM");
  }
  setTimeout(() => process.exit(code), 300);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

async function apiResponding() {
  try {
    const response = await fetch(`http://localhost:${API_PORT}/api/health`, {
      signal: AbortSignal.timeout(1500),
    });
    return response.ok;
  } catch {
    return false;
  }
}

function lanAddresses() {
  const addresses = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const item of list ?? []) {
      if (item.family === "IPv4" && !item.internal) addresses.push(item.address);
    }
  }
  return addresses;
}

let apiOwned = false;

function startApi() {
  if (apiOwned) return;
  apiOwned = true;
  console.log(`[api] starting on port ${API_PORT}`);
  run("api", ["--watch", "server/index.js"], { PORT: API_PORT, NODE_ENV: "development" });
}

if (!(await apiResponding())) {
  startApi();
} else {
  console.log(`[api] reusing the server already running on port ${API_PORT}`);
  // An API this script did not start can go away later (its terminal closes,
  // it crashes). The frontend would then be left with nothing to talk to, and
  // signing in fails with no useful error, so take the port back.
  setInterval(async () => {
    if (apiOwned || (await apiResponding())) return;
    console.log(`[api] nothing is answering on port ${API_PORT} any more, starting one`);
    startApi();
  }, 5000);
}

run("web", ["node_modules/vite/bin/vite.js", "--port", VITE_PORT, "--strictPort"], {
  VITE_DEV_HTTPS: "1",
});

console.log("");
console.log("SupportIQ HTTPS dev server (camera and microphone allowed)");
console.log(`  local: https://localhost:${VITE_PORT}`);
for (const address of lanAddresses()) {
  console.log(`  LAN:   https://${address}:${VITE_PORT}`);
}
console.log("  If the browser warns about the certificate, trust .certs/dev.cer once.");
console.log("  If another device can't connect, run scripts/open-firewall.ps1 as administrator.");
console.log("");
