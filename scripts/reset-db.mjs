import fs from "node:fs";
import path from "node:path";

const dataDir = path.resolve(process.cwd(), "data");
if (fs.existsSync(dataDir)) {
  fs.rmSync(dataDir, { recursive: true, force: true });
  console.log("Removed local SupportIQ data. It will be recreated and seeded on next start.");
} else {
  console.log("No local SupportIQ data found.");
}
