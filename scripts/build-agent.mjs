/**
 * Compiles the native Windows agent with the .NET Framework compiler that ships
 * with Windows. Output: agent/build/SupportIQ-Agent.exe
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const root = process.cwd();
const srcDir = path.join(root, "agent", "src");
const outDir = path.join(root, "agent", "build");
const outFile = path.join(outDir, "SupportIQ-Agent.exe");

if (process.platform !== "win32") {
  console.error("The SupportIQ Agent is a Windows app; build it on Windows.");
  process.exit(1);
}

const windir = process.env.WINDIR || "C:\\Windows";
const candidates = [
  process.env.SUPPORTIQ_CSC,
  path.join(windir, "Microsoft.NET", "Framework64", "v4.0.30319", "csc.exe"),
  path.join(windir, "Microsoft.NET", "Framework", "v4.0.30319", "csc.exe"),
].filter(Boolean);

const csc = candidates.find((candidate) => fs.existsSync(candidate));
if (!csc) {
  console.error(
    "Could not find csc.exe. Install the .NET Framework 4.x developer tools, or set SUPPORTIQ_CSC.",
  );
  process.exit(1);
}

const sources = fs
  .readdirSync(srcDir)
  .filter((name) => name.endsWith(".cs"))
  .map((name) => path.join(srcDir, name));
if (sources.length === 0) {
  console.error("No agent sources found in agent/src.");
  process.exit(1);
}

fs.mkdirSync(outDir, { recursive: true });

const args = [
  "/nologo",
  "/target:winexe",
  "/platform:anycpu",
  "/optimize+",
  "/warn:4",
  `/win32manifest:${path.join(srcDir, "app.manifest")}`,
  "/r:System.dll",
  "/r:System.Core.dll",
  "/r:System.Drawing.dll",
  "/r:System.Windows.Forms.dll",
  "/r:System.Web.Extensions.dll",
  `/out:${outFile}`,
  ...sources,
];

execFileSync(csc, args, { stdio: "inherit", cwd: root });

const size = fs.statSync(outFile).size;
console.log(`Built ${path.relative(root, outFile)} (${Math.round(size / 1024)} KB)`);
