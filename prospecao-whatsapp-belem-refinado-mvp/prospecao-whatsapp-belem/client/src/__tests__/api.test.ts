// @vitest-environment node
/**
 * Testes de contrato do backend (Express).
 *
 * Escritos para passar tanto offline quanto online: onde houver rede, as rotas de
 * busca/pesquisa respondem 200 com resultados; onde não houver, /api/research responde
 * 200 com um registro honesto (`facts.fetchOk: false`, tudo `unknown`) em vez de erro —
 * porque "não consegui ler" é um resultado. O que importa aqui é o contrato: parâmetros
 * obrigatórios, formato da resposta e persistência. O estado vai para um diretório
 * temporário, para não sujar o .data/prospecta.json de quem desenvolve.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

const PORT = 43911;
const base = `http://127.0.0.1:${PORT}`;

async function get(path: string, init?: RequestInit) {
  return fetch(`${base}${path}`, init);
}
const post = (path: string, body: unknown) =>
  get(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

beforeAll(async () => {
  process.env.PORT = String(PORT);
  process.env.NODE_ENV = "test";
  process.env.PROSPECTA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "prospecta-test-"));
  await import("../../../server/index.js");
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      const ok = await get("/api/health").then((r) => r.ok);
      if (ok) return;
    } catch {
      /* ainda subindo */
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("servidor de teste não subiu");
});

describe("GET /api/health", () => {
  it("responde 200 com o diagnóstico dos módulos", async () => {
    const response = await get("/api/health");
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ ok: true, persistence: "server-file", research: "on-demand-website", hunting: "public-search" });
  });
});

describe("POST /api/hunt-leads", () => {
  it("recusa requisição sem segmento ou localização", async () => {
    expect((await post("/api/hunt-leads", {})).status).toBe(400);
    expect((await post("/api/hunt-leads", { segment: "refrigeração" })).status).toBe(400);
  });
  it("valida e normaliza a quantidade pedida", async () => {
    const response = await post("/api/hunt-leads", { segment: "imobiliárias", location: "Belém", quantity: 900 });
    expect(response.status).toBeLessThan(600);
    if (response.ok) {
      const body = await response.json();
      expect(Array.isArray(body.results)).toBe(true);
      expect(body.results.length).toBeLessThanOrEqual(50);
      expect(typeof body.provider).toBe("string");
      for (const item of body.results) {
        expect(item).toHaveProperty("name");
        expect(item).toHaveProperty("sourceUrl");
        expect(item.score).toBeGreaterThanOrEqual(0);
        expect(item.score).toBeLessThanOrEqual(94);
        expect(["alta", "média", "baixa"]).toContain(item.confidence);
      }
    } else {
      expect((await response.json()).error).toBeTruthy();
    }
  });
});

describe("POST /api/research", () => {
  it("exige id e name", async () => {
    const response = await post("/api/research", { site: "exemplo.com.br" });
    expect(response.status).toBe(400);
  });
  it("informa de forma explícita quando o lead não tem site", async () => {
    const response = await post("/api/research", { id: `sem-site-${Date.now()}`, name: "Empresa Sem Site" });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.record).toBeNull();
    expect(body.reason).toMatch(/Nenhum site/);
  });
  it("fonte que não responde vira registro honesto, não afirmação de ausência", async () => {
    const response = await post("/api/research", { id: `inexistente-${Date.now()}`, name: "Domínio Morto", site: "dominio-que-nao-existe-9f8a7b.example" });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.record.facts.fetchOk).toBe(false);
    // nada pode ser reportado como "não tem": tudo fica "unknown" e sem evidência
    expect(Object.values(body.record.facts.presence).every((probe: { state: string }) => probe.state === "unknown")).toBe(true);
    expect(body.record.signals ?? []).toEqual([]);
  });
  it("GET /api/research/:leadId devolve null para lead nunca pesquisado", async () => {
    const response = await get(`/api/research/nunca-pesquisado-${Date.now()}`);
    expect(response.status).toBe(200);
    expect(await response.json()).toBeNull();
  });
});
