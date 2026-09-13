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

export function analyzeLead(lead: { segment: string; name: string; pain?: string; opportunity?: string; site?: string; email?: string; phone?: string; score?: number }): Intelligence {
  const text = `${lead.name} ${lead.pain ?? ""} ${lead.opportunity ?? ""}`.toLowerCase();
  const subsegment = inferSubsegment(lead);
  const signals: string[] = [];
  if (lead.site) signals.push("presença digital / site identificado");
  if (lead.email) signals.push("canal de e-mail comercial disponível");
  if (lead.phone) signals.push("canal de WhatsApp ou telefone disponível");
  if (/manuten|chamado|equipe|contrato|agenda|pmoc/.test(text)) signals.push("operação técnica e recorrente");
  if (/estoque|pedido|catálogo|produto|cotação|materiais/.test(text)) signals.push("mix de produtos, estoque ou cotação");
  if (/lead|imóve|locação|visita|propriet/.test(text)) signals.push("captação ou acompanhamento de oportunidades");
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
