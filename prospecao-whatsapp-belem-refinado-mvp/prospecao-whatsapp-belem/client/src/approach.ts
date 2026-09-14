/**
 * gerador de abordagem — camada 3 (INTERPRETAÇÃO → TEXTO).
 *
 * Nada aqui consulta a internet nem inventa fato. O gerador recebe só o que já foi
 * verificado (lead + `PageFacts` da pesquisa) e monta a mensagem por sentenças: cada
 * sentença tem uma guarda, então uma frase sobre "catálogo", "WhatsApp", "Instagram" ou
 * "endereço" só nasce se aquele dado foi realmente encontrado. Ausência nunca vira
 * afirmação sobre a empresa — ausência só escolhe o assunto da mensagem.
 */
import type { PageFacts } from "@shared/research";
import { formatPhoneBr } from "@shared/normalize";

export type Objective = "Site" | "Landing page" | "Catálogo digital" | "E-commerce" | "Automação" | "WhatsApp" | "Presença digital" | "Serviço recorrente" | "Outro";

export const objectives: Objective[] = ["Site", "Landing page", "Catálogo digital", "E-commerce", "Automação", "WhatsApp", "Presença digital", "Serviço recorrente", "Outro"];

export type ContactState = "novo" | "enviado" | "respondeu" | "reunião" | "encerrado";

export type ApproachContext = {
  companyName: string;
  segment?: string;
  subsegment?: string;
  city?: string;
  website?: string;
  instagram?: string;
  whatsapp?: string;
  phone?: string;
  description?: string;
  products?: string[];
  services?: string[];
  digitalPresence?: PageFacts["presence"];
  detectedProblems?: string[];
  opportunity?: string;
  objective: Objective;
  score?: number;
  scoreReasons?: string[];
  notes?: string;
  facts?: PageFacts;
  contactHistory?: string[];
  stageStatus?: string;
  lastContactAt?: string;
};

export type GeneratedApproach = {
  style: "Direta" | "Consultiva" | "Natural";
  text: string;
  usedFacts: string[];
  skippedFacts: string[];
  contactState: ContactState;
  objective: Objective;
};

type Vocabulary = {
  /** entra depois de "ficar pensando em ..." */
  thinking: string;
  /** entra depois de "consigo ..." — é oferta, nunca diagnóstico deles */
  build: string;
  payoff: string;
  question: string;
};

/** O objetivo escolhido muda o que é oferecido, nunca o que é afirmado sobre a empresa. */
const VOCABULARY: Record<Objective, Vocabulary> = {
  Site: { thinking: "como o cliente de vocês acha a empresa no Google em vez de só por indicação", build: "colocar no ar uma página explicando o serviço e já com botão de contato", payoff: "quem procura encontra vocês primeiro", question: "como vocês querem ser encontrados hoje?" },
  "Landing page": { thinking: "como receber pedido sem depender do balcão", build: "publicar uma página curta só para captar pedido de orçamento", payoff: "chegar contato novo sem depender de indicação", question: "faria sentido testar uma página dessas por um mês?" },
  "Catálogo digital": { thinking: "como facilitar o acesso do cliente ao {{menu}} e aos pedidos", build: "montar um catálogo online que vocês mesmos atualizam", payoff: "mandar um link que atualiza sozinho em vez de foto no chat", question: "hoje vocês mandam foto ou já têm algo organizado?" },
  "E-commerce": { thinking: "como vender pelo próprio site sem comissão de marketplace", build: "abrir o pedido online com estoque e entrega resolvidos por vocês", payoff: "o cliente compra sem precisar de atendimento", question: "vocês já vendem por fora ou tudo passa pelo balcão?" },
  Automação: { thinking: "como não perder pedido entre o caderno e o grupo de WhatsApp", build: "automatizar aviso de status e registro de atendimento", payoff: "nada fica sem retorno no meio do caminho", question: "o que mais escapa hoje entre o pedido e a entrega?" },
  WhatsApp: { thinking: "como retomar quem perguntou e sumiu", build: "organizar as conversas com histórico por cliente", payoff: "o retorno não depende mais da memória de quem atende", question: "quem cuida do retorno quando a conversa fica para depois?" },
  "Presença digital": { thinking: "como o cliente conhece a marca antes de ligar", build: "reunir perfil, contatos e apresentação num lugar só", payoff: "a primeira impressão já chega organizada", question: "vocês têm alguém olhando isso hoje?" },
  "Serviço recorrente": { thinking: "como transformar cliente avulso em contrato que se renova", build: "montar agenda de visitas com lembrete de revisão", payoff: "vocês voltam antes do concorrente aparecer", question: "como vocês avisam o cliente que é hora de voltar?" },
  Outro: { thinking: "o que hoje trava a operação de vocês", build: "começar por um diagnóstico rápido do fluxo de contato", payoff: "saber onde o contato se perde antes de investir em ferramenta", question: "posso fazer duas perguntas sobre o processo de vocês?" },
};

/** Estágio do funil + histórico definem o enquadramento. Mandar texto de primeiro contato
 *  em lead já abordado é o erro mais comum — aqui é impossível por construção. */
export function contactStateOf(stageStatus?: string, history: string[] = []): ContactState {
  const stage = (stageStatus || "").trim();
  if (stage === "Respondeu" || stage === "Qualificado") return "respondeu";
  if (stage === "Reunião" || stage === "Proposta" || stage === "Negociação") return "reunião";
  if (stage === "Ganho" || stage === "Perdido" || stage === "Não agora") return "encerrado";
  const touched = history.some((entry) => /WhatsApp aberto|Mensagem enviada|Mensagem copiada|Contato realizado|Follow-up/i.test(entry));
  if (touched || stage === "Mensagem enviada" || stage === "Aguardando resposta" || stage === "Mensagem preparada") return "enviado";
  return "novo";
}

function daysSince(iso?: string) {
  if (!iso) return undefined;
  const at = new Date(iso).getTime();
  if (Number.isNaN(at)) return undefined;
  return Math.max(0, Math.round((Date.now() - at) / 86400000));
}

/** Nomes vindos de scraping/planilha trazem ruído ("Empresa | Página oficial"). */
function speakable(name: string) {
  return name
    .replace(/\s*(?:[|–—]|\s-\s)\s*[^|–—]*$/, "")
    .replace(/\s*\((?:matriz|filial)\s*\d*\)/i, "")
    .replace(/^(?:imobili|imove|empresa|loja)\s+$/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 48) || name.slice(0, 48);
}

/** "Umarizal, Belém" a partir de endereços e bairros já cadastrados. */
export function cityOf(location?: string) {
  if (!location) return undefined;
  const parts = location.split(/[·,]/).map((p) => p.trim()).filter(Boolean);
  if (!parts.length) return undefined;
  const isBelem = (p: string) => /bel[eé]m/i.test(p);
  const bairro = parts.find((p) => !isBelem(p) && !/^\s*(pa|par[aá])\s*$/i.test(p));
  if (parts.some(isBelem)) return bairro ? `${bairro.replace(/^(av|r|rua|tv|al)\.?\s+/i, "")}, Belém`.replace(/,\s*Belém, Belém/, ", Belém") : "Belém";
  return parts[0];
}

/** Objeto comercial sugerido a partir do que já existe no lead — a heurística continua no
 *  comando, agora explícita e escolhível pelo vendedor. */
export function objectiveFor(lead: { opportunity?: string; service?: string; pain?: string; segment?: string; facts?: PageFacts }): Objective {
  const text = `${lead.opportunity ?? ""} ${lead.service ?? ""} ${lead.pain ?? ""}`.toLowerCase();
  const facts = lead.facts;
  if (/e-?commerce|loja virtual|checkout|comprar/.test(text)) return "E-commerce";
  if (/cat[aá]logo|vitrine|mix de produtos|card[aá]pio/.test(text)) return "Catálogo digital";
  // "tirar orçamento" é captação, não cardápio: a oferta certa é a página de pedido
  if (/or[cç]amento|cota[cç]a|proposta/.test(text)) return "Landing page";
  if (/recorr|contrato|manuten|pmoc|agenda|visita|revis/.test(text)) return "Serviço recorrente";
  if (/whatsapp|follow|retorno|atendimento/.test(text)) return "WhatsApp";
  if (/automa|processo|crm|ordem de servi|sla|chamado|estoque|pedido/.test(text)) return "Automação";
  // nenhuma intenção explícita do vendedor? aí a evidência da página escolhe o ângulo
  if (facts?.fetchOk && facts.presence.catalog.state === "found" && facts.presence.ecommerce.state === "absent" && !/carrinho|loja virtual/.test(text)) return "Catálogo digital";
  if (/landing|capta/.test(text)) return "Landing page";
  if (/site|presen[çc]a digital|p[aá]gina/.test(text)) return "Site";
  if (facts && !facts.fetchOk) return "Site";
  if (facts?.presence.site.state === "absent") return "Site";
  return lead.segment === "Imobiliárias" ? "Landing page" : "Presença digital";
}

type Sentence = { text?: string; fact?: string };

/** Envio: o que está verificado vira frase; o que não está vira `skippedFacts` (auditoria). */
function observedSentence(ctx: ApproachContext): Sentence {
  const presence = ctx.digitalPresence;
  const facts = ctx.facts;
  const read = facts?.fetchOk;
  if (presence?.instagram.state === "found" && presence.catalog.state === "found") {
    return { text: `dá pra ver que vocês já mostram o que vendem${ctx.instagram ? ` pelo Instagram ${ctx.instagram}` : ""}`, fact: `Instagram ${ctx.instagram ?? "perfil oficial"} + catálogo/cardápio publicado` };
  }
  if (presence?.instagram.state === "found") {
    return { text: `vi que vocês já têm presença no Instagram${ctx.instagram ? ` (${ctx.instagram})` : ""}`, fact: `Instagram ${ctx.instagram ?? "perfil oficial"} linkado` };
  }
  if (presence?.facebook.state === "found") {
    return { text: "acompanhei a página de vocês no Facebook", fact: `Facebook: ${presence.facebook.evidence ?? "perfil linkado"}` };
  }
  if (read && presence?.catalog.state === "found") {
    return { text: "dei uma olhada no material que vocês já publicam", fact: presence.catalog.evidence };
  }
  if (ctx.website && !read) return { fact: undefined }; // site conhecido do cadastro, página nunca lida: nada a afirmar
  if (ctx.website) {
    const service = ctx.services?.[0];
    return { text: service ? `dei uma olhada no site de vocês e vi ${service}` : "dei uma olhada no site de vocês", fact: `site ${ctx.website}${service ? ` · serviço: ${service}` : ""}` };
  }
  if (ctx.description) return { text: `li a apresentação de vocês: “${ctx.description.slice(0, 110).trim()}”`, fact: "descrição pública da empresa" };
  if (ctx.services?.length) return { text: `vi que vocês trabalham com ${ctx.services.slice(0, 2).join(" e ")}`, fact: `serviços citados: ${ctx.services.slice(0, 2).join(", ")}` };
  if (ctx.products?.length) return { text: `vi os produtos de vocês (${ctx.products.slice(0, 3).join(", ")})`, fact: `produtos anunciados: ${ctx.products.slice(0, 3).join(", ")}` };
  if (ctx.subsegment) return { text: `vi que vocês atuam com ${ctx.subsegment}`, fact: `subsegmento: ${ctx.subsegment}` };
  return { fact: undefined };
}

function greeting(ctx: ApproachContext, state: ContactState) {
  const name = speakable(ctx.companyName);
  switch (state) {
    case "respondeu":
      return `Oi! Pegando o gancho do que vocês me responderam sobre a ${name}`;
    case "reunião":
      return `Oi! Sobre nossa conversa marcada a respeito da ${name}`;
    case "enviado": {
      const days = daysSince(ctx.lastContactAt);
      return days && days >= 2 ? `Oi, gente da ${name}! Te mandei uma mensagem há ${days} ${days === 1 ? "dia" : "dias"}` : `Oi, gente da ${name}! Passando aqui de novo`;
    }
    case "encerrado":
      return `Só um registro aqui, sem oferta`;
    default:
      return `Olá, pessoal da ${name}! Tudo bem?`;
  }
}

function findingSentence(ctx: ApproachContext): Sentence {
  const city = cityOf(ctx.city);
  const kind = ctx.subsegment || ctx.segment;
  if (city && kind) return { text: `Cheguei até vocês procurando ${kind} ${city.includes(",") ? `no ${city.split(",")[0]}` : `em ${city}`}`, fact: `busca local: ${kind} · ${city}` };
  if (city) return { text: `Conheci o trabalho de vocês pela região (${city})`, fact: `cidade: ${city}` };
  if (kind) return { text: `Cheguei até vocês procurando ${kind} na região`, fact: `segmento: ${kind}` };
  return {};
}

/** Dor heurística é hipótese de segmento, não diagnóstico da empresa: o texto diz "costuma". */
function problemSentence(ctx: ApproachContext): Sentence {
  const problem = ctx.detectedProblems?.[0];
  if (!problem) return {};
  const scope = ctx.subsegment || ctx.segment || "negócios como o de vocês";
  // ganho apontado pela leitura: a frase descreve a PÁGINA (que foi lida), nunca a empresa inteira
  const gain = /^possível ganho em (.+)$/i.exec(problem.trim());
  if (gain && ctx.facts?.fetchOk) {
    const area = gain[1].trim().replace(/\.$/, "");
    return { text: `Pelo que vi no site de vocês, ${area} não aparece — se já rola por outro canal, me diz`, fact: `${area} não indicado na página lida (${ctx.facts.host})` };
  }
  return { text: `De modo geral, em ${scope}, ${problem} é o que mais aparece`, fact: `dor provável (heurística, não confirmada): ${problem}` };
}

function noteSentence(ctx: ApproachContext): Sentence {
  const note = (ctx.notes || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean).pop();
  if (!note) return {};
  return { text: `Da última vez anotei aqui: ${note.replace(/^["“]|["”]$/g, "").slice(0, 90)}`, fact: `nota do vendedor: ${note.slice(0, 90)}` };
}

function join(parts: (string | Sentence | undefined)[]) {
  const sentences = parts
    .map((part) => (typeof part === "string" ? part : part?.text))
    .filter((p): p is string => Boolean(p && p.trim()))
    // trecho nosso que termina sem pontuação ganha ponto; texto do lead não é editado aqui
    .map((s) => (/[.!?…]$/.test(s.trim()) ? s.trim() : `${s.trim()}.`))
    .join(" ");
  // maiúscula no começo de frase vale para o QUE NÓS ESCREVEMOS. Span entre aspas é texto do
  // site do lead (descrição, nota, heading): sai, é capitalizado em volta, e volta igual.
  const quoted: string[] = [];
  return sentences
    .replace(/(["“][^"”\n]+[”"])/g, (m) => {
      quoted.push(m);
      return `\u0000${quoted.length - 1}\u0000`;
    })
    .replace(/(^|[.!?]\s)([a-zà-ú])/g, (_m, sep, ch) => `${sep}${ch.toUpperCase()}`)
    .replace(/\u0000(\d+)\u0000/g, (_m, i) => quoted[Number(i)] ?? "");
}

export function buildApproaches(ctx: ApproachContext): GeneratedApproach[] {
  const state = contactStateOf(ctx.stageStatus, ctx.contactHistory);
  const objective = ctx.objective || "Outro";
  const rawVocab = VOCABULARY[objective];
  const observed = observedSentence(ctx);
  const finding = findingSentence(ctx);
  const problem = problemSentence(ctx);
  const note = noteSentence(ctx);

  const usedFacts = [observed, finding, problem, note].flatMap((s) => (s.fact ? [s.fact] : []));
  const skippedFacts: string[] = [];
  if (!ctx.website) skippedFacts.push("site (não cadastrado/não lido)");
  if (!ctx.instagram) skippedFacts.push("Instagram (não verificado)");
  if (ctx.website && !ctx.facts?.fetchOk) skippedFacts.push("site cadastrado mas não lido (nada afirmado sobre a página)");
  if (!ctx.description && !ctx.facts?.description) skippedFacts.push("descrição da empresa");
  if (!ctx.services?.length) skippedFacts.push("serviços listados");
  if (!ctx.products?.length) skippedFacts.push("produtos listados");
  if (!note.text) skippedFacts.push("notas do vendedor");
  if (!problem.text) skippedFacts.push("dor provável");

  // "cardápio" é palavra de comida; sem evidência disso na página, o certo é "catálogo"
  const menuWord = /card[aá]pio/i.test(`${ctx.facts?.presence.catalog.evidence ?? ""} ${ctx.opportunity ?? ""} ${ctx.description ?? ""}`) ? "cardápio" : "catálogo";
  const vocab = { ...rawVocab, thinking: rawVocab.thinking.replace("{{menu}}", menuWord), build: rawVocab.build.replace("{{menu}}", menuWord), payoff: rawVocab.payoff.replace("{{menu}}", menuWord), question: rawVocab.question.replace("{{menu}}", menuWord) };
  const offer = `Consigo ${vocab.build}`;
  const softAsk = ctx.phone ? `Se preferir, responde aqui ou no ${formatPhoneBr(ctx.phone)}.` : "Se preferir, responde por aqui.";

  if (state === "encerrado") {
    const text = `${greeting(ctx, state)}. Lead encerrado no funil — se a abordagem for reaberta, escolha outro estágio e o texto é gerado de novo com o contexto atual.`;
    return [
      { style: "Direta", text, usedFacts, skippedFacts, contactState: state, objective },
      { style: "Consultiva", text, usedFacts, skippedFacts, contactState: state, objective },
      { style: "Natural", text, usedFacts, skippedFacts, contactState: state, objective },
    ];
  }

  const direct = join([
    state === "novo" ? `Oi, ${speakable(ctx.companyName)}!` : greeting(ctx, state),
    observed.text ? observed : finding,
    `${offer} — ${vocab.payoff}`,
    state === "enviado" ? "Sem pressa, só não queria deixar o assunto pendurado" : vocab.question,
    softAsk,
  ]);

  const consultive = join([
    greeting(ctx, state),
    finding,
    observed,
    problem,
    `É por isso que a conversa faz sentido: ${vocab.thinking}. ${offer}, ${vocab.payoff}`,
    state === "enviado" ? `Se já tiverem resolvido isso, me diz e eu não volto no assunto. ${softAsk}` : `${softAsk}`,
  ]);

  const natural = join([
    greeting(ctx, state),
    finding,
    observed,
    note,
    `Fiquei pensando em ${vocab.thinking}`,
    `Sem querer virar mais um oferecendo sistema, ${offer.toLowerCase()}${state === "novo" ? ", se é que isso ajuda vocês agora" : ", retomando o que já conversamos"}`,
    `Se fizer sentido troco duas ideias rápidas; se não, agradeço a atenção mesmo assim. ${vocab.question}`,
  ]);

  return [
    { style: "Direta", text: direct, usedFacts, skippedFacts, contactState: state, objective },
    { style: "Consultiva", text: consultive, usedFacts, skippedFacts, contactState: state, objective },
    { style: "Natural", text: natural, usedFacts, skippedFacts, contactState: state, objective },
  ];
}

/** Reconstrói o contexto do gerador a partir do lead + da pesquisa salva. Ponto único da
 *  regra "só usa campo que existe" — usado pela ficha, pelo Playbook e pelo WhatsApp. */
export function contextFromLead(lead: {
  name: string;
  segment?: string;
  location?: string;
  phone?: string;
  site?: string;
  instagram?: string;
  description?: string;
  notes?: string;
  pain?: string;
  opportunity?: string;
  service?: string;
  score?: number;
  status?: string;
  intelligence?: { subsegment?: string; probablePains?: string[]; scoreReasons?: string[] };
  events?: { type: string; at: string }[];
  facts?: PageFacts;
  objective?: Objective;
  interpretation?: { opportunity?: string; detectedProblems?: string[] };
}): ApproachContext {
  const events = lead.events || [];
  const lastContact = [...events].reverse().find((e) => /Contato realizado|WhatsApp aberto|Mensagem enviada/i.test(e.type)) || events[events.length - 1];
  return {
    companyName: lead.name,
    segment: lead.segment,
    subsegment: lead.intelligence?.subsegment,
    city: lead.location,
    website: lead.site || (lead.facts?.fetchOk ? lead.facts.url : undefined),
    instagram: lead.instagram,
    phone: lead.phone,
    whatsapp: lead.phone,
    description: lead.description || lead.facts?.description,
    services: lead.facts?.services,
    products: lead.facts?.products,
    digitalPresence: lead.facts?.presence,
    // o que a leitura produziu tem precedência sobre a heurística de cadastro
    detectedProblems: lead.interpretation?.detectedProblems?.length ? lead.interpretation.detectedProblems : lead.intelligence?.probablePains,
    opportunity: lead.interpretation?.opportunity ?? lead.opportunity,
    objective: lead.objective || objectiveFor({ opportunity: lead.opportunity, service: lead.service, pain: lead.pain, segment: lead.segment, facts: lead.facts }),
    score: lead.score,
    scoreReasons: lead.intelligence?.scoreReasons,
    notes: lead.notes,
    facts: lead.facts,
    contactHistory: events.map((e) => e.type),
    stageStatus: lead.status,
    lastContactAt: lastContact?.at,
  };
}
/**
 * Texto final a enviar: o rascunho editado pelo vendedor sempre vence o texto gerado,
 * mas só para o estilo escolhido — trocar de estilo nunca apaga a edição do outro.
 */
export function pickApproachText(approaches: GeneratedApproach[], style: GeneratedApproach["style"], draft?: string): string {
  if (draft && draft.trim()) return draft.trim();
  return approaches.find((a) => a.style === style)?.text ?? approaches[0]?.text ?? "";
}
