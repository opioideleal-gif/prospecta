/**
 * extração de FATOS de uma página pública — camada 100% pura, sem rede.
 *
 * Por que isso existe separado do fetch: o servidor só busca e entrega HTML; quem decide
 * o que é fato é esta função. Assim dá para testar a extração com fixtures e a mesma
 * lógica vale para o client, para o `server/store.ts` e para qualquer fonte futura.
 *
 * Regra absoluta do produto: nada é afirmado sem evidência. Por isso cada sondagem é um Probe
 * com estado `found` (vi e guardo de onde tirei), `absent` (a página foi lida e aquilo não
 * está lá) ou `unknown` (não conseguimos ler a página — ausência não pode ser alegada).
 */
import { cleanText, formatPhoneBr, hostOf, normalizeEmail, socialHandle, toWhatsAppNumber } from "./normalize";

export type ProbeState = "found" | "absent" | "unknown";

export type Probe = { state: ProbeState; evidence?: string; url?: string };

export const found = (evidence: string, url?: string): Probe => ({ state: "found", evidence, url });
export const absent = (note?: string): Probe => ({ state: "absent", evidence: note });
export const unknown = (note?: string): Probe => ({ state: "unknown", evidence: note });

export type PresenceMap = {
  site: Probe;
  catalog: Probe;
  ecommerce: Probe;
  whatsapp: Probe;
  instagram: Probe;
  facebook: Probe;
  contactLink: Probe;
  recentContent: Probe;
  searchListing: Probe;
};

export type PageFacts = {
  url: string;
  host: string;
  fetchOk: boolean;
  httpStatus?: number;
  retrievedAt: string;
  pageTitle?: string;
  description?: string;
  siteName?: string;
  phones?: string[];
  emails?: string[];
  address?: string;
  instagram?: string;
  facebook?: string;
  otherProfiles?: string[];
  services?: string[];
  products?: string[];
  keywords?: string[];
  headings?: string[];
  schemaTypes?: string[];
  lastContentDate?: string;
  checkedOtherUrl?: string;
  presence: PresenceMap;
  /** grupos prontos para exibição (IDENTIFICAÇÃO … PRESENÇA COMERCIAL) */
  groups?: FactGroup[];
};

const PHONE_RE = /(?:\+?55[\s.-]?)?(?:\(?0?\d{2}\)?[\s.-]?)?9?\d{4}[\s.-]?\d{4}/g;
const SOCIAL_RE = /https?:\/\/(?:www\.)?(instagram|facebook|youtube|linkedin|tiktok)\.com\/[^\s"'<>\\]+/gi;
// "Menu" aparece na navegação de qualquer site: sozinho ele NÃO é catálogo.
const CATALOG_RE = /(card[aá]pio|cat[aá]logo|tabela de pre[cç]os|lista de produtos|produtos e servi[cç]os|nossos servi[cç]os|vitrine|menu (?:digital|de (?:produtos|servi[cç]os|pratos|bebidas|pre[cç]os))|pre[cç]o: ?R\$|R\$ ?\d[\d.,]*)/i;
// estrutura de vitrine costuma morar em classes/attrs, não no texto visível
const CATALOG_MARKUP_RE = /(product-list|product-grid|nsapp-product|woocommerce-loop|products-slider|itemtype=["']https?:\/\/schema\.org\/Product)/i;
const COMMERCE_RE = /(carrinho|comprar agora|adicionar (?:ao carrinho|[aà] sacola)|checkout|loja virtual|e-?commerce|finalizar compra|pagamento (?:online|seguro)|mercado pago|pagseguro|mercadolivre|mercado livre)/i;
const COMMERCE_PLATFORM_RE = /(cdn\.shopify|myshopify|nuvemshop|cartpanda|yampi|vtex|opencart|magento|woocommerce|add[-_ ]to[-_ ]cart|\/cart\b|\/checkout\/)/i;
const WHATSAPP_LINK_RE = /(wa\.me\/\d+|api\.whatsapp\.com\/send|web\.whatsapp\.com\/send|whatsapp:\/\/send|wa\.link\/|chatwhatsapp|whatsapp-client|wa\.cli\.ee|(?:href|src|content|data-[a-z-]+)=["'][^"']*whatsapp[^"']*(?:phone=|\d{10,})[^"']*["'])/i;
const CONTACT_LINK_RE = /href=["']([^"']*(?:contato|fale-conosco|faleconosco|contact)[^"']*)["']/i;
const SERVICE_HEADING_RE = /(manuten|repara|instala|assist[eê]ncia|consultoria|projeto|reforma|laudo|per[íi]cia|limpeza|pintura|loca[çc][aã]o|venda|entrega|atendimento|aula|curso|servi[çc]o|card[aá]pio|buf[eê]|eventos|obra|caldeiraria|montagem|vistoria|projetos)/i;

function metaAll(html: string, name: string): string | undefined {
  const re = new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]*content=["']([^"']*)["']`, "i");
  const m = html.match(re);
  return m?.[1] ? cleanText(m[1], 220) : undefined;
}

/** JSON-LD é onde o site declara telefone, endereço e catálogo de verdade. Só copiamos. */
function readJsonLd(html: string): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  for (const block of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const parsed = JSON.parse(block[1].trim());
      for (const node of Array.isArray(parsed) ? parsed : [parsed]) {
        if (node && typeof node === "object") out.push(node as Record<string, unknown>);
        // @graph também carrega os blocos em sites gerados por construtor
        const graph = (node as { "@graph"?: unknown })?.["@graph"];
        if (Array.isArray(graph)) for (const item of graph) if (item && typeof item === "object") out.push(item as Record<string, unknown>);
      }
    } catch {
      /* JSON-LD quebrado é comum; ignorar é mais honesto do que adivinhar */
    }
  }
  return out;
}

function asArray(value: unknown): unknown[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function collectStrings(value: unknown, depth = 0): string[] {
  if (depth > 4 || value == null) return [];
  if (typeof value === "string") return [cleanText(value, 120)];
  if (typeof value === "number") return [String(value)];
  if (Array.isArray(value)) return value.flatMap((item) => collectStrings(item, depth + 1));
  if (typeof value === "object") {
    const node = value as Record<string, unknown>;
    const named = node.name ?? node.title ?? node.displayName;
    if (typeof named === "string") return [cleanText(named, 120)];
    return ["hasOfferCatalog", "makesOffer", "offers", "serviceType", "slogan"].flatMap((k) => collectStrings(node[k], depth + 1));
  }
  return [];
}

function addressFrom(node: Record<string, unknown>): string | undefined {
  const a = node.address;
  if (!a) return undefined;
  if (typeof a === "string") return cleanText(a, 160);
  const parts = a as Record<string, unknown>;
  const street = [parts.streetAddress, parts.addressLocality, parts.addressRegion, parts.postalCode].filter((x) => typeof x === "string").join(", ");
  return street ? cleanText(street, 160) : undefined;
}

/** Um nome de rua/avenida com CEP é forte o suficiente para chamar de endereço; sem isso, nada. */
function addressFromText(text: string): string | undefined {
  const m = text.match(/((?:Rua|R\.|Avenida|Av\.|Travessa|Tv\.|Passagem|Alameda|Conjunto)[^\n|]{4,80}?(?:CEP\s*\d{5}-?\d{3}|\d{5}-\d{3}))/i);
  return m ? cleanText(m[1], 160) : undefined;
}

function phonesIn(html: string): string[] {
  const numbers = new Set<string>();
  for (const tel of html.matchAll(/href=["']tel:([^"']+)["']/gi)) {
    const n = toWhatsAppNumber(tel[1]);
    if (n.length >= 12) numbers.add(n);
  }
  // dados de SPA ficam em JSON embutido: só aceitamos número atribuído a uma chave de contato
  for (const json of html.matchAll(/["'](phone|telefone|whatsapp|celular|fone|contato_telefone|mobile)\s*["']?\s*[:=]\s*["']?([+\d][\d\s().-]{8,20})/gi)) {
    const n = toWhatsAppNumber(json[2]);
    if (n.length >= 12 && n.length <= 13) numbers.add(n);
  }
  const text = cleanText(html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<[^>]+>/g, " "), 20000);
  for (const raw of text.match(PHONE_RE) || []) {
    const n = toWhatsAppNumber(raw);
    if (n.length >= 12 && n.length <= 13) numbers.add(n);
  }
  return [...numbers];
}

function emailsIn(html: string): string[] {
  const out = new Set<string>();
  for (const m of html.matchAll(/mailto:([^"'?\s]+)/gi)) {
    const e = normalizeEmail(m[1]);
    if (e) out.add(e);
  }
  for (const m of html.matchAll(/[\w.+-]+@[\w-]+\.[\w.-]+/g)) {
    if (/\.(png|jpe?g|webp|svg|gif|css|js)$/i.test(m[0])) continue;
    const e = normalizeEmail(m[0]);
    if (e) out.add(e);
  }
  return [...out].slice(0, 3);
}

function probe(re: RegExp, haystack: string, label: string, url?: string): Probe {
  const m = haystack.match(re);
  return m ? found(`${label}: “${cleanText(m[0], 60)}”`, url) : absent(label);
}

/**
 * Lê uma página e devolve apenas o que está lá. `pageLabel` só muda o rótulo da evidência
 * quando o mesmo parser é aplicado a uma segunda URL (ex.: /contato).
 */
export function parsePageFacts(html: string, url: string, options: { httpStatus?: number; pageLabel?: string; fetchOk?: boolean } = {}): PageFacts {
  const label = options.pageLabel ?? "página";
  const nodes = readJsonLd(html);
  const text = cleanText(html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " "), 40000);
  const title = cleanText(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "", 160) || undefined;
  const phones = phonesIn(html);
  const emails = emailsIn(html);
  const instagram = socialHandle(html.match(/https?:\/\/(?:www\.)?instagram\.com\/[^\s"'<>\\]+/i)?.[0]);
  const facebook = socialHandle(html.match(/https?:\/\/(?:www\.)?facebook\.com\/[^\s"'<>\\]+/i)?.[0]);
  const others = [...html.matchAll(SOCIAL_RE)].map((m) => socialHandle(m[0])).filter((h): h is string => Boolean(h));
  const serviceTypes = nodes.flatMap((n) => collectStrings(n.serviceType));
  const offerNames = nodes.flatMap((n) => [...collectStrings(n.hasOfferCatalog), ...collectStrings(n.makesOffer)]);
  const products = nodes.flatMap((n) => (String(n["@type"] || "").toLowerCase().includes("product") ? [cleanText(String(n.name || ""), 80)] : [])).filter(Boolean);
  const headings = [...html.matchAll(/<h[123][^>]*>([\s\S]*?)<\/h[123]>/gi)].map((m) => cleanText(m[1], 90)).filter((h) => h.length > 2);
  const addresses = nodes.map((n) => addressFrom(n)).filter((a): a is string => Boolean(a));
  const lastContentDate = metaAll(html, "og:updated_time") || metaAll(html, "article:modified_time") || metaAll(html, "article:published_time") || nodes.map((n) => (typeof n.dateModified === "string" ? n.dateModified : typeof n.datePublished === "string" ? n.datePublished : "")).filter(Boolean)[0];
  const schemaTypes = [...new Set(nodes.flatMap((n) => asArray(n["@type"])).map((t) => String(t)))];
  const contactHref = html.match(CONTACT_LINK_RE)?.[1];
  // texto visível E atributos de markup: em WordPress/Elementor/Nuvemshop o sinal costuma
  // estar na classe do botão, não na palavra escrita
  const catalogHit = text.match(CATALOG_RE)?.[0] || html.match(CATALOG_MARKUP_RE)?.[0];
  const commerceHit = text.match(COMMERCE_RE)?.[0] || html.match(COMMERCE_PLATFORM_RE)?.[0];
  const whatsappHit = html.match(WHATSAPP_LINK_RE)?.[0]
    || /["']whatsapp["']\s*[:=]\s*["']?(?:\+?\d{10,13}|https?:[^\s"']*)/i.exec(html)?.[0]
    || (/whatsapp/i.test(text) ? "menção escrita a WhatsApp" : undefined);
  // REGRA ABSOLUTA: se o conteúdo não chegou, nada pode ser marcado como "não tem".
  // A tentativa fracassada produz `unknown` em toda a presença digital.
  const fetchOk = options.fetchOk ?? (html.trim().length > 0 && (options.httpStatus === undefined || options.httpStatus < 400));
  const unread = !fetchOk;
  const notRead = () => unknown(`${label} não foi lido (${options.httpStatus ? `HTTP ${options.httpStatus}` : "sem resposta"}) — não é possível afirmar ausência`);
  const presence: PresenceMap = unread
    ? { site: notRead(), catalog: notRead(), ecommerce: notRead(), whatsapp: notRead(), instagram: notRead(), facebook: notRead(), contactLink: notRead(), recentContent: notRead(), searchListing: unknown("exige consulta a buscador") }
    : {
    site: found(`título: “${title || hostOf(url)}”`, url),
    catalog: catalogHit ? found(`${label} mostra material de venda: “${cleanText(catalogHit, 44)}”`, url) : absent("nenhum catálogo/cardápio na página lida"),
    ecommerce: commerceHit ? found(`${label} indica venda online: “${cleanText(commerceHit, 44)}”`, url) : absent("nenhuma venda online na página lida"),
    whatsapp: whatsappHit ? found(`canal de WhatsApp: “${cleanText(whatsappHit, 52)}”`, url) : absent("nenhum link de WhatsApp na página lida"),
    instagram: instagram ? found(`perfil ${instagram} linkado`, url) : absent("sem link de Instagram"),
    facebook: facebook ? found(`perfil ${facebook} linkado`, url) : absent("sem link de Facebook"),
    contactLink: contactHref ? found(`página de contato em ${contactHref}`, url) : absent("sem link de contato"),
    recentContent: lastContentDate ? found(`data publicada na página: ${lastContentDate}`, url) : absent("sem data de conteúdo na página"),
    // só uma busca externa pode dizer isto; parsear página alguma vez afirma
    searchListing: unknown("exige consulta a buscador"),
  };
  return {
    url,
    host: hostOf(url),
    fetchOk,
    httpStatus: options.httpStatus,
    retrievedAt: new Date().toISOString(),
    pageTitle: title,
    description: metaAll(html, "description") || (nodes.map((n) => (typeof n.description === "string" ? cleanText(n.description, 220) : "")).filter(Boolean)[0] as string | undefined),
    siteName: metaAll(html, "og:site_name") || (typeof nodes[0]?.name === "string" ? cleanText(nodes[0].name as string, 120) : undefined),
    phones,
    emails,
    address: addresses[0] || addressFromText(text),
    instagram,
    facebook,
    otherProfiles: others.filter((h) => h !== instagram && h !== facebook).slice(0, 4),
    services: [...new Set([...serviceTypes, ...offerNames, ...headings.filter((h) => SERVICE_HEADING_RE.test(h))])].slice(0, 8),
    products: [...new Set(products)].slice(0, 10),
    keywords: metaAll(html, "keywords")?.split(",").map((k) => cleanText(k, 40)).filter(Boolean).slice(0, 10),
    headings: headings.slice(0, 10),
    schemaTypes: schemaTypes.slice(0, 6),
    lastContentDate,
    presence,
  };
}

/** Uma página principal pode não ter telefone; a de contato quase sempre tem. Une sem sobrescrever. */
export function mergeFacts(primary: PageFacts, extra: PageFacts): PageFacts {
  return {
    ...primary,
    phones: [...new Set([...(primary.phones || []), ...(extra.phones || [])])],
    emails: [...new Set([...(primary.emails || []), ...(extra.emails || [])])],
    address: primary.address || extra.address,
    instagram: primary.instagram || extra.instagram,
    facebook: primary.facebook || extra.facebook,
    otherProfiles: [...new Set([...(primary.otherProfiles || []), ...(extra.otherProfiles || [])])].slice(0, 4),
    services: [...new Set([...(primary.services || []), ...(extra.services || [])])].slice(0, 8),
    products: [...new Set([...(primary.products || []), ...(extra.products || [])])].slice(0, 10),
    headings: [...new Set([...(primary.headings || []), ...(extra.headings || [])])].slice(0, 10),
    lastContentDate: primary.lastContentDate || extra.lastContentDate,
    description: primary.description || extra.description,
    checkedOtherUrl: extra.url,
    presence: {
      ...primary.presence,
      whatsapp: primary.presence.whatsapp.state === "found" ? primary.presence.whatsapp : extra.presence.whatsapp,
      instagram: primary.presence.instagram.state === "found" ? primary.presence.instagram : extra.presence.instagram,
      facebook: primary.presence.facebook.state === "found" ? primary.presence.facebook : extra.presence.facebook,
      catalog: primary.presence.catalog.state === "found" ? primary.presence.catalog : extra.presence.catalog,
      ecommerce: primary.presence.ecommerce.state === "found" ? primary.presence.ecommerce : extra.presence.ecommerce,
      recentContent: primary.presence.recentContent.state === "found" ? primary.presence.recentContent : extra.presence.recentContent,
      contactLink: primary.presence.contactLink.state === "found" ? primary.presence.contactLink : extra.presence.contactLink,
    },
  };
}

/** Fatos → lista plana de coisas verificadas. É isto que o gerador de texto tem permissão de usar. */
export function verifiedFacts(facts?: PageFacts): string[] {
  if (!facts || !facts.fetchOk) return [];
  const out: string[] = [];
  if (facts.description) out.push(`descrição pública: ${facts.description.slice(0, 120)}`);
  if (facts.services?.length) out.push(`serviços citados: ${facts.services.slice(0, 3).join(", ")}`);
  if (facts.products?.length) out.push(`produtos anunciados: ${facts.products.slice(0, 3).join(", ")}`);
  if (facts.instagram) out.push(`Instagram ${facts.instagram} linkado no site`);
  if (facts.facebook) out.push(`Facebook ${facts.facebook} linkado no site`);
  for (const [key, probeValue] of Object.entries(facts.presence)) {
    if (key === "site" || probeValue.state !== "found" || !probeValue.evidence) continue;
    out.push(probeValue.evidence);
  }
  return out.slice(0, 8);
}

/** O que NÃO sabemos — existe para o modelo de texto calar a boca, não para afirmar falta. */
export function unverifiedFacts(facts?: PageFacts): string[] {
  if (!facts) return ["nenhuma leitura externa realizada"];
  if (!facts.fetchOk) return [`site não pôde ser lido (${facts.httpStatus ? `HTTP ${facts.httpStatus}` : "sem resposta"})`];
  const out: string[] = [];
  if (facts.presence.catalog.state === "absent") out.push("catálogo/cardápio não identificado");
  if (facts.presence.ecommerce.state === "absent") out.push("venda online não identificada");
  if (facts.presence.recentContent.state === "absent") out.push("frequência de atualização não verificada");
  out.push("presença em buscador não verificada");
  return out;
}

/** Base de um registro de pesquisa — o servidor só acrescenta `sources` e `researchHash`. */
/* ---------------------------------------------------------------------------
 * Grupos do fluxo: IDENTIFICAÇÃO / CONTATO / PRESENÇA DIGITAL / INFORMAÇÕES /
 * PRESENÇA COMERCIAL. O endpoint devolve exatamente esta estrutura e a ficha a
 * renderiza sem repetir regra — a organização nasce junto do dado.
 * ------------------------------------------------------------------------- */
export type FactItem = { label: string; state: ProbeState; value?: string; href?: string; evidence?: string };
export type FactGroup = { id: string; title: string; items: FactItem[] };

export function factGroups(facts: PageFacts): FactGroup[] {
  const p = facts.presence;
  const phone = facts.phones?.[0];
  const email = facts.emails?.[0];
  const read = facts.fetchOk;
  const guard = (probe: Probe): Probe => (read ? probe : unknown("página não foi lida"));
  const item = (label: string, probe: Probe, value?: string, href?: string): FactItem => {
    const safe = guard(probe);
    const shown = value && value.trim() ? value.trim() : undefined;
    return {
      label,
      // página não lida: nem um valor presente pode virar "encontrado"
      state: read ? (shown ? "found" : safe.state) : "unknown",
      value: shown ?? (safe.state === "found" ? safe.evidence : safe.state === "absent" ? "não indicado na página" : "não verificado"),
      href: shown ? href : undefined,
      evidence: safe.evidence,
    };
  };
  return [
    {
      id: "identificacao",
      title: "IDENTIFICAÇÃO",
      items: [item("Nome no site", read && (facts.pageTitle || facts.siteName) ? found(facts.siteName || facts.pageTitle || "", facts.url) : absent("título não lido"), facts.siteName || facts.pageTitle, facts.url), item("Endereço publicado", read && facts.address ? found(facts.address, facts.url) : absent("sem endereço na página"), facts.address), item("Autodescrição", read && facts.description ? found(facts.description.slice(0, 120), facts.url) : absent("sem descrição na página"), facts.description)],
    },
    {
      id: "contato",
      title: "CONTATO",
      items: [item("Telefone", read && phone ? found(phone, facts.url) : absent("nenhum telefone na página lida"), phone ? formatPhoneBr(phone) : undefined, phone ? `tel:+${toWhatsAppNumber(phone)}` : undefined), item("E-mail", read && email ? found(email, facts.url) : absent("nenhum e-mail na página lida"), email, email ? `mailto:${email}` : undefined), item("Link de contato", p.contactLink, p.contactLink.state === "found" ? p.contactLink.evidence : undefined, p.contactLink.url?.startsWith("http") ? p.contactLink.url : undefined)],
    },
    {
      id: "presenca-digital",
      title: "PRESENÇA DIGITAL",
      items: [item("Site", p.site, facts.host, facts.url), item("Instagram", p.instagram, facts.instagram, facts.instagram), item("Facebook", p.facebook, facts.facebook, facts.facebook), item("Outros perfis", read && facts.otherProfiles?.length ? found(facts.otherProfiles.join(", "), facts.url) : unknown("somente o que a página linka"), facts.otherProfiles?.join(", ")), item("Listagem no Google", p.searchListing)],
    },
    {
      id: "informacoes",
      title: "INFORMAÇÕES",
      items: [item("Serviços citados", read && facts.services?.length ? found(facts.services.join(", "), facts.url) : absent("nenhum serviço declarado na página"), facts.services?.join(" · ")), item("Produtos citados", read && facts.products?.length ? found(facts.products.join(", "), facts.url) : absent("nenhum produto declarado na página"), facts.products?.join(" · ")), item("Conteúdo com data", p.recentContent, facts.lastContentDate)],
    },
    {
      id: "presenca-comercial",
      title: "PRESENÇA COMERCIAL",
      items: [item("Catálogo publicado", p.catalog), item("Venda online (e-commerce)", p.ecommerce), item("Atendimento por WhatsApp", p.whatsapp), item("Botão/link de pedido", read && /\bpe\W?dir\b|orcamento|comprar/i.test(facts.headings?.join(" ") || "") ? found("chamada de pedido em título de seção", facts.url) : absent("nenhuma chamada de compra na página"))],
    },
  ];
}

export function buildResearchRecord(facts: PageFacts, lead: { name: string; segment?: string }) {
  const signals = verifiedFacts(facts);
  const opportunities: string[] = [];
  const read = facts.fetchOk;
  // Sem leitura bem-sucedida a lista fica vazia: oportunidade exige fato encontrado,
  // e "não consegui ler" não é oportunidade nem diagnóstico.
  if (read) {
    if (facts.presence.catalog.state === "found" && facts.presence.ecommerce.state === "absent") opportunities.push("catálogo com pedido direto");
    if (facts.presence.catalog.state === "absent") opportunities.push("cardápio/catálogo digital");
    if (facts.presence.instagram.state === "found" && facts.presence.site.state === "absent") opportunities.push("presença digital própria além do Instagram");
    if (facts.presence.whatsapp.state === "found") opportunities.push("atendimento por WhatsApp organizado com histórico");
    if (facts.products?.length) opportunities.push("vitrine de produtos com orçamento");
  }
  return {
    researchedAt: facts.retrievedAt,
    facts,
    groups: factGroups(facts),
    signals,
    unverified: unverifiedFacts(facts),
    opportunities,
    summary: `${lead.name}${lead.segment ? ` · ${lead.segment}` : ""} — ${signals.length} fato(s) verificado(s) em ${facts.host}`,
    headline: `${lead.name}: ${facts.fetchOk ? `${signals.length} fato(s) verificado(s) em ${facts.host}` : `site em ${facts.host} não respondeu (${facts.httpStatus ? `HTTP ${facts.httpStatus}` : "sem conexão"})`}`,
  };
}
