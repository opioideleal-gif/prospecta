import fs from "node:fs/promises";
import path from "node:path";
import { buildResearchRecord, mergeFacts, parsePageFacts, type PageFacts } from "../shared/research.js";

export type Evidence = { id: string; claim: string; sourceUrl: string; sourceType: "website" | "public page"; sourceTitle: string; retrievedAt: string; confidence: "alta" | "média" | "baixa" };
export type ResearchRecord = { lastResearchAt: string; researchHash: string; sources: Evidence[]; signals: string[]; opportunities: string[]; facts?: PageFacts; unverified?: string[]; summary?: string; headline?: string };
export type ProspectaState = { companies: unknown[]; contacts: unknown[]; leads: unknown[]; opportunities: unknown[]; services: unknown[]; activities: unknown[]; notes: unknown[]; followUps: unknown[]; messages: unknown[]; pipelineStages: unknown[]; research: Record<string, ResearchRecord>; scores: unknown[] };

const dataPath = path.resolve(process.cwd(), ".data", "prospecta.json");
const emptyState: ProspectaState = { companies: [], contacts: [], leads: [], opportunities: [], services: [], activities: [], notes: [], followUps: [], messages: [], pipelineStages: [], research: {}, scores: [] };

export async function readState(): Promise<ProspectaState> { try { return { ...emptyState, ...JSON.parse(await fs.readFile(dataPath, "utf8")) }; } catch { return emptyState; } }
export async function writeState(state: ProspectaState) { await fs.mkdir(path.dirname(dataPath), { recursive: true }); const temporary = `${dataPath}.tmp`; await fs.writeFile(temporary, JSON.stringify(state, null, 2), "utf8"); await fs.rename(temporary, dataPath); }

function hash(value: string) { let h = 0; for (let i = 0; i < value.length; i++) h = (Math.imul(31, h) + value.charCodeAt(i)) | 0; return String(h >>> 0); }
function cleanHtml(html: string) { return html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(); }
function meta(html: string, name: string) { const match = html.match(new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]+content=["']([^"']+)["']`, "i")); return match?.[1]?.trim() || ""; }

/** Lê o site do lead e devolve só o que está lá. Falha de rede vira registro honesto
 *  (`fetchOk: false`), não erro 502: "não consegui ler" é um resultado, não uma exceção. */
export async function researchWebsite(lead: { id: string; name: string; site?: string; segment?: string }) {
  if (!lead.site) return { record: null, reason: "Nenhum site cadastrado para pesquisar." };
  const url = /^https?:\/\//i.test(lead.site) ? lead.site : `https://${lead.site}`;
  const retrievedAt = () => new Date().toISOString();

  let html = "";
  let status = 0;
  try {
    const response = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(8000), headers: { "User-Agent": "ProspectaResearch/1.0", Accept: "text/html" } });
    status = response.status;
    if (response.ok) html = await response.text();
  } catch (error) {
    status = 0;
    html = "";
    void error;
  }

  if (!html) {
    const failed = parsePageFacts("", url, { httpStatus: status || undefined, fetchOk: false });
    const record = { ...buildResearchRecord(failed, lead), lastResearchAt: retrievedAt(), researchHash: hash(`${url}:failed:${status}`), sources: [{ id: `source-${Date.now()}`, claim: `Tentei ler ${url} e a fonte respondeu HTTP ${status || "0 (sem conexão)"}`, sourceUrl: url, sourceType: "website" as const, sourceTitle: lead.name, retrievedAt: retrievedAt(), confidence: "baixa" as const }] };
    const state = await readState();
    state.research[lead.id] = record;
    await writeState(state);
    return { record };
  }

  let facts = parsePageFacts(html, url, { httpStatus: status });
  const contactPath = html.match(/href=["']([^"']*(?:contato|fale-conosco|faleconosco)[^"']*)["']/i)?.[1];
  const needsContact = !(facts.phones?.length || facts.emails?.length) && Boolean(contactPath) && !/^(tel|mailto|https?:)/i.test(contactPath || "");
  if (needsContact && contactPath) {
    try {
      const contactUrl = new URL(contactPath, url).toString();
      const contact = await fetch(contactUrl, { redirect: "follow", signal: AbortSignal.timeout(6000), headers: { "User-Agent": "ProspectaResearch/1.0", Accept: "text/html" } });
      if (contact.ok) facts = mergeFacts(facts, parsePageFacts(await contact.text(), contactUrl, { httpStatus: contact.status, pageLabel: "página de contato" }));
    } catch {
      /* a home já é suficiente; falha em /contato não descarta o resto */
    }
  }

  const record = {
    ...buildResearchRecord(facts, lead),
    lastResearchAt: retrievedAt(),
    researchHash: hash(`${url}:${facts.pageTitle ?? ""}:${facts.description ?? ""}:${facts.phones?.length ?? 0}:${facts.instagram ?? ""}:${Object.values(facts.presence).filter((probe) => probe.state === "found").length}`),
    sources: [
      { id: `source-${Date.now()}`, claim: `Conteúdo público consultado em ${url}`, sourceUrl: url, sourceType: "website" as const, sourceTitle: facts.pageTitle || lead.name, retrievedAt: retrievedAt(), confidence: (facts.presence.site.state === "found" ? "alta" : "média") as "alta" | "média" | "baixa" },
      ...(facts.checkedOtherUrl ? [{ id: `source-contact-${Date.now()}`, claim: `Página de contato consultada em ${facts.checkedOtherUrl}`, sourceUrl: facts.checkedOtherUrl, sourceType: "public page" as const, sourceTitle: "contato", retrievedAt: retrievedAt(), confidence: "média" as const }] : []),
    ],
  };
  const state = await readState();
  state.research[lead.id] = record;
  await writeState(state);
  return { record };
}
