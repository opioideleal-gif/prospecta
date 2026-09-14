import { unverifiedFacts, verifiedFacts, type PageFacts, type Probe } from "@shared/research";

export type SignalCategory = "Presença digital" | "Automação" | "CRM" | "Sistemas" | "B2B / E-commerce" | "Operação" | "Marketing";

export type CommercialEvent = {
  id: string;
  type: string;
  at: string;
  note?: string;
};

export type NextAction = "abordar" | "follow-up" | "responder" | "qualificar" | "agendar" | "enviar proposta" | "reativar" | "encerrar";

export type Intelligence = {
  subsegment: string;
  businessModel: string;
  observedSignals: string[];
  probablePains: string[];
  opportunities: string[];
  recommendedServices: string[];
  confidence: number;
  scoreReasons: string[];
  nextAction: NextAction;
  nextActionAt?: string;
};

export const subsegments: Record<string, string[]> = {
  Serviços: ["assistência técnica", "manutenção", "refrigeração e climatização", "engenharia", "instalação", "energia solar", "segurança eletrônica", "telecom", "facilities", "limpeza", "automação", "consultoria"],
  Imobiliárias: ["vendas", "locação", "administração", "lançamentos", "imóveis comerciais", "imóveis residenciais"],
  Distribuidoras: ["materiais", "construção", "alimentos", "bebidas", "peças", "atacado", "B2B", "fornecedores especializados"],
  Outros: ["empresa local"],
};

function inferSubsegment(lead: { segment: string; name: string; pain?: string; opportunity?: string }) {
  const text = `${lead.name} ${lead.pain ?? ""} ${lead.opportunity ?? ""}`.toLowerCase();
  const rules: Array<[string, string[]]> = [
    ["refrigeração e climatização", ["refrig", "clima", "pmoc", "ar condicionado"]],
    ["construção", ["construção", "material", "compensado", "obra"]],
    ["engenharia", ["engenharia", "obra", "laudo", "solar"]],
    ["administração", ["administra", "locação", "aluguel"]],
    ["vendas", ["venda", "imóve"]],
    ["atacado", ["distrib", "estoque", "pedido"]],
    ["manutenção", ["manuten", "chamado", "assistência"]],
  ];
  return rules.find(([, terms]) => terms.some((term) => text.includes(term)))?.[0] ?? subsegments[lead.segment]?.[0] ?? "empresa local";
}

export function analyzeLead(lead: { segment: string; name: string; pain?: string; opportunity?: string; site?: string; email?: string; phone?: string; score?: number; facts?: PageFacts }): Intelligence {
  const text = `${lead.name} ${lead.pain ?? ""} ${lead.opportunity ?? ""}`.toLowerCase();
  const subsegment = inferSubsegment(lead);
  const signals: string[] = [];
  if (lead.site) signals.push("presença digital / site identificado");
  if (lead.email) signals.push("canal de e-mail comercial disponível");
  if (lead.phone) signals.push("canal de WhatsApp ou telefone disponível");
  if (/manuten|chamado|equipe|contrato|agenda|pmoc/.test(text)) signals.push("operação técnica e recorrente");
  if (/estoque|pedido|catálogo|produto|cotação|materiais/.test(text)) signals.push("mix de produtos, estoque ou cotação");
  if (/lead|imóve|locação|visita|propriet/.test(text)) signals.push("captação ou acompanhamento de oportunidades");
  const facts = lead.facts;
  if (facts?.fetchOk) {
    if (facts.presence.catalog.state === "found") signals.push(`catálogo/cardápio publicado (${facts.presence.catalog.evidence ?? facts.host})`);
    if (facts.presence.ecommerce.state === "found") signals.push("venda online já estruturada no site");
    if (facts.presence.whatsapp.state === "found") signals.push("atendimento por WhatsApp confirmado no site");
    if (facts.phones?.length) signals.push(`${facts.phones.length} telefone(s) público(s) no site`);
    if (facts.address) signals.push("endereço físico publicado");
  }
  if (!signals.length) signals.push("segmento e oportunidade comercial informados");

  let pains: string[];
  let opportunities: string[];
  let services: string[];
  if (lead.segment === "Distribuidoras") {
    pains = ["cotação e pedido manual", "visibilidade de estoque e recompra"];
    opportunities = ["catálogo B2B", "orçamento e pedidos com histórico"];
    services = ["catálogo B2B + orçamento + pedidos", "CRM de clientes recorrentes"];
  } else if (lead.segment === "Imobiliárias") {
    pains = ["leads dispersos entre canais", "follow-up de visitas e propostas"];
    opportunities = ["CRM imobiliário", "pipeline de visitas, propostas e locação"];
    services = ["pipeline + follow-up + agenda", "portal do proprietário"];
  } else {
    pains = [lead.pain || "controle operacional e retorno ao cliente", "agenda, equipe e histórico de atendimento"];
    opportunities = ["gestão de serviços", "automação de atendimento e follow-up"];
    services = ["agenda + ordem de serviço + contratos", "CRM de atendimento técnico"];
  }

  const reasons: string[] = [];
  if (lead.phone) reasons.push("contato disponível");
  if (lead.site || lead.email) reasons.push("sinal digital verificável");
  if (signals.length >= 2) reasons.push("mais de um sinal observado");
  if (/recorr|manuten|contrato|estoque|lead/.test(text)) reasons.push("operação com potencial de recorrência");
  if (!reasons.length) reasons.push("aderência inicial pelo segmento");
  const score = Math.max(35, Math.min(98, lead.score ?? 60));
  return { subsegment, businessModel: lead.segment === "Imobiliárias" ? "B2C/B2B com ciclo de venda e recorrência" : lead.segment === "Distribuidoras" ? "B2B com catálogo, cotação e recompra" : "serviços B2B com operação recorrente", observedSignals: signals, probablePains: pains, opportunities, recommendedServices: services, confidence: Math.min(96, Math.max(52, score - 2)), scoreReasons: reasons, nextAction: "abordar" };
}

export function scoreLabel(score: number) { return score >= 85 ? "Alta prioridade" : score >= 70 ? "Boa oportunidade" : "Investigar"; }

export function formatDate(value?: string) { return value ? new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" }).format(new Date(value)) : "sem data"; }


/* ==========================================================================
   DADOS ENCONTRADOS  →  INTERPRETAÇÃO COMERCIAL
   Estas duas funções são a fronteira pedida: `interpretLead` só traduz fatos
   verificados; `evidenceScore` só ajusta score com evidência e devolve o peso
   de cada ajuste. Nenhuma das duas afirma ausência como fato da empresa.
   ========================================================================== */

export type ScoreDelta = { label: string; delta: number; evidence?: string };

export type Interpretation = {
  headline: string;
  opportunity: string;
  detectedProblems: string[];
  factsUsed: string[];
  unverified: string[];
  confidence: number;
  researchedAt?: string;
};

const stateLabel = (probe?: Probe) => (probe?.state === "found" ? "identificado" : probe?.state === "absent" ? "não identificado" : "não verificado");

export function interpretLead(lead: { name: string; segment?: string; city?: string }, facts?: PageFacts): Interpretation | undefined {
  if (!facts) return undefined;
  const subject = (lead.city || lead.segment || "").trim();
  const who = `${subject ? `${subject} — ` : ""}`;
  if (!facts.fetchOk) {
    return {
      headline: `${who}site em ${facts.host} não respondeu (HTTP ${facts.httpStatus ?? "sem resposta"}) — nenhuma afirmação sobre a presença digital pode ser feita.`,
      opportunity: "confirmar o endereço do site antes de abordar",
      detectedProblems: [],
      factsUsed: [],
      unverified: unverifiedFacts(facts),
      confidence: 40,
      researchedAt: facts.retrievedAt,
    };
  }
  const has = (probe?: Probe) => probe?.state === "found";
  const parts: string[] = [];
  if (has(facts.presence.instagram)) parts.push(`presença no Instagram${lead.name ? ` (${facts.instagram ?? "perfil linkado"})` : ""}`);
  if (has(facts.presence.catalog)) parts.push("catálogo ou cardápio publicado");
  if (has(facts.presence.ecommerce)) parts.push("venda online já no site");
  if (has(facts.presence.whatsapp)) parts.push("atendimento por WhatsApp no site");
  if (facts.phones?.length) parts.push(`${facts.phones.length} telefone(s) público(s)`);
  if (facts.address) parts.push("endereço publicado");
  const missing: string[] = [];
  if (!has(facts.presence.catalog)) missing.push("catálogo online");
  if (!has(facts.presence.ecommerce)) missing.push("venda online");
  if (!has(facts.presence.recentContent)) missing.push("frequência de atualização");

  const opportunity = !has(facts.presence.ecommerce) && has(facts.presence.catalog)
    ? "catálogo com pedido direto"
    : has(facts.presence.catalog)
      ? "melhorar o catálogo que já existe"
      : !has(facts.presence.instagram)
        ? "presença digital própria além do Google"
        : "aproveitar o tráfego que já existe no Instagram";

  return {
    headline: `${who}${parts.length ? parts.join(", ") : "site institucional sem elementos comerciais identificáveis"}${missing.length ? `, porém sem ${missing.join(" e sem ")}` : ""}.`,
    opportunity,
    detectedProblems: missing.map((m) => `possível ganho em ${m}`),
    factsUsed: verifiedFacts(facts),
    unverified: unverifiedFacts(facts),
    confidence: Math.min(94, 55 + Math.min(30, parts.length * 6) + (facts.services?.length ? 4 : 0) + (facts.description ? 5 : 0)),
    researchedAt: facts.retrievedAt,
  };
}

/** Score heurístico + ajustes por evidência. Cada ajuste diz de onde veio, então o
 *  "por quê" mostrado na tela é literalmente o cálculo. */
export function evidenceScore(lead: { score?: number; scoreBase?: number; phone?: string; email?: string; site?: string; pain?: string }, facts?: PageFacts) {
  // A base é o score ANTES de qualquer evidência: reler o site recomputa os mesmos deltas
  // em vez de somar os antigos de novo (sem isso, cada clique em "Reler" inflamava o score).
  const base = Math.max(35, Math.min(98, lead.scoreBase ?? lead.score ?? 60));
  const deltas: ScoreDelta[] = [];
  const push = (label: string, delta: number, evidence?: string) => { if (delta !== 0) deltas.push({ label, delta, evidence }); };

  if (!facts) {
    if (lead.phone) push("contato disponível", 0);
    return { base, score: base, deltas };
  }
  if (!facts.fetchOk) {
    push("site não respondeu — não dá para qualificar", -6, `HTTP ${facts.httpStatus ?? "sem resposta"}`);
    return { base, score: Math.max(35, Math.min(98, base - 6)), deltas };
  }
  const has = (probe?: Probe) => probe?.state === "found";
  if (has(facts.presence.whatsapp)) push("WhatsApp no site: canal de resposta imediato", 6);
  if (has(facts.presence.instagram)) push("Instagram verificado: audiência que já existe", 5);
  if (has(facts.presence.catalog) && !has(facts.presence.ecommerce)) push("mostra o produto mas não vende online", 9, facts.presence.catalog.evidence);
  if (has(facts.presence.ecommerce)) push("e-commerce ativo: ticket recorrente", 4);
  if (facts.address) push("endereço físico publicado", 4);
  if ((facts.phones?.length ?? 0) > 0 && !lead.phone) push(`telefone encontrado na pesquisa (${facts.phones![0]})`, 7);
  if (facts.description) push("autodescrição clara no site", 3);
  if ((facts.services?.length ?? 0) >= 2) push(`${facts.services!.length} serviços declarados`, 5);
  if (has(facts.presence.recentContent)) push("conteúdo com data visível no site", 3);
  if (!facts.description && !facts.services?.length) push("site com pouco conteúdo para qualificar", -4);
  if (/^a investigar$/i.test(lead.pain || "")) push("dor ainda não documentada", -3);
  // Os motivos exibidos SÃO o cálculo: se a soma estourar o teto de evidência, os deltas
  // exibidos são reescalados junto (e o ajuste final vai no maior termo), então a lista
  // sempre bate com a diferença aplicada no score.
  const CAP = 18;
  const raw = deltas.reduce((sum, d) => sum + d.delta, 0);
  const applied = deltas.map((d) => ({ ...d }));
  if (Math.abs(raw) > CAP) {
    const factor = CAP / Math.abs(raw);
    for (const d of applied) d.delta = Math.round(d.delta * factor);
    const drift = (raw > 0 ? CAP : -CAP) - applied.reduce((sum, d) => sum + d.delta, 0);
    if (drift !== 0 && applied.length) {
      const idx = applied.reduce((best, d, i) => (Math.abs(d.delta) > Math.abs(applied[best].delta) ? i : best), 0);
      applied[idx] = { ...applied[idx], label: `${applied[idx].label} (limitado por teto de evidência)`, delta: applied[idx].delta + drift };
    }
  }
  const score = Math.max(35, Math.min(98, base + applied.reduce((sum, d) => sum + d.delta, 0)));
  return { base, score, deltas: applied };
}

export function scoreReasonLines(deltas: ScoreDelta[], reasons: string[]) {
  const lines = deltas.filter((d) => d.delta !== 0).map((d) => `${d.delta > 0 ? "+" : ""}${d.delta} ${d.label}${d.evidence ? ` · ${d.evidence}` : ""}`);
  return { lines, base: reasons };
}

export { stateLabel };
