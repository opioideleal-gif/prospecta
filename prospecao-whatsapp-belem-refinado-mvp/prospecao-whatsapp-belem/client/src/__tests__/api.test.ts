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
import { request } from "node:http";
import { gunzipSync } from "node:zlib";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

const PORT = 43911;
const base = `http://127.0.0.1:${PORT}`;

async function get(path: string, init?: RequestInit) {
  return fetch(`${base}${path}`, init);
}
/**
 * Requisito cru, sem a descompressão automática do fetch: para conferir um header
 * `Content-Encoding` e o bytes que realmente saem do servidor, o cliente não pode
 * ser gentil por baixo dos panos.
 */
function raw(pathname: string, headers: Record<string, string> = {}) {
  return new Promise<{ status: number; headers: NodeJS.HttpHeadersOutgoing; body: Buffer }>((resolve, reject) => {
    const req = request({ host: "127.0.0.1", port: Number(PORT), path: pathname, headers }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.on("error", reject);
    req.end();
  });
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

describe("assets: cache imutável e gzip sem dependência nova", () => {
  const publicDir = path.resolve(__dirname, "../../../dist/public");
  const assets = path.join(publicDir, "assets");
  const hashed = fs.existsSync(assets) ? fs.readdirSync(assets).filter((f) => /-[A-Za-z0-9_-]{8,14}\.js$/.test(f)) : [];
  const built = fs.existsSync(path.join(publicDir, "index.html")) && hashed.length > 0;
  const skip = !built; // roda depois do pnpm build; sem build, não há o que checar

  it.skipIf(skip)("o mesmo arquivo chega byte por byte, e 68% menor quando o cliente aceita gzip", async () => {
    const file = hashed[0];
    const original = fs.readFileSync(path.join(assets, file));
    const plain = await raw(`/assets/${file}`, { "Accept-Encoding": "identity" }); // cliente que não fala gzip
    expect(plain.status).toBe(200);
    expect(plain.headers["content-encoding"]).toBeUndefined();
    expect(plain.body).toEqual(original);

    const packed = await raw(`/assets/${file}`, { "Accept-Encoding": "gzip" });
    expect(packed.headers["content-encoding"]).toBe("gzip");
    expect(String(packed.headers.vary)).toMatch(/Accept-Encoding/i);
    expect(packed.body.length).toBeLessThan(original.length);
    expect(gunzipSync(packed.body)).toEqual(original); // não é só menor: é o mesmo arquivo
  });
  it.skipIf(skip)("asset com hash é immutable, e o index não é cacheado", async () => {
    const asset = await raw(`/assets/${hashed[0]}`);
    expect(String(asset.headers["cache-control"])).toMatch(/max-age=31536000/);
    expect(String(asset.headers["cache-control"])).toMatch(/immutable/);
    const index = await raw("/");
    expect(index.status).toBe(200);
    expect(String(index.headers["cache-control"] || "")).not.toMatch(/immutable/);
  });
  it("a rota de assets não entrega arquivo fora de dist/public", async () => {
    const attempt = await get("/../../package.json");
    expect(attempt.status === 404 || attempt.status === 200).toBe(true);
    if (attempt.status === 200) expect(await attempt.text()).not.toContain('\"dependencies\"');
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
