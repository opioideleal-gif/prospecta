/**
 * Pipeline PESQUISA → ANÁLISE → SCRIPT, testado sem rede: a leitura de página é uma
 * função pura sobre HTML (o mesmo código que o servidor executa), então os fixtures
 * abaixo exercitam o caminho real inteiro — inclusive a regra de nunca afirmar o que
 * não foi encontrado.
 *
 * Rodar com: pnpm test
 */
import { describe, expect, it } from "vitest";
import { buildResearchRecord, mergeFacts, parsePageFacts, unverifiedFacts, verifiedFacts, withSearchListing } from "@shared/research";
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

// clínica odontológica: catálogo ausente, mas a palavra "cardápio" aparece na string que prova
// a AUSÊNCIA — a escolha de vocabulário não pode ler ali.
const Clinic_HTML = `<html><head><title>Clínica Vida Belém | Odontologia</title><meta name="description" content="Clínica odontológica em Batista Campos. Limpeza, clareamento e aparelho." /></head><body><h1>Clínica Vida Belém</h1><h2>Nossos tratamentos</h2><a href="https://instagram.com/clinicavidabelem">@clinicavidabelem</a><a href="https://wa.me/5591999990000">Fale pelo WhatsApp</a><p>Ligue: (91) 3222-1100</p><p>Rua Gaspar Viana 123, Batista Campos — Belém/PA</p></body></html>`;

describe("1. pesquisa devolve só o que a página tem, organizado por grupo", () => {
  const facts = parsePageFacts(HOME_HTML, URL);
  it("a segunda página é opcional: ler só a home não quebra nem inventa", () => {
    const home = parsePageFacts(HOME_HTML, URL);
    expect(mergeFacts(home)).toEqual(home); // sem /contato lida, os fatos ficam exatamente como estão
    const contact = parsePageFacts(CONTACT_HTML, `${URL}/contato`, { pageLabel: "página de contato" });
    const merged = mergeFacts(home, contact);
    expect(merged.phones.length).toBeGreaterThanOrEqual(contact.phones.length);
    expect(merged.checkedOtherUrl).toBe(`${URL}/contato`);
  });

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

const WP_HTML = `<html><head><title>Refrigeração Norte | Belém</title></head><body>
<header><nav><a href="/">Início</a><a>Menu</a><a href="/servicos">Serviços</a><a href="/contato">Contato</a></nav></header>
<h2>Instalação de ar condicionado split</h2><h2>Manutenção preventiva</h2>
<footer><a href="tel:+559132415566">(91) 3241-5566</a><a href="https://api.whatsapp.com/send?phone=5591999990000&text=Ol%C3%A1"><i class="icon-whatsapp"></i></a>
<p>CNPJ 11.222.333/0001-44 · CEP 66053-190</p></footer></body></html>`;
const STORE_HTML = `<html><head><title>Loja Aurora</title></head><body>
<div class="nsapp-product-list"><a href="/produto/camiseta-polo">Camiseta Polo</a><span>R$ 89,90</span>
<button class="ns-product-add-to-cart">Adicionar à sacola</button></div>
<footer>Checkout seguro · Nuvemshop · pagamento via Mercado Pago</footer></body></html>`;
const BIO_HTML = `<html><head><title>Açaí do Belém</title><meta property="og:description" content="Peça pelo direct ou pelo link abaixo."></head>
<body><h1>Açaí do Belém</h1><a href="https://instagram.com/acaidobelem">@acaidobelem</a><a href="https://wa.link/9f2k1a">Pedir agora</a></body></html>`;
const SPA_HTML = `<html><head><title>Studio Cordel</title></head><body><div id="__next"></div>
<script id="__NEXT_DATA__" type="application/json">{"props":{"pageProps":{"contact":{"phone":"+55 91 98123-4567","whatsapp":"5591981234567"},"catalog":[{"name":"Ensaio externo"},{"name":"Book impresso"}]}}}</script>
</body></html>`;

describe("1b. o parser encara as formas reais de site (WordPress, Nuvemshop, bio de Instagram, SPA)", () => {
  const wp = parsePageFacts(WP_HTML, "https://nortear.com.br");
  it("“Menu” da navegação não é catálogo — senão todo site ganharia o gancho errado", () => {
    expect(wp.presence.catalog.state).toBe("absent");
    expect(wp.presence.ecommerce.state).toBe("absent");
    // e a oportunidade certa (mostrar o que vende) continua disponível
    expect(buildResearchRecord(wp, { name: "Refrigeração Norte" }).opportunities).toContain("cardápio/catálogo digital");
  });
  it("reconhece api.whatsapp.com/send?phone= e guarda o link como evidência", () => {
    expect(wp.presence.whatsapp.state).toBe("found");
    expect(wp.presence.whatsapp.evidence).toMatch(/api\.whatsapp\.com\/send/);
  });
  it("não confunde CNPJ e CEP com telefone", () => {
    expect(wp.phones).toEqual(["559132415566"]);
    expect(wp.phones.every((n) => /^55\d{10,11}$/.test(n))).toBe(true);
  });
  it("loja com preço e add-to-cart é lida como catálogo + venda online", () => {
    const loja = parsePageFacts(STORE_HTML, "https://lojaaurora.com.br");
    expect(loja.presence.catalog.state).toBe("found");
    expect(loja.presence.ecommerce.state).toBe("found");
    const interpretation = interpretLead({ name: "Loja Aurora", segment: "Distribuidoras" }, loja)!;
    expect(interpretation.headline).toMatch(/venda online já no site/);
    expect(interpretation.detectedProblems.join(" ")).not.toMatch(/venda online/);
  });
  it("landing que só existe no Instagram não gera mensagem com número inventado", () => {
    const bio = parsePageFacts(BIO_HTML, "https://acaidobelem.page");
    expect(bio.presence.instagram.state).toBe("found");
    expect(bio.presence.whatsapp.state).toBe("found");
    expect(bio.phones).toEqual([]);
    const merged = { name: "Açaí do Belém", segment: "Serviços", location: "Belém - PA", phone: "", score: 60, facts: bio };
    const text = buildApproaches(contextFromLead(merged as never))[0].text;
    expect(text).toMatch(/responde por aqui/);
    expect(text).not.toMatch(/wa\.me|Pedir agora|link de pedido/i); // CTA da página não vira dado do lead
  });
  it("telefone guardado no JSON do SPA entra na análise (e a mensagem só usa o que foi lido)", () => {
    const spa = parsePageFacts(SPA_HTML, "https://studiocordel.com");
    expect(spa.phones).toEqual(["5591981234567"]);
    expect(spa.presence.whatsapp.state).toBe("found");
    const { patch } = leadPatchFromResearch({ phone: "" }, spa);
    expect(patch.phone).toBe("91981234567");
    expect(`https://wa.me/${toWhatsAppNumber(patch.phone)}`).toBe("https://wa.me/5591981234567");
  });
});

describe("2a. achar um contato que faltava conta no score, e conta uma vez só", () => {
  const wpFacts = parsePageFacts(WP_HTML, "https://nortear.com.br");
  it("o mérito é medido contra o lead antes do patch, não depois", () => {
    const before = { score: 60, site: "nortear.com.br", pain: "A investigar" };
    const after = { ...before, phone: "9132415566" };
    expect(evidenceScore(after, wpFacts).deltas.some((d) => /telefone encontrado/.test(d.label))).toBe(false);
    const scored = evidenceScore(after, wpFacts, before);
    expect(scored.deltas.some((d) => /telefone encontrado na pesquisa \(559132415566\)/.test(d.label))).toBe(true);
    expect(scored.deltas.filter((d) => /telefone encontrado/.test(d.label))).toHaveLength(1);
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

describe("4b. vir da caça prova listagem em buscador — e só a caça prova isso", () => {
  const page = parsePageFacts(HOME_HTML, URL);
  it("parsear página nunca afirma presença no buscador", () => {
    expect(page.presence.searchListing.state).toBe("unknown");
    expect(unverifiedFacts(page)).toContain("presença em buscador não verificada");
  });
  it("a busca pública marca o item como verificado, com evidência e fonte", () => {
    const hunted = withSearchListing(page, 'empresa encontrada em Bing HTML público para “padaria Belém”', "https://bing.com/search?q=padaria");
    expect(hunted.presence.searchListing.state).toBe("found");
    expect(unverifiedFacts(hunted)).not.toContain("presença em buscador não verificada");
    expect(hunted.presence.site.state).toBe(page.presence.site.state); // nada mais foi tocado
    const sparse = withSearchListing(parsePageFacts(`<html><head><title>Sozinha</title><meta name="description" content="Página curta de teste."></head><body><h2>Serviços</h2><h2>Vendas</h2></body></html>`, URL), "empresa encontrada em Bing HTML público para “padaria Belém”", "https://bing.com/search?q=padaria");
    const scored = evidenceScore({ score: 60, site: "paoquente.com.br" }, sparse);
    const delta = scored.deltas.find((d) => /listagem em buscador/.test(d.label));
    expect(delta?.delta).toBe(2);
    expect(delta?.evidence).toMatch(/Bing HTML público/);
    // quando o teto de evidência morder, o delta listado continua sendo o aplicado
    const crowded = evidenceScore({ score: 60, site: "paoquente.com.br" }, hunted);
    expect(crowded.deltas.reduce((sum, d) => sum + d.delta, 0)).toBe(crowded.score - crowded.base);
    expect(crowded.deltas.some((d) => /listagem em buscador/.test(d.label))).toBe(true);
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
  it("reler o site não infla o score: a base é o score antes da evidência", () => {
    const first = evidenceScore({ score: 62, site: "paoquente.com.br" }, facts);
    expect(first.score).toBeGreaterThan(first.base);
    // segundo clique em "Reler" parte da mesma base → mesmo resultado, não 62→80→98
    const again = evidenceScore({ score: first.score, scoreBase: first.base, site: "paoquente.com.br" }, facts);
    expect(again.score).toBe(first.score);
    expect(again.base).toBe(first.base);
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
    // o que ficou de fora é o mesmo nos 3 (mesmo contexto, mesma checagem)...
    for (const s of styles) expect(s.skippedFacts).toEqual(styles[0].skippedFacts);
    // ...e o "usa:" de cada estilo lista só o que AQUELE texto diz, senão a auditoria minte
    for (const s of styles) expect(s.usedFacts.join(" ")).toMatch(/Instagram @paoquentebel/);
    const withNote = buildApproaches({ ...ctx, objective: "Catálogo digital", notes: "pediu retorno depois do feriado" });
    expect(withNote[2].usedFacts.join(" ")).toMatch(/nota do vendedor/); // Natural retoma a anotação
    expect(withNote[2].text).toMatch(/Da última vez anotei aqui/);
    expect(withNote[0].usedFacts.join(" ")).not.toMatch(/nota do vendedor/); // a Direta não cita
    expect(withNote[0].text).not.toMatch(/Da última vez anotei aqui/);
    expect(styles[0].skippedFacts).toContain("notas do vendedor"); // sem nota, ela entra na lista de ausências
    expect(styles[0].text.split(/[.!?]/).length).toBeLessThanOrEqual(styles[1].text.split(/[.!?]/).length);
  });
  it("lead encerrado não lista fato nenhum como se tivesse sido usado", () => {
    const closed = buildApproaches({ ...ctx, stageStatus: "Ganho" });
    expect(closed).toHaveLength(3);
    for (const a of closed) {
      expect(a.usedFacts).toEqual([]);
      expect(a.text).toMatch(/encerrado/i);
      expect(a.text).not.toMatch(/@paoquentebel|catálogo|WhatsApp/i);
    }
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
  it("diz 'cardápio' só quando a página fala em cardápio, e 'catálogo' no resto", () => {
    const withMenu = buildApproaches({ ...contextFromLead({ ...emptyLead, facts }), objective: "Catálogo digital" });
    expect(withMenu.some((a) => /cardápio/i.test(a.text))).toBe(true); // HOME_HTML tem <h1>Nosso cardápio</h1>
    expect(withMenu.every((a) => /catálogo online/i.test(a.text))).toBe(true); // a oferta continua "catálogo online"
    // página de clínica: nada de cardápio em lugar nenhum, nem como prova de ausência
    const clinicFacts = parsePageFacts(Clinic_HTML, "https://clinicavidabelem.com.br", { httpStatus: 200, pageLabel: "página inicial" });
    for (const facts2 of [clinicFacts, { ...clinicFacts, presence: { ...clinicFacts.presence, catalog: { state: "found" as const, evidence: "lista de materiais: “catálogo técnico”" } } }]) {
      const clinic = buildApproaches({ ...contextFromLead({ ...emptyLead, name: "Clínica Vida", facts: facts2 }), objective: "Catálogo digital" });
      for (const a of clinic) {
        expect(a.text).not.toMatch(/cardápio/i);
        expect(a.text).toMatch(/catálogo/i);
      }
    }
  });
  it("não inventa quantidade de nada: nenhum número solto além do telefone", () => {
    for (const a of forObjective("Catálogo digital")) {
      const withoutPhone = a.text.replace(/\(\d{2}\) \d{4,5}-\d{4}/g, "");
      expect(withoutPhone).not.toMatch(/\d{2,}/);
    }
  });
  it("o ganho apontado pela leitura entra na mensagem falando do site, não da empresa", () => {
    const researched = { ...emptyLead, phone: "91999887766", site: "paoquente.com.br", instagram: "@paoquentebel", facts, interpretation: interpretLead({ name: "Padaria Pão Quente", segment: "Serviços" }, facts) };
    const list = buildApproaches({ ...contextFromLead(researched), objective: "E-commerce" });
    const withGain = list.filter((a) => /Pelo que vi no site/i.test(a.text));
    expect(withGain.length).toBeGreaterThan(0);
    for (const a of withGain) {
      // a frase afirma apenas sobre a página lida e oferece correção se já existir
      expect(a.text).toMatch(/Pelo que vi no site de vocês/);
      expect(a.text).toMatch(/me diz/);
      expect(a.text).not.toMatch(/voc[eê]s n[aã]o t[eê]m|nunca tiveram|não vendem/i);
      expect(a.usedFacts.join(" ")).toMatch(/não indicado na página lida/);
    }
  });
  it("sem leitura a dor continua heurística e rotulada como hipótese", () => {
    const bare = buildApproaches(contextFromLead({ ...emptyLead, intelligence: { probablePains: ["perder chamado entre o WhatsApp e a planilha"], subsegment: "manutenção" } }));
    const hit = bare.find((a) => /De modo geral/.test(a.text));
    expect(hit?.usedFacts.join(" ")).toMatch(/heurística, não confirmada/);
  });
  it("não reescreve texto citado do site do lead ao ajustar maiúsculas", () => {
    const quote = "atendemos das 7h às 18h. pedidos por whatsapp e balcão";
    const quoted = buildApproaches({ companyName: "Padaria Pão Quente", segment: "Serviços", city: "Belém - PA", objective: "Catálogo digital", description: quote });
    const withQuote = quoted.filter((a) => a.text.includes("atendemos das 7h"));
    expect(withQuote.length).toBeGreaterThan(0);
    for (const a of withQuote) {
      expect(a.text).toContain(`“${quote}”.`); // o "p" minúsculo dentro da citação fica como está na fonte
      expect(a.text).toMatch(/[.!?] [A-ZÀ-Ú]/); // e a frase NOSSA, que vem depois, começa em maiúscula
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
