import express from "express";
import { createServer } from "http";
import path from "path";
import { fileURLToPath } from "url";
import { readState, researchWebsite } from "./store.js";
import { huntLeads } from "./hunt.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

  app.use(express.static(staticPath));

  // Handle client-side routing - serve index.html for all routes
  app.get("*", (_req, res) => {
    res.sendFile(path.join(staticPath, "index.html"));
  });

  const port = process.env.PORT || 3000;

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
