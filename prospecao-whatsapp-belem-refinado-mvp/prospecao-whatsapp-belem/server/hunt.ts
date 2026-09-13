export type HuntedLead = { id: string; name: string; phone?: string; whatsapp?: string; site?: string; segment: string; location: string; score: number; opportunity: string; sourceUrl: string; sourceTitle: string; confidence: "alta" | "média" | "baixa" };

function clean(value: string) { return value.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/\s+/g, " ").trim(); }
function id(value: string) { let h = 0; for (const c of value) h = (Math.imul(31, h) + c.charCodeAt(0)) | 0; return `hunt-${Math.abs(h)}`; }
function phone(value: string) { const found = value.match(/(?:\+?55\s?)?(?:\(?\d{2}\)?\s?)?9?\d{4}[-.\s]?\d{4}/); return found?.[0]?.trim(); }
function domain(value: string) { try { return new URL(value).hostname.replace(/^www\./, ""); } catch { return undefined; } }

export async function huntLeads(params: { segment: string; location: string; quantity: number }) {
  const quantity = Math.max(1, Math.min(50, Number(params.quantity) || 20));
  const query = `${params.segment} ${params.location} telefone WhatsApp site`;
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const response = await fetch(url, { headers: { "User-Agent": "ProspectaLeadHunter/1.0" }, signal: AbortSignal.timeout(12000) });
  if (!response.ok) throw new Error(`Pesquisa pública indisponível (HTTP ${response.status})`);
  let html = await response.text();
  const results: HuntedLead[] = [];
  let provider = "DuckDuckGo HTML público";
  let pattern = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  if (true) {
    const bing = await fetch(`https://www.bing.com/search?q=${encodeURIComponent(query)}`, { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(12000) });
    if (bing.ok) { provider = "Bing HTML público"; html = await bing.text(); pattern = /<h2[^>]*><a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a><\/h2>/gi; }
  }
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html)) && results.length < quantity) {
    const sourceUrl = match[1].replace(/&amp;/g, "&");
    const sourceTitle = clean(match[2]);
    if (!sourceTitle || !sourceUrl.startsWith("http")) continue;
    const snippetStart = match.index;
    const snippet = clean(html.slice(snippetStart, snippetStart + 1800));
    const relevance = `${sourceTitle} ${snippet}`.toLowerCase();
    const locationTerms = params.location.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").split(/\s+/).filter((term) => term.length > 3);
    const segmentTerms = params.segment.toLowerCase().split(/\s+/).filter((term) => term.length > 3);
    if (!locationTerms.some((term) => relevance.includes(term)) && !segmentTerms.some((term) => relevance.includes(term))) continue;
    const foundPhone = phone(snippet);
    const site = domain(sourceUrl);
    const name = sourceTitle.split(/[|–—-]/)[0].trim().slice(0, 100);
    const lower = `${sourceTitle} ${snippet}`.toLowerCase();
    const score = Math.min(94, 55 + (foundPhone ? 15 : 0) + (site ? 8 : 0) + (lower.includes("whatsapp") ? 10 : 0) + (lower.includes("empresa") ? 4 : 0));
    results.push({ id: id(`${name}-${sourceUrl}`), name, phone: foundPhone, whatsapp: lower.includes("whatsapp") ? foundPhone : undefined, site, segment: params.segment, location: params.location, score, opportunity: `Investigar oferta de ${params.segment} e abordagem comercial local`, sourceUrl, sourceTitle, confidence: foundPhone && site ? "alta" : foundPhone || site ? "média" : "baixa" });
  }
  const unique = new Map<string, HuntedLead>();
  for (const item of results) unique.set(item.phone || item.site || item.name.toLowerCase(), item);
  return { query, provider, results: Array.from(unique.values()).slice(0, quantity) };
}
