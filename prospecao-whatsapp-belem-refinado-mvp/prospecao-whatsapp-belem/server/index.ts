import express from "express";
import { createServer } from "http";
import { createGzip } from "zlib";
import { createReadStream, statSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { readState, researchWebsite } from "./store.js";
import { huntLeads } from "./hunt.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Assets com hash no nome (index-Ab12Cd34.js) são imutáveis por definição: o nome muda a cada
 * build. Servir com `immutable` faz o segundo acesso ao Prospecta não baixar nada. O gzip é
 * feito no streaming, com o mesmo ganho de uma dependência extra e nenhuma dependência extra —
 * texto puro de 580 kB é o custo real de abrir a ferramenta hoje.
 */
const COMPRESSIBLE = /\.(js|mjs|css|svg|json|map|html)$/i;
const HASHED = /-[A-Za-z0-9_-]{8,14}\.(js|css|svg|png|jpe?g|woff2?)$/i;
const MIN_GZIP_BYTES = 860;
function isHashedAsset(filePath: string) { return HASHED.test(path.basename(filePath)); }
function hashableAssets(staticPath: string) {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    try {
      const acceptEncoding = String(req.headers["accept-encoding"] || "");
      if (req.method !== "GET" || !/\bgzip\b/.test(acceptEncoding)) return next();
      const rel = decodeURIComponent(req.path.split("?")[0]);
      if (!rel || rel.includes("..")) return next();
      const filePath = path.join(staticPath, rel === "/" ? "index.html" : rel); // "/" também é texto e também comprime
      if (!filePath.startsWith(staticPath + path.sep) || !COMPRESSIBLE.test(filePath)) return next();
      const stat = statSync(filePath, { throwIfNoEntry: false });
      if (!stat?.isFile() || stat.size < MIN_GZIP_BYTES) return next();
      res.setHeader("Content-Encoding", "gzip");
      res.setHeader("Vary", "Accept-Encoding");
      res.setHeader("Cache-Control", isHashedAsset(filePath) ? "public, max-age=31536000, immutable" : "no-cache");
      res.type(path.extname(filePath));
      res.removeHeader("Content-Length"); // corpo sai gzip em streaming: o tamanho do arquivo não vale
      createReadStream(filePath).pipe(createGzip()).pipe(res);
    } catch (error) {
      res.headersSent ? res.destroy() : next(error);
    }
  };
}

async function startServer() {
  const app = express();
  const server = createServer(app);

  // Serve static files from dist/public in production
  const staticPath =
    process.env.NODE_ENV === "production"
      ? path.resolve(__dirname, "public")
      : path.resolve(__dirname, "..", "dist", "public");

  app.use(express.json({ limit: "1mb" }));
  app.get("/api/health", (_req, res) => res.json({ ok: true, persistence: "server-file", research: "on-demand-website", hunting: "public-search" }));
  app.post("/api/hunt-leads", async (req, res) => { try { const { segment, location, quantity } = req.body || {}; if (!segment || !location) return res.status(400).json({ error: "segment e location são obrigatórios" }); res.json(await huntLeads({ segment, location, quantity })); } catch (error) { res.status(502).json({ error: error instanceof Error ? error.message : "Falha na busca de leads" }); } });
  app.get("/api/research/:leadId", async (req, res) => { const state = await readState(); res.json(state.research[req.params.leadId] || null); });
  app.post("/api/research", async (req, res) => { try { const { id, name, site, segment } = req.body || {}; if (!id || !name) return res.status(400).json({ error: "id e name são obrigatórios" }); const result = await researchWebsite({ id, name, site, segment }); res.json(result); } catch (error) { res.status(502).json({ error: error instanceof Error ? error.message : "Falha na pesquisa" }); } });

  app.use(hashableAssets(staticPath));
  app.use(express.static(staticPath, { setHeaders: (res, filePath) => { if (isHashedAsset(filePath)) res.setHeader("Cache-Control", "public, max-age=31536000, immutable"); } }));

  // Handle client-side routing - serve index.html for all routes
  app.get("*", (_req, res) => {
    res.setHeader("Cache-Control", "no-cache");
    res.sendFile(path.join(staticPath, "index.html"));
  });

  const port = process.env.PORT || 3000;

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
