/**
 * Pipeline PESQUISA → ANÁLISE → SCRIPT, testado sem rede: a leitura de página é uma
 * função pura sobre HTML (o mesmo código que o servidor executa), então os fixtures
 * abaixo exercitam o caminho real inteiro — inclusive a regra de nunca afirmar o que
 * não foi encontrado.
 *
 * Rodar com: pnpm test
 */
import { describe, expect, it } from "vitest";
import { buildResearchRecord, mergeFacts, parsePageFacts, unverifiedFacts, verifiedFacts } from "@shared/research";
import { formatPhoneBr, toWhatsAppNumber } from "@shared/normalize";
import { buildApproaches, contextFromLead, objectiveFor, pickApproachText, type Objective } from "@/approach";
import { evidenceScore, interpretLead } from "@/intelligence";
import { leadPatchFromResearch } from "@/researchApply";

const HOME_HTML = `<!doctype html><html><head><title>Padaria Pão Quente | Belém</title>
<meta name="description" content="Padaria artesanal no bairro da Cremação, com café e pão de fermentação natural.">
<meta property="og:updated_time" content="2026-05-11"></head>
<body><h1>Nosso cardápio</h1><h2>Encomendas para festas</h2>
<a href="tel:+5591999887766">(91) 99988-7766</a>
<a href="mailto:contato@paoquente.com.br">contato@paoquente.com.br</a>
<a href="https://instagram.com/paoquentebel">instagram</a>
<a href="https://wa.me/5591999887766">pedir pelo WhatsApp</a>
<a href="/contato">Fale conosco</a>
<script type="application/ld+json">{"@type":"Bakery","name":"Padaria Pão Quente","telephone":"+55 91 99988-7766","address":{"streetAddress":"Tv. Quintino Bocaiúra, 120","addressLocality":"Belém"},"hasOfferCatalog":{"name":"Pães"}}</script>
</body></html>`;
const CONTACT_HTML = `<html><body><h1>Contato</h1><a href="tel:+559130301212">(91) 3030-1212</a><p>Encomendas pelo site</p></body></html>`;
const URL = "https://paoquente.com.br";

const emptyLead = { name: "Padaria Pão Quente", segment: "Serviços", location: "Belém - PA", score: 62 };

describe("1. pesquisa devolve só o que a página tem, organizado por grupo", () => {
  const facts = parsePageFacts(HOME_HTML, URL);
  it("separa encontrado / não indicado / não verificado", () => {
    expect(facts.fetchOk).toBe(true);
    expect(facts.presence.site.state).toBe("found");
    expect(facts.presence.catalog.state).toBe("found");
    expect(facts.presence.whatsapp.state).toBe("found");
    expect(facts.presence.instagram.state).toBe("found");
    // nada sobre venda online na página: 'absent' (página lida) — não 'unknown'
    expect(facts.presence.ecommerce.state).toBe("absent");
    // buscador é a única coisa que nenhuma leitura de página pode responder
    expect(facts.presence.searchListing.state).toBe("unknown");
  });
  it("extrai contatos, descrição, endereço e data publicados", () => {
    expect(facts.phones.length).toBeGreaterThan(0);
    expect(facts.emails).toContain("contato@paoquente.com.br");
    expect(facts.description).toMatch(/Padaria artesanal/);
    expect(facts.address).toMatch(/Quintino Bocaiúra/);
    expect(facts.lastContentDate).toBe("2026-05-11");
    expect(facts.instagram).toBe("@paoquentebel");
  });
  it("o registro de pesquisa carrega evidência e fontes, sem texto inventado", () => {
    const record = buildResearchRecord(facts, emptyLead);
    expect(record.signals.length).toBeGreaterThan(0);
    expect(record.signals.every((s) => typeof s === "string" && s.length > 3)).toBe(true);
    expect(verifiedFacts(facts).length).toBe(record.signals.length);
    expect(unverifiedFacts(facts).join(" ")).toMatch(/venda online|buscador/);
  });
  it("sem leitura não devolve nenhuma oportunidade: afirmação exige fato encontrado", () => {
    const dead = buildResearchRecord(parsePageFacts("", "https://morto.example", { fetchOk: false }), { name: "Morta" });
    expect(dead.opportunities).toEqual([]);
    expect(dead.signals).toEqual([]);
    expect(dead.summary).toMatch(/0 fato\(s\) verificado\(s\)/);
    // e com leitura normal a oportunidade aparece
    expect(buildResearchRecord(facts, { name: "Padaria" }).opportunities.length).toBeGreaterThan(0);
  });
  it("organiza a resposta nos 5 grupos do fluxo", () => {
    const record = buildResearchRecord(facts, emptyLead);
    expect(record.groups.map((g) => g.title)).toEqual(["IDENTIFICAÇÃO", "CONTATO", "PRESENÇA DIGITAL", "INFORMAÇÕES", "PRESENÇA COMERCIAL"]);
    const contato = record.groups.find((g) => g.id === "contato")!;
    expect(contato.items.find((i) => i.label === "Telefone")?.state).toBe("found");
    expect(contato.items.find((i) => i.label === "Telefone")?.href).toBe("tel:+5591999887766");
    const comercial = record.groups.find((g) => g.id === "presenca-comercial")!;
    expect(comercial.items.find((i) => i.label === "Venda online (e-commerce)")?.state).toBe("absent");
    for (const group of record.groups) for (const entry of group.items) {
      expect(["found", "absent", "unknown"]).toContain(entry.state);
      expect(entry.value).toBeTruthy();
    }
  });
  it("site que não respondeu devolve os mesmos 5 grupos, todos 'não verificado'", () => {
    const dead = buildResearchRecord(parsePageFacts("", "https://morto.example", { fetchOk: false }), { name: "Morta" });
    expect(dead.groups.length).toBe(5);
    for (const group of dead.groups) for (const entry of group.items) expect(entry.state).toBe("unknown");
  });
  it("segunda página acrescenta telefone sem sobrescrever a primeira", () => {
    const merged = mergeFacts(facts, parsePageFacts(CONTACT_HTML, `${URL}/contato`, { pageLabel: "página de contato" }));
    expect(merged.pageTitle).toBe(facts.pageTitle);
    expect(merged.phones.length).toBeGreaterThan(facts.phones.length);
    expect(merged.description).toBe(facts.description);
  });
});

describe("2. dados pesquisados viram campos do lead sem destruir o cadastro", () => {
  const facts = parsePageFacts(HOME_HTML, URL);
  it("preenche apenas o que estava vazio", () => {
    const { patch, added, preserved } = leadPatchFromResearch({ phone: "91988799884" }, facts, "2026-09-13T00:00:00.000Z");
    expect(patch.phone).toBeUndefined();
    expect(preserved).toContain("telefone");
    expect(patch.email).toBe("contato@paoquente.com.br");
    expect(patch.instagram).toBe("@paoquentebel");
    expect(patch.address).toMatch(/Quintino/);
    expect(added).toEqual(expect.arrayContaining(["e-mail", "Instagram"]));
    expect(patch.researchedAt).toBe("2026-09-13T00:00:00.000Z");
  });
  it("guarda os fatos junto do lead, então a ficha não precisa reler o site", () => {
    const { patch } = leadPatchFromResearch({}, facts, "2026-09-13T00:00:00.000Z");
    expect(patch.facts?.host).toBe("paoquente.com.br");
    const revived = JSON.parse(JSON.stringify(patch));
    expect(revived.facts.presence.catalog.state).toBe("found");
    expect(revived.facts.url).toBe(URL);
  });
});

describe("3. site que não respondeu nunca vira afirmação de ausência", () => {
  const dead = parsePageFacts("", "https://dominio-morto.example", { fetchOk: false });
  it("toda a presença digital fica 'não verificado'", () => {
    expect(dead.fetchOk).toBe(false);
    for (const probe of Object.values(dead.presence)) expect(probe.state).toBe("unknown");
    expect(verifiedFacts(dead)).toEqual([]);
    expect(unverifiedFacts(dead).join(" ")).toMatch(/não pôde ser lido/);
  });
  it("a interpretação diz que não dá para afirmar nada", () => {
    const interpretation = interpretLead({ name: "Domínio Morto", segment: "Serviços" }, dead);
    expect(interpretation?.headline).toMatch(/não respondeu/);
    expect(interpretation?.headline).not.toMatch(/não (tem|possui|usam)/i);
    expect(interpretation?.opportunity).toMatch(/confirmar|verificar/i);
  });
  it("lead sem pesquisa nenhuma também não recebe alegação sobre o site dele", () => {
    const approaches = buildApproaches(contextFromLead({ ...emptyLead, phone: "91999887766" }));
    for (const a of approaches) {
      expect(a.text).not.toMatch(/voc[eê]s n[aã]o (t[eê]m|possuem|t[eê]m um site)/i);
      expect(a.text).not.toMatch(/n[aã]o (tem|possui) site/i);
      expect(a.text).not.toMatch(/desatualizad/i);
      expect(a.text).not.toMatch(/muitos (pedidos|clientes)/i);
    }
  });
});

describe("4. normalização mantém exibição amigável e forma canônica", () => {
  it("(91) 99999-9999 vira 5591999999999 sem perder a leitura humana", () => {
    expect(formatPhoneBr("(91) 99999-9999")).toBe("(91) 99999-9999");
    expect(toWhatsAppNumber("(91) 99999-9999")).toBe("5591999999999");
    expect(toWhatsAppNumber("5591999999999")).toBe("5591999999999");
    expect(toWhatsAppNumber("91988799884")).toBe("5591988799884");
    expect(formatPhoneBr("91988799884")).toBe("(91) 98879-9884");
  });
  it("o telefone achado na página é gravado no formato do app e exibido amigável", () => {
    const facts = parsePageFacts(HOME_HTML, URL);
    const { patch } = leadPatchFromResearch({}, facts);
    expect(patch.phone).toBe("91999887766");
    expect(formatPhoneBr(patch.phone)).toBe("(91) 99988-7766");
    expect(`https://wa.me/${toWhatsAppNumber(patch.phone)}`).toBe("https://wa.me/5591999887766");
  });
});

describe("5. score consome a pesquisa e mostra os motivos que usou", () => {
  const facts = parsePageFacts(HOME_HTML, URL);
  it("evidências somam e cada delta tem rótulo e origem", () => {
    const { base, score, deltas } = evidenceScore({ score: 62, site: "paoquente.com.br" }, facts);
    expect(score).toBeGreaterThan(base);
    expect(deltas.length).toBeGreaterThan(3);
    expect(deltas.reduce((sum, d) => sum + d.delta, 0)).toBe(score - base);
    expect(deltas.some((d) => /catálogo|vende online/i.test(d.label))).toBe(true);
    expect(deltas.every((d) => d.label.length > 3)).toBe(true);
  });
  it("o teto de evidência limita o efeito da pesquisa, sem esconder o motivo", () => {
    const { score, base } = evidenceScore({ score: 92, site: URL }, facts);
    expect(base + 18).toBeGreaterThanOrEqual(92);
    expect(score).toBeLessThanOrEqual(98);
  });
  it("sem pesquisa, score não recebe nenhum delta de evidência", () => {
    const { deltas } = evidenceScore({ score: 70 });
    expect(deltas).toEqual([]);
  });
  it("site que não respondeu derruba o score e diz por quê", () => {
    const dead = parsePageFacts("", "https://morto.example", { fetchOk: false });
    const { score, base, deltas } = evidenceScore({ score: 70, site: "morto.example" }, dead);
    expect(score).toBeLessThan(base);
    expect(deltas.some((d) => d.delta < 0 && /n[aã]o respondeu|fora do ar/i.test(d.label + (d.evidence ?? "")))).toBe(true);
  });
});

describe("6-9. abordagem usa só campos que existem, com 3 estilos e um objetivo", () => {
  const facts = parsePageFacts(HOME_HTML, URL);
  const interpretation = interpretLead({ name: "Padaria Pão Quente", segment: "Serviços" }, facts)!;
  const lead = {
    ...emptyLead,
    phone: "91999887766",
    site: "paoquente.com.br",
    instagram: "@paoquentebel",
    description: facts.description,
    facts,
    interpretation,
    status: "Novo",
  };
  const ctx = contextFromLead(lead);
  const forObjective = (objective: Objective) => buildApproaches({ ...ctx, objective });

  it("recebe o contexto rico do lead e o devolve falado em português", () => {
    expect(ctx.companyName).toBe("Padaria Pão Quente");
    expect(ctx.city).toMatch(/Bel[eé]m/);
    expect(ctx.instagram).toBe("@paoquentebel");
    expect(ctx.digitalPresence?.catalog.state).toBe("found");
    const text = forObjective("Catálogo digital")[2].text;
    expect(text).toContain("Padaria Pão Quente");
    expect(text).toContain("Belém");
    expect(text).toContain("@paoquentebel");
    expect(text).not.toMatch(/[{}$]|undefined|null/);
  });
  it("os 3 estilos partem do mesmo dado, mudando só a forma", () => {
    const styles = forObjective("Catálogo digital");
    expect(styles.map((s) => s.style)).toEqual(["Direta", "Consultiva", "Natural"]);
    expect(new Set(styles.map((s) => s.text)).size).toBe(3);
    for (const s of styles) expect(s.usedFacts).toEqual(styles[0].usedFacts);
    expect(styles[0].text.split(/[.!?]/).length).toBeLessThanOrEqual(styles[1].text.split(/[.!?]/).length);
  });
  it("objetivo escolhido muda o ângulo da oferta", () => {
    expect(forObjective("Catálogo digital")[0].text).toMatch(/catálogo online/i);
    expect(forObjective("Automação")[0].text).toMatch(/automatizar/i);
    expect(forObjective("Serviço recorrente")[0].text).toMatch(/agenda de visitas/i);
    expect(forObjective("E-commerce")[0].text).toMatch(/pedido online|estoque/i);
  });
  it("detecta o objetivo a partir da oportunidade encontrada", () => {
    expect(objectiveFor({ opportunity: "catálogo com pedido direto", facts })).toBe("Catálogo digital");
    expect(objectiveFor({ service: "Automação de WhatsApp" })).toBe("WhatsApp");
    expect(objectiveFor({ service: "Automação de ordens de serviço", facts })).toBe("Automação");
    expect(objectiveFor({})).toBe("Presença digital");
  });
  it("não usa dado que não existe: entra em skippedFacts, não no texto", () => {
    const bare = buildApproaches(contextFromLead({ name: "Empresa Sem Nada", segment: "Serviços", location: "Belém - PA", score: 50 }));
    for (const a of bare) {
      expect(a.skippedFacts).toEqual(expect.arrayContaining(["site (não cadastrado/não lido)", "Instagram (não verificado)", "produtos listados"]));
      expect(a.text).not.toMatch(/Instagram|catálogo|cardápio|produtos/i);
    }
  });
  it("site cadastrado mas nunca lido não vira afirmação sobre a página", () => {
    const bare = buildApproaches(contextFromLead({ ...emptyLead, site: "limaq.net", phone: "91988799884" }));
    for (const a of bare) {
      expect(a.text).not.toMatch(/dei uma olhada no site|vi no site|pelo que está no site/i);
      expect(a.skippedFacts.join(" ")).toMatch(/site cadastrado mas não lido/);
    }
  });
  it("diz 'catálogo', e só diz 'cardápio' quando a página fala em cardápio", () => {
    const withMenu = buildApproaches({ ...contextFromLead({ ...emptyLead, facts }), objective: "Catálogo digital" });
    expect(withMenu.some((a) => /cardápio/i.test(a.text))).toBe(true);
    expect(withMenu.every((a) => /catálogo online/i.test(a.text))).toBe(true);
      const noMenuFacts = { ...facts, presence: { ...facts.presence, catalog: { state: "found" as const, evidence: "menção a catálogo de produtos" } } };
    const noMenu = buildApproaches({ ...contextFromLead({ ...emptyLead, facts: noMenuFacts }), objective: "Catálogo digital" });
    expect(noMenu[0].text).toMatch(/catálogo/i);
    expect(noMenu.some((a) => /cardápio/i.test(a.text))).toBe(false);
  });
  it("não inventa quantidade de nada: nenhum número solto além do telefone", () => {
    for (const a of forObjective("Catálogo digital")) {
      const withoutPhone = a.text.replace(/\(\d{2}\) \d{4,5}-\d{4}/g, "");
      expect(withoutPhone).not.toMatch(/\d{2,}/);
    }
  });
  it("frases sempre começam em maiúscula e terminam com ponto", () => {
    for (const a of forObjective("Automação")) {
      expect(a.text).toMatch(/^[A-ZÁÀÂÉÊÍÓÔÕÚÇ]/);
      expect(a.text).toMatch(/[.!?]$/);
      expect(a.text).not.toMatch(/[.!?] [a-zà-ú]/);
    }
  });
});

describe("10. histórico de contato muda o enquadramento", () => {
  const base = { name: "Padaria Pão Quente", segment: "Serviços", location: "Belém - PA", score: 62, phone: "91999887766" };
  it("primeiro contato não fala de conversa anterior", () => {
    const text = buildApproaches(contextFromLead({ ...base, status: "Novo" }))[0].text;
    expect(text).toMatch(/Tudo bem\?|Oi, Padaria/i);
    expect(text).not.toMatch(/retomando|de novo|já conversamos/i);
  });
  it("lead que respondeu é tratado como continuação", () => {
    const text = buildApproaches(contextFromLead({ ...base, status: "Respondeu" }))[0].text;
    expect(text).toMatch(/Pegando o gancho do que vocês me responderam/i);
  });
  it("mensagem enviada vira follow-up com o tempo desde o contato", () => {
    const text = buildApproaches(contextFromLead({ ...base, status: "Mensagem enviada", events: [{ type: "Mensagem enviada", at: new Date(Date.now() - 4 * 864e5).toISOString() }] }))[0].text;
    expect(text).toMatch(/há 4 dias|Passando aqui de novo/i);
    expect(text).toMatch(/Sem pressa|não volto no assunto/i);
  });
  it("lead encerrado recebe texto sem oferta", () => {
    for (const a of buildApproaches(contextFromLead({ ...base, status: "Não agora" }))) {
      expect(a.contactState).toBe("encerrado");
      expect(a.text).toMatch(/sem oferta/i);
      expect(a.text).not.toMatch(/Consigo|posso montar/i);
    }
  });
});

describe("11-12. resultado editável, com precedência do rascunho e WhatsApp apontando para o texto final", () => {
  const facts = parsePageFacts(HOME_HTML, URL);
  const approaches = buildApproaches({ ...contextFromLead({ ...emptyLead, phone: "91999887766", site: "paoquente.com.br", facts }), objective: "Catálogo digital" });
  it("o texto editado pelo vendedor é o texto enviado", () => {
    const draft = "Fala, pessoal! Vi o cardápio de vocês no Instagram e montei um exemplo de página com o mesmo cardápio.";
    expect(pickApproachText(approaches, "Natural", draft)).toBe(draft);
  });
  it("sem edição, cada estilo devolve sua própria versão", () => {
    const natural = pickApproachText(approaches, "Natural");
    expect(natural).toBe(approaches.find((a) => a.style === "Natural")?.text);
    expect(pickApproachText(approaches, "Direta")).not.toBe(natural);
    expect(pickApproachText(approaches, "Direta")).toMatch(/\?\s|\?$/s);
  });
  it("edição em branco volta para o texto gerado", () => {
    expect(pickApproachText(approaches, "Natural", "   ")).toBe(approaches[2].text);
  });
  it("o link de WhatsApp usa o número canônico do lead", () => {
    const { patch } = leadPatchFromResearch({}, facts);
    expect(`https://wa.me/${toWhatsAppNumber(patch.phone)}?text=${encodeURIComponent(pickApproachText(approaches, "Natural"))}`).toMatch(/^https:\/\/wa\.me\/5591999887766\?text=/);
  });
});
