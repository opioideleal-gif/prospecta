import fs from "node:fs/promises";
import path from "node:path";

export type Evidence = { id: string; claim: string; sourceUrl: string; sourceType: "website" | "public page"; sourceTitle: string; retrievedAt: string; confidence: "alta" | "média" | "baixa" };
export type ResearchRecord = { lastResearchAt: string; researchHash: string; sources: Evidence[]; signals: string[]; opportunities: string[] };
export type ProspectaState = { companies: unknown[]; contacts: unknown[]; leads: unknown[]; opportunities: unknown[]; services: unknown[]; activities: unknown[]; notes: unknown[]; followUps: unknown[]; messages: unknown[]; pipelineStages: unknown[]; research: Record<string, ResearchRecord>; scores: unknown[] };

const dataPath = path.resolve(process.cwd(), ".data", "prospecta.json");
const emptyState: ProspectaState = { companies: [], contacts: [], leads: [], opportunities: [], services: [], activities: [], notes: [], followUps: [], messages: [], pipelineStages: [], research: {}, scores: [] };

export async function readState(): Promise<ProspectaState> { try { return { ...emptyState, ...JSON.parse(await fs.readFile(dataPath, "utf8")) }; } catch { return emptyState; } }
export async function writeState(state: ProspectaState) { await fs.mkdir(path.dirname(dataPath), { recursive: true }); const temporary = `${dataPath}.tmp`; await fs.writeFile(temporary, JSON.stringify(state, null, 2), "utf8"); await fs.rename(temporary, dataPath); }

function hash(value: string) { let h = 0; for (let i = 0; i < value.length; i++) h = (Math.imul(31, h) + value.charCodeAt(i)) | 0; return String(h >>> 0); }
function cleanHtml(html: string) { return html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(); }
function meta(html: string, name: string) { const match = html.match(new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]+content=["']([^"']+)["']`, "i")); return match?.[1]?.trim() || ""; }

export async function researchWebsite(lead: { id: string; name: string; site?: string; segment?: string }) {
  if (!lead.site) return { record: null, reason: "Nenhum site cadastrado para pesquisar." };
  const url = /^https?:\/\//i.test(lead.site) ? lead.site : `https://${lead.site}`;
  const response = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(8000), headers: { "User-Agent": "ProspectaResearch/1.0" } });
  if (!response.ok) throw new Error(`Fonte respondeu HTTP ${response.status}`);
  const html = await response.text();
  const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || lead.name).replace(/\s+/g, " ").trim();
  const description = meta(html, "description");
  const text = cleanHtml(html).toLowerCase();
  const keywords: Array<[string, string]> = [["manutenção", "indicação de manutenção"], ["climatização", "indicação de climatização"], ["refrigeração", "indicação de refrigeração"], ["atacado", "indicação de operação de atacado"], ["distribui", "indicação de distribuição"], ["orçamento", "indicação de oferta de orçamento"], ["whatsapp", "indicação de atendimento por WhatsApp"], ["empresa", "indicação de atendimento a empresas"]];
  const signals = keywords.filter(([term]) => text.includes(term)).map(([, signal]) => signal);
  if (description) signals.push(`descrição pública: ${description.slice(0, 180)}`);
  const opportunities = lead.segment === "Distribuidoras" && signals.length ? ["Catálogo B2B + orçamento + pedidos"] : lead.segment === "Imobiliárias" && signals.length ? ["Apresentação digital e captação de interessados"] : signals.length ? ["Site comercial + captação de oportunidades"] : [];
  const record: ResearchRecord = { lastResearchAt: new Date().toISOString(), researchHash: hash(`${url}:${title}:${description}:${signals.join("|")}`), sources: [{ id: `source-${Date.now()}`, claim: `Conteúdo público consultado em ${url}`, sourceUrl: url, sourceType: "website", sourceTitle: title, retrievedAt: new Date().toISOString(), confidence: signals.length >= 3 ? "alta" : signals.length ? "média" : "baixa" }], signals, opportunities };
  const state = await readState(); state.research[lead.id] = record; await writeState(state); return { record };
}
