import fs from "node:fs";
import path from "node:path";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

const useHttps = process.env.VITE_DEV_HTTPS === "1";

/** Serves the dev certificate at /dev-cert.cer so phones can install it easily. */
function devCertDownload(): Plugin {
  return {
    name: "supportiq-dev-cert-download",
    configureServer(server) {
      server.middlewares.use("/dev-cert.cer", (_req, res) => {
        const cerPath = path.resolve(process.cwd(), ".certs", "dev.cer");
        if (!fs.existsSync(cerPath)) {
          res.statusCode = 404;
          res.end("Certificate not found.");
          return;
        }
        res.setHeader("Content-Type", "application/x-x509-ca-cert");
        res.setHeader("Content-Disposition", 'attachment; filename="supportiq-dev.cer"');
        res.end(fs.readFileSync(cerPath));
      });
    },
  };
}

function httpsOptions() {
  if (!useHttps) return undefined;
  const pfxPath = path.resolve(process.cwd(), ".certs", "dev.pfx");
  if (!fs.existsSync(pfxPath)) {
    throw new Error(
      "Missing .certs/dev.pfx. Run: powershell -ExecutionPolicy Bypass -File scripts/make-dev-cert.ps1",
    );
  }
  return {
    pfx: fs.readFileSync(pfxPath),
    passphrase: process.env.VITE_DEV_HTTPS_PASSPHRASE ?? "supportiq-dev",
  };
}

export default defineConfig({
  plugins: useHttps ? [react(), devCertDownload()] : [react()],
  server: {
    host: true,
    allowedHosts: true,
    port: 5173,
    strictPort: false,
    https: httpsOptions(),
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: false,
        // Tell the API this browser request arrived over HTTPS so the agent
        // installer and server-address hint use the right scheme and port.
        headers: useHttps ? { "x-forwarded-proto": "https" } : undefined,
      },
    },
  },
  build: {
    outDir: "dist",
    sourcemap: false,
  },
});
