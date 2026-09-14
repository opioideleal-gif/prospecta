/**
 * Sinais do lead para a composição do card.
 *
 * Existe uma distinção que o design não pode apagar: um dado pode estar
 *   found    → visto na página, com evidência
 *   inferred → leitura heurística do cadastro (interpretação, não fato)
 *   listed   → está cadastrado no lead, mas ninguém foi olhar a página
 *   absent   → a página foi lida e aquilo não está lá
 *
 * As quatro situações viram quatro estados visuais. Tratar `listed`/`absent`/`unknown`
 * como se fossem a mesma coisa é o que faria a interface mentir sobre a empresa.
 */
import type { PageFacts } from "@shared/research";

export type SignalState = "found" | "inferred" | "listed" | "absent";
export type SignalKey = "phone" | "site" | "catalog" | "whatsapp" | "instagram";
export type Signal = { key: SignalKey; label: string; state: SignalState; detail: string };

/** `read` separa o que foi lido do que apenas existe no cadastro. */
export type SignalSource = {
  phone?: string;
  site?: string;
  instagram?: string;
  email?: string;
  facts?: PageFacts;
  /** dor/opinião do vendedor: heurística, nunca fato da empresa */
  notes?: string;
};

const LABELS: Record<SignalKey, string> = {
  phone: "PHONE",
  site: "SITE",
  catalog: "MENU",
  whatsapp: "WHATSAPP",
  instagram: "INSTAGRAM",
};

function probe(facts: PageFacts | undefined, key: "site" | "catalog" | "whatsapp" | "instagram") {
  if (!facts?.fetchOk) return undefined;
  return facts.presence[key]?.state;
}

export function signalsOf(lead: SignalSource): Signal[] {
  const facts = lead.facts;
  const read = Boolean(facts?.fetchOk);
  const out: Signal[] = [];

  // PHONE: o número cadastrado é fato sobre o cadastro; o número visto no site é fato sobre a empresa
  const phoneFromSite = read ? (facts?.phones?.length ?? 0) > 0 : false;
  if (phoneFromSite) out.push({ key: "phone", label: LABELS.phone, state: "found", detail: `${facts!.phones?.length ?? 0} número(s) público(s) na página` });
  else if (lead.phone) out.push({ key: "phone", label: LABELS.phone, state: "listed", detail: read ? "cadastrado por você, não visto na página" : "cadastrado por você, página não lida" });
  else if (read) out.push({ key: "phone", label: LABELS.phone, state: "absent", detail: "a página lida não expõe telefone" });

  // SITE
  if (read) out.push({ key: "site", label: LABELS.site, state: facts!.presence.site.state === "found" ? "found" : facts!.presence.site.state === "absent" ? "absent" : "listed", detail: facts!.presence.site.evidence ?? (read ? facts!.host : "") });
  else if (lead.site) out.push({ key: "site", label: LABELS.site, state: "listed", detail: `${lead.site} · ainda não lido` });

  // MENU / catálogo — ausência só existe depois de ler
  const catalog = probe(facts, "catalog");
  if (catalog === "found") out.push({ key: "catalog", label: LABELS.catalog, state: "found", detail: facts!.presence.catalog.evidence ?? "catálogo publicado" });
  else if (catalog === "absent") out.push({ key: "catalog", label: LABELS.catalog, state: "absent", detail: "lido e não encontrado" });

  // WHATSAPP
  const wa = probe(facts, "whatsapp");
  if (wa === "found") out.push({ key: "whatsapp", label: LABELS.whatsapp, state: "found", detail: facts!.presence.whatsapp.evidence ?? "canal no site" });
  else if (wa === "absent") out.push({ key: "whatsapp", label: LABELS.whatsapp, state: "absent", detail: "lido e não encontrado" });

  // INSTAGRAM
  const ig = probe(facts, "instagram");
  if (ig === "found") out.push({ key: "instagram", label: LABELS.instagram, state: "found", detail: facts!.presence.instagram.evidence ?? "perfil linkado" });
  else if (lead.instagram) out.push({ key: "instagram", label: LABELS.instagram, state: "listed", detail: read ? "cadastrado por você" : "perfil declarado no cadastro" });
  else if (ig === "absent") out.push({ key: "instagram", label: LABELS.instagram, state: "absent", detail: "lido e não encontrado" });

  return out;
}

/** Contagem exibida no card: quantas coisas o sistema REALMENTE sabe sobre a empresa. */
export function countSignals(signals: Signal[]) {
  return {
    found: signals.filter((s) => s.state === "found").length,
    inferred: signals.filter((s) => s.state === "inferred").length,
    absent: signals.filter((s) => s.state === "absent").length,
    listed: signals.filter((s) => s.state === "listed").length,
  };
}

/**
 * Peso do card. PRIMARY não é gosto estético: é o lead que tem evidência suficiente para
 * valer a atenção agora (lido + oportunidade identificada + score alto) ou que o vendedor
 * marcou. O resto vira SECONDARY/UTILITY e a lista ganha ritmo sem esconder ninguém.
 */
export function cardTier(lead: { score: number; facts?: PageFacts; interpretation?: { opportunity?: string }; starred?: boolean; status?: string }, index: number): "primary" | "secondary" | "utility" {
  if (lead.starred) return "primary";
  const evidence = Boolean(lead.facts?.fetchOk) && Boolean(lead.interpretation?.opportunity);
  const hot = lead.score >= 85;
  if (index === 0 && (evidence || hot)) return "primary";
  if (evidence || hot || lead.score >= 78) return "secondary";
  return "utility";
}
