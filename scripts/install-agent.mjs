/**
 * Builds the native Windows agent, installs it under the user's local programs,
 * refreshes the Start Menu shortcut, and restarts it with its existing pairing.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync, spawn } from "node:child_process";

if (process.platform !== "win32") {
  console.error("The SupportIQ Agent is a Windows app; install it on Windows.");
  process.exit(1);
}

const root = process.cwd();
const builtExe = path.join(root, "agent", "build", "SupportIQ-Agent.exe");
const installDir = path.join(process.env.LOCALAPPDATA, "Programs", "SupportIQ");
const installedExe = path.join(installDir, "SupportIQ-Agent.exe");
const configDir = path.join(process.env.APPDATA, "SupportIQ");
const configPath = path.join(configDir, "agent.json");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

console.log("Building the agent…");
execFileSync(process.execPath, [path.join(root, "scripts", "build-agent.mjs")], { stdio: "inherit" });
if (!fs.existsSync(builtExe)) {
  console.error("Build finished without producing agent/build/SupportIQ-Agent.exe.");
  process.exit(1);
}

// A running exe can't be replaced on Windows.
try {
  execFileSync("taskkill", ["/F", "/IM", "SupportIQ-Agent.exe"], { stdio: "ignore" });
  console.log("Stopped the running agent.");
} catch {
  // Nothing was running.
}
await sleep(1500);

fs.mkdirSync(installDir, { recursive: true });
for (const leftover of [path.join(installDir, "update"), path.join(installDir, "supportiq-update.cmd")]) {
  try {
    fs.rmSync(leftover, { recursive: true, force: true });
  } catch {
    // The updater may still be releasing these files.
  }
}

let copied = false;
for (let attempt = 0; attempt < 8 && !copied; attempt += 1) {
  try {
    fs.copyFileSync(builtExe, installedExe);
    copied = true;
  } catch (error) {
    if (attempt === 7) {
      console.error(`Could not replace ${installedExe}: ${error.message}`);
      process.exit(1);
    }
    await sleep(750);
  }
}

// Refresh the Start Menu shortcut so it always points at the installed copy.
try {
  const shortcut = path.join(
    process.env.APPDATA,
    "Microsoft",
    "Windows",
    "Start Menu",
    "Programs",
    "SupportIQ Agent.lnk",
  );
  const quote = (value) => value.replace(/'/g, "''");
  const script =
    "$ws = New-Object -ComObject WScript.Shell; " +
    `$lnk = $ws.CreateShortcut('${quote(shortcut)}'); ` +
    `$lnk.TargetPath = '${quote(installedExe)}'; ` +
    "$lnk.Description = 'SupportIQ remote support agent'; $lnk.Save()";
  execFileSync("powershell", ["-NoProfile", "-Command", script], { stdio: "ignore" });
} catch {
  console.warn("Could not create the Start Menu shortcut; the agent was still installed.");
}

// First install enables start-with-Windows; later installs keep the user's choice.
fs.mkdirSync(configDir, { recursive: true });
if (!fs.existsSync(configPath)) {
  fs.writeFileSync(
    configPath,
    JSON.stringify({
      serverUrl: "",
      token: "",
      deviceId: 0,
      deviceName: "",
      autoStart: "true",
    }),
  );
}

const child = spawn(installedExe, [], { detached: true, stdio: "ignore" });
child.unref();

console.log(`\nInstalled: ${installedExe}`);
console.log(fs.existsSync(configPath) ? `Settings:  ${configPath}` : "");
console.log("The agent is running in the system tray.");
