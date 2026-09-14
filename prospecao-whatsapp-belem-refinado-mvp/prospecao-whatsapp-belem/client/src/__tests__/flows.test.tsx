// @vitest-environment happy-dom
/**
 * Testes de fluxo do Prospecta.
 *
 * Cobrem exatamente o que a ferramenta promete ao vendedor: navegar entre as 6
 * abas, ler/filtrar a base, abrir a ficha da empresa, registrar contato,
 * observação, mover estágio, agendar follow-up e ver tudo sobreviver a um reload.
 *
 * Rodar com: pnpm test  (nenhum acesso à rede é necessário)
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Home from "@/pages/Home";
import { parsePageFacts } from "@shared/research";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLElement;
let root: Root;

async function render() {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root.render(<Home />));
}
async function unmount() {
  await act(async () => root.unmount());
  host.remove();
}
const q = (sel: string) => host.querySelector(sel) as HTMLElement | null;
const qa = (sel: string) => Array.from(host.querySelectorAll(sel)) as HTMLElement[];
const byText = (sel: string, label: string) =>
  qa(sel).find((el) => (el.textContent || "").trim().startsWith(label)) as HTMLElement | undefined;
const text = () => host.textContent || "";

async function click(el: Element | null | undefined) {
  if (!el) throw new Error("elemento não encontrado para clicar");
  await act(async () => {
    el.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
  });
}
async function setInput(el: Element | null, value: string) {
  if (!el) throw new Error(`input não encontrado (${value})`);
  await act(async () => {
    const proto = el.constructor.prototype as object;
    const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    setter?.call(el, value);
    el.dispatchEvent(new window.Event("input", { bubbles: true }));
    el.dispatchEvent(new window.Event("change", { bubbles: true }));
  });
}
async function tab(name: string) {
  await click(byText(".side-nav .nav-item", name));
}
async function openDetail(leadName: string) {
  await tab("Leads");
  await setInput(q(".search-field input"), leadName);
  await click(q(".lead-card .more-button"));
}

beforeEach(async () => {
  localStorage.clear();
  vi.stubGlobal("open", vi.fn());
  window.open = vi.fn() as unknown as typeof window.open;
  await render();
});
afterEach(async () => {
  await unmount();
  vi.unstubAllGlobals();
});

describe("base de leads preservada", () => {
  it("carrega as 157 empresas da base congelada", async () => {
    await tab("Leads");
    expect(text()).toContain("de 157");
    expect(qa(".lead-card").length).toBeGreaterThan(100);
  });
  it("mantém os dados de contato originais no card", async () => {
    await tab("Leads");
    expect(text()).toContain("91988799884");
    expect(text()).toContain("Limaq");
  });
  it("preserva as 3 abordagens do playbook", async () => {
    await tab("Playbook");
    for (const kind of ["Direta", "Consultiva", "Natural"]) expect(text()).toContain(kind);
    expect(text()).toContain("Primeiro contato");
    expect(text()).toContain("Qualificação");
  });
});

describe("navegação entre as 6 abas", () => {
  it("alterna hoje, caçar, resultados, leads, oportunidades e playbook", async () => {
    const routes: Array<[string, string]> = [
      ["Hoje", "Saiba o que fazer"],
      ["Caçar Leads", "Caçar"],
      ["Resultados", "Canais que"],
      ["Leads", "Empresas para trabalhar"],
      ["Oportunidades", "Onde existe"],
      ["Playbook", "Mensagens que abrem"],
    ];
    for (const [name, marker] of routes) {
      await tab(name);
      expect(text(), `aba ${name}`).toContain(marker);
      expect(q(".nav-item.active")?.textContent).toContain(name);
    }
  });
});

describe("filtros", () => {
  beforeEach(async () => {
    await tab("Leads");
  });
  it("busca por texto reduz a lista", async () => {
    const before = qa(".lead-card").length;
    await setInput(q(".search-field input"), "refrigera");
    expect(qa(".lead-card").length).toBeLessThan(before);
    expect(qa(".lead-card").length).toBeGreaterThan(0);
  });
  it("filtra por segmento e por prioridade", async () => {
    await click(byText(".filter-pills .filter-pill", "Imobiliárias"));
    expect(qa(".lead-card").length).toBeGreaterThan(0);
    expect(qa(".lead-meta").every((el) => (el.textContent || "").includes("Imobiliárias"))).toBe(true);
    await setInput(qa(".select-field select")[0], "Alta");
    expect(qa(".priority")).toHaveLength(qa(".lead-card").length);
  });
  it("filtra por estágio do funil na faixa de pipeline", async () => {
    await setInput(qa(".select-field select")[1], "Reunião");
    expect(text()).toContain("1 filtro");
    expect(qa(".lead-card").length).toBe(0);
    await click(byText(".filters-extra .outline-button", "Limpar filtros"));
    expect(qa(".lead-card").length).toBeGreaterThan(100);
  });
  it("ordena por nome sem perder leads", async () => {
    const total = qa(".lead-card").length;
    await setInput(qa(".select-field select")[3], "nome");
    const names = qa(".lead-card h3").slice(0, 3).map((el) => el.textContent || "");
    expect(qa(".lead-card").length).toBe(total);
    expect([...names].sort((a, b) => a.localeCompare(b, "pt-BR"))).toEqual(names);
  });
});

describe("ficha do lead (lead detail)", () => {
  it("mostra os dados existentes sem inventar nada", async () => {
    await openDetail("Limaq");
    const modal = q(".lead-detail");
    expect(modal).toBeTruthy();
    expect(modal?.querySelector("h2")?.textContent).toBe("Limaq");
    expect(text()).toContain("91988799884");
    expect(text()).toContain("limaq.net");
    expect(text()).toContain("contato@limaq.net");
    expect(text()).toContain("Jurunas · Belém");
    expect(text()).toContain("Motivos do score");
    expect(text()).toContain("abordar empresa");
    expect(text()).toContain("ABORDAGEM CONTEXTUAL");
    expect(text()).toContain("OBSERVADO");
    expect(text()).toContain("RECOMENDADO");
    expect(text()).toContain("contato disponível");
  });
  it("marca campos ausentes como não cadastrados", async () => {
    await openDetail("Tito Materiais");
    expect(text()).toContain("não cadastrado");
    expect(qa(".contact-grid strong.missing").length).toBeGreaterThan(0);
  });
  it("liga telefone, whatsapp, site e e-mail como links", async () => {
    await openDetail("Limaq");
    const hrefs = qa(".contact-grid a").map((a) => a.getAttribute("href") || "");
    expect(hrefs.some((h) => h.startsWith("tel:+5591988799884"))).toBe(true);
    expect(hrefs.some((h) => h === "https://wa.me/5591988799884")).toBe(true);
    expect(hrefs.some((h) => h.startsWith("https://limaq.net"))).toBe(true);
    expect(hrefs.some((h) => h.startsWith("mailto:contato@limaq.net"))).toBe(true);
  });
  it("fecha com Escape", async () => {
    await openDetail("Limaq");
    expect(q(".lead-detail")).toBeTruthy();
    await act(async () => {
      window.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(q(".lead-detail")).toBeNull();
  });
});

describe("ações rápidas", () => {
  beforeEach(async () => {
    await openDetail("Limaq");
  });

  it("abre o WhatsApp e registra o evento no histórico", async () => {
    await click(byText(".detail-actions .whatsapp-button", "Abrir WhatsApp"));
    expect(window.open).toHaveBeenCalled();
    await act(async () => new Promise((r) => setTimeout(r, 0)));
    expect(text()).toContain("WhatsApp aberto");
  });
  it("registra contato realizado e avança estágio inicial", async () => {
    expect(text()).toContain("Novo");
    await click(byText(".detail-actions .outline-button", "Contato realizado"));
    expect(text()).toContain("Contato realizado");
    expect(q(".stage-now .status-pill")?.textContent).toBe("Mensagem enviada");
  });
  it("move estágio para frente e para trás", async () => {
    await click(q(".stage-stepper .step-button:last-child"));
    expect(q(".stage-now .status-pill")?.textContent).toBe("Pronto para abordagem");
    await click(q(".stage-stepper .step-button:first-child"));
    expect(q(".stage-now .status-pill")?.textContent).toBe("Novo");
  });
  it("adiciona observação nas notas e no histórico", async () => {
    const input = q(".note-add input");
    await setInput(input, "Sócio decide sozinho");
    await click(q(".note-add button"));
    expect((q(".notes-box textarea") as HTMLTextAreaElement)?.value).toContain("Sócio decide sozinho");
    expect(text()).toContain("Observação");
  });
  it("agenda follow-up pelos atalhos e pela data", async () => {
    await click(byText(".followup-actions button", "7 dias"));
    expect(text()).toContain("Follow-up agendado");
    expect(text()).toMatch(/em 7d|amanhã|hoje/);
  });
  it("gera abordagem e marca mensagem enviada", async () => {
    await click(byText(".detail-actions .dark-action", "Gerar abordagem"));
    expect(text()).toContain("ABORDAGEM CONTEXTUAL");
    await click(byText(".detail-actions .outline-button", "Marcar enviada"));
    expect(q(".stage-now .status-pill")?.textContent).toBe("Mensagem enviada");
  });
});

describe("persistência", () => {
  it("grava leads, status e follow-ups no localStorage e sobrevive a reload", async () => {
    await tab("Leads");
    await openDetail("Limaq");
    await click(q(".stage-stepper .step-button:last-child"));
    await click(byText(".followup-actions button", "Amanhã"));
    const savedLeads = JSON.parse(localStorage.getItem("prospecta-leads-v2") || "[]");
    const savedStatuses = JSON.parse(localStorage.getItem("prospecta-statuses-v2") || "{}");
    expect(savedLeads.find((l: { id: string }) => l.id === "limaq").nextActionAt).toBeTruthy();
    expect(savedStatuses.limaq).toBe("Pronto para abordagem");

    await unmount();
    await render();
    await tab("Leads");
    await setInput(q(".search-field input"), "Limaq");
    expect(text()).toContain("Pronto para abordagem");
    expect(text()).toContain("amanhã");
  });
  it("mantém lead criado manualmente após reload", async () => {
    await tab("Leads");
    await click(byText(".heading-actions .dark-action", "Nova empresa"));
    const inputs = qa(".lead-form .form-grid input");
    await setInput(inputs[0], "Teste Arquivo Ltda");
    await setInput(inputs[1], "91999990000");
    await act(async () => { q(".lead-form")?.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true })); });
    expect(text()).toContain("Teste Arquivo Ltda");
    await unmount();
    await render();
    await tab("Leads");
    await setInput(q(".search-field input"), "Teste Arquivo");
    expect(qa(".lead-card").length).toBe(1);
  });
});

describe("ações no card e funil", () => {
  it("muda status direto no card e reflete na faixa do funil", async () => {
    await tab("Leads");
    await setInput(q(".search-field input"), "Limaq");
    await setInput(q(".lead-card .status-select select"), "Qualificado");
    expect(q(".stage-chip.selected b")?.textContent || q(".pipeline-strip")?.textContent).toBeTruthy();
    expect(JSON.parse(localStorage.getItem("prospecta-statuses-v2") || "{}").limaq).toBe("Qualificado");
  });
  it("não abre link quebrado quando o lead não tem telefone", async () => {
    await tab("Leads");
    await setInput(q(".search-field input"), "Imobiliária Abdelnor");
    expect(qa(".lead-card").length).toBe(1);
    expect(q(".lead-card .whatsapp-button")).toBeNull();
    expect(byText(".lead-card .outline-button", "Copiar")).toBeTruthy();
    await click(byText(".lead-card .outline-button", "Copiar"));
    expect(window.open).not.toHaveBeenCalled();
    expect(text()).toContain("Lead sem telefone");
  });
  it("importa CSV, remove duplicados e mantém os leads anteriores", async () => {
    await tab("Leads");
    const before = qa(".lead-card").length;
    const csv = "empresa;telefone;segmento;site;local\nPadaria Teste;91988887777;Imobiliárias;padariateste.com.br;Marco\nLimaq;91988799884;Serviços;limaq.net;Jurunas\nSem Telefone;;;\n";
    const input = q('.lead-card, .toolbar-section input[type="file"]') as HTMLInputElement | null;
    expect(input).toBeTruthy();
    const file = new window.File([csv], "leads.csv", { type: "text/csv" });
    await act(async () => {
      Object.defineProperty(input, "files", { value: [file], configurable: true });
      input!.dispatchEvent(new window.Event("change", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 60));
    });
    expect(text()).toContain("Padaria Teste");
    expect(text()).toMatch(/1 importadas · 1 duplicadas · 1 incompletas/);
    expect(qa(".lead-card").length).toBe(before + 1);
    await unmount();
    await render();
    await tab("Leads");
    await setInput(q(".search-field input"), "Padaria Teste");
    expect(qa(".lead-card").length).toBe(1);
    expect(text()).toContain("Imobiliárias");
  });
  it("conclui follow-up sem alterar o estágio do funil", async () => {
    await openDetail("Limaq");
    await click(byText(".followup-actions button", "Amanhã"));
    expect(text()).toContain("Follow-up agendado");
    await click(byText(".fu-foot .fu-done", "Concluir follow-up"));
    expect(text()).toContain("Follow-up concluído");
    expect(q(".stage-now .status-pill")?.textContent).toBe("Novo");
    expect(text()).toContain("sem follow-up");
    expect(JSON.parse(localStorage.getItem("prospecta-leads-v2") || "[]").find((l: { id: string }) => l.id === "limaq").nextActionAt).toBeFalsy();
    expect(JSON.parse(localStorage.getItem("prospecta-statuses-v2") || "{}").limaq).toBeUndefined();
  });
  it("exporta a seleção atual em CSV com separador compatível com a importação", async () => {
    const blobs: Blob[] = [];
    const original = window.URL.createObjectURL;
    window.URL.createObjectURL = ((blob: Blob) => { blobs.push(blob); return "blob:prospecta"; }) as typeof window.URL.createObjectURL;
    await click(byText(".side-nav .nav-item", "Leads"));
    await setInput(q(".search-field input"), "Limaq");
    await click(byText(".heading-actions .outline-button", "Exportar CSV"));
    window.URL.createObjectURL = original;
    expect(blobs).toHaveLength(1);
    const csv = await blobs[0].text();
    const [header, row] = csv.replace(/^\uFEFF/, "").split("\n");
    expect(header.split(";").slice(0, 4)).toEqual(["empresa", "segmento", "subsegmento", "telefone"]);
    expect(row).toContain("Limaq");
    expect(row).toContain("91988799884");
    expect(row).toContain("limaq.net");
  });
  it("mostra a confiança de cada resultado da caça e leva à carteira após importar", async () => {
    const payload = {
      query: "imobiliárias Belém",
      provider: "Bing HTML público",
      results: [
        { id: "hunt-1", name: "Imobiliária Alfa", phone: "91991112233", whatsapp: "91991112233", site: "alfa-imoveis.com.br", segment: "imobiliárias", location: "Belém", score: 88, opportunity: "Captação por bairro", sourceUrl: "https://alfa-imoveis.com.br", sourceTitle: "Imobiliária Alfa", confidence: "alta" },
        { id: "hunt-2", name: "Beta Logística", phone: "91993334455", site: undefined, segment: "distribuidora", location: "Belém", score: 62, opportunity: "Investigar oferta", sourceUrl: "https://beta.example", sourceTitle: "Beta Logística", confidence: "média" },
      ],
    };
    vi.stubGlobal("fetch", vi.fn(async () => ({ json: async () => payload, ok: true, status: 200 })));
    await tab("Caçar Leads");
    await click(q(".hunt-form button"));
    await act(async () => new Promise((resolve) => setTimeout(resolve, 30)));
    vi.unstubAllGlobals();

    expect(qa(".hunt-card")).toHaveLength(2);
    expect(byText(".hunt-card .confidence", "confiança alta")).toBeTruthy();
    expect(byText(".hunt-card .confidence", "confiança média")).toBeTruthy();
    expect(text()).toContain("2 novas");
    // regra nova: nada entra selecionado sozinho — o vendedor marca empresa por empresa
    expect(text()).toContain("Adicionar selecionadas (0)");
    await click(qa(".hunt-card input[type=\"checkbox\"]")[0]);
    await click(qa(".hunt-card input[type=\"checkbox\"]")[1]);
    expect(text()).toContain("Adicionar selecionadas (2)");

    await click(q(".hunt-cta .dark-action"));
    expect(text()).toContain("Ver 2 na carteira");
    expect(JSON.parse(localStorage.getItem("prospecta-leads-v2") || "[]").some((l: { name: string }) => l.name === "Imobiliária Alfa")).toBe(true);
    await click(byText(".hunt-cta .outline-button", "Ver 2 na carteira"));
    expect(q(".nav-item.active")?.textContent).toContain("Leads");
  });
  it("usa as inferências heurísticas na oportunidade", async () => {
    await tab("Oportunidades");
    expect(text()).toContain("Dor provável");
    expect(text()).toContain("Serviço sugerido");
    await click(byText(".view-switch button", "Em aberto"));
    expect(qa(".opportunity-row").length).toBeGreaterThan(0);
    await click(byText(".view-switch button", "Encerradas"));
    expect(text()).toContain("Nada nesta visão");
  });
});

/** fixture HTML lido pelo MESMO parser que roda no servidor */
const SITE_HTML = `<html><head><title>Imóveis Belém</title><meta name="description" content="Corretora com apartamentos na Duque de Caxias."></head>
<body><a href="https://instagram.com/imoveisbelem_oficial">insta</a><a href="tel:+5591984772865">(91) 98477-2865</a><a href="/contato">contato</a></body></html>`;
const HUNT_RESULT = { id: "h1", name: "Refrigeração Exemplo", phone: "91999990000", whatsapp: "91999990000", site: "exemplo.com.br", segment: "refrigeração", location: "Belém", score: 78, opportunity: "catálogo com pedido direto", sourceUrl: "https://exemplo.com.br", sourceTitle: "site da empresa", confidence: "alta" };

function stubRoutes(routes: Record<string, unknown>) {
  const spy = vi.fn(async (input: unknown) => {
    const url = String(typeof input === "string" ? input : (input as { url: string }).url);
    const match = Object.entries(routes).find(([key]) => url.includes(key));
    if (!match) throw new Error(`rota não stubada: ${url}`);
    return { ok: true, status: 200, json: async () => match[1] } as unknown as Response;
  });
  vi.stubGlobal("fetch", spy);
  return spy;
}

describe("caça com ações por empresa (nada entra sozinho)", () => {
  it("mantém a seleção vazia, oferece as 3 ações e adiciona uma por uma", async () => {
    stubRoutes({ "/api/hunt-leads": { results: [HUNT_RESULT] }, "/api/research": { record: { lastResearchAt: "2026-09-13T00:00:00.000Z", researchHash: "abc", sources: [], signals: [], opportunities: [], facts: parsePageFacts(SITE_HTML, "https://exemplo.com.br") } } });
    await tab("Caçar Leads");
    await act(async () => { q(".hunt-form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
    expect(qa(".hunt-card").length).toBe(1);
    // regra: resultado nenhum é adicionado à carteira por conta própria
    expect(text()).not.toContain("Refrigeração Exemplo adicionada");
    const addSelected = byText(".hunt-cta button", "Adicionar selecionadas") as HTMLButtonElement;
    expect(addSelected.disabled).toBe(true);
    expect((q(".hunt-actions") as HTMLElement).textContent).toContain("Pesquisar");
    expect((q(".hunt-actions") as HTMLElement).textContent).toContain("Adicionar aos Leads");
    expect((q(".hunt-actions button:nth-child(3)") as HTMLButtonElement).disabled).toBe(false);
    await click(q(".hunt-actions button")); // Pesquisar a empresa antes de decidir
    expect((q(".hunt-actions small") as HTMLElement).textContent).toMatch(/score|dado\(s\)/);
    await click(q(".hunt-actions button:nth-child(2)")); // Adicionar aos Leads
    await tab("Leads");
    expect(text()).toContain("Refrigeração Exemplo");
    expect(text()).toContain("de 158"); // 157 + a que eu escolhi
  });
  it("abre o WhatsApp do caçado com a mensagem gerada, sem criar lead", async () => {
    stubRoutes({ "/api/hunt-leads": { results: [HUNT_RESULT] } });
    await tab("Caçar Leads");
    await act(async () => { q(".hunt-form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
    await click(q(".hunt-actions button:nth-child(3)"));
    const open = window.open as unknown as ReturnType<typeof vi.fn>;
    expect(open).toHaveBeenCalledTimes(1);
    const target = String(open.mock.calls[0][0]);
    expect(target.startsWith("https://wa.me/5591999990000?text=")).toBe(true);
    expect(decodeURIComponent(target)).toMatch(/Refrigeração Exemplo/);
    await tab("Leads");
    expect(text()).toContain("de 157");
  });
});

describe("fatos guardados dentro do registro de pesquisa reabrem a ficha sem nova leitura", () => {
  it("usa research.facts, mostra os painéis e não chama a API sozinho", async () => {
    const facts = parsePageFacts(SITE_HTML, "https://www.imoveisbelem.belem.br");
    localStorage.setItem("prospecta-leads-v2", JSON.stringify([{ id: "hydrated-1", name: "Imóveis Belém Teste", segment: "Imobiliárias", location: "Belém - PA", phone: "91984772865", priority: "Alta", score: 80, pain: "A investigar", opportunity: "Site + captação via WhatsApp", initials: "IB", color: "lime", research: { lastResearchAt: "2026-09-01T00:00:00.000Z", researchHash: "h", signals: [], opportunities: [], sources: [], facts } }]));
    await unmount();
    await render();
    const spy = stubRoutes({});
    await tab("Leads");
    await click(q(".lead-card .more-button"));
    expect(text()).toContain("DADOS ENCONTRADOS");
    expect(text()).toContain("INTERPRETAÇÃO COMERCIAL");
    expect((q(".lead-card .lead-score small") as HTMLElement).textContent).toMatch(/lido, score do cadastro|com evidência/);
    // as camadas derivadas são reconstruídas dos mesmos fatos: nada de "sem interpretação"
    expect(text()).not.toContain("Sem interpretação por pesquisa");
    expect(q(".rp-interpretation")?.textContent).toMatch(/INTERPRETAÇÃO COMERCIAL/);
    expect(q(".score-reasons li")?.textContent).toBeTruthy(); // motivos voltam a aparecer
    // os campos vazios do lead são preenchidos com o que a página confirmou
    expect(q(".contact-grid")?.textContent).toContain("@imoveisbelem_oficial");
    expect(q(".contact-grid")?.textContent).toContain("imoveisbelem.belem.br");
    // e o texto gerado não pode contradizer o painel
    expect(q(".rp-usage")?.textContent).not.toMatch(/de fora:[^·]*Instagram \(não verificado\)/);
    // abrir a ficha nunca dispara leitura nova
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("releitura do site sem perder o que o vendedor fez", () => {
  const RESEARCH_OK = (facts: unknown, hash: string) => ({ record: { lastResearchAt: "2026-09-13T00:00:00.000Z", researchHash: hash, signals: [], opportunities: [], sources: [], facts } });
  it("com fato guardado o botão vira 'Reler o site' e a releitura substitui a análise, mantendo o cadastro", async () => {
    const first = parsePageFacts(SITE_HTML, "https://www.imoveisbelem.belem.br");
    stubRoutes({ "/api/research": RESEARCH_OK(first, "h1") });
    await tab("Leads");
    await setInput(q(".search-field input"), "Skye");
    await click(q(".lead-card .more-button"));
    await click(byText(".research-callout button", "Pesquisar empresa"));
    expect(text()).toContain("DADOS ENCONTRADOS");
    expect(byText(".research-callout button", "Reler o site")).toBeTruthy();
    // edição do vendedor + cadastro prévio
    await setInput(q(".rp-text"), "Mensagem que eu escrevi à mão.");
    await tab("Leads");
    await click(q(".lead-card .more-button"));
    expect((q(".rp-text") as HTMLTextAreaElement).value).toBe("Mensagem que eu escrevi à mão.");

    // segunda leitura: página sem Instagram/link algum → análise muda, cadastro e rascunho continuam
    const second = parsePageFacts(`<html><head><title>Imóveis Belém</title></head><body><p>Só o endereço: Av. Presidente Vargas, 100</p></body></html>`, "https://www.imoveisbelem.belem.br");
    stubRoutes({ "/api/research": RESEARCH_OK(second, "h2") });
    await click(byText(".research-callout button", "Reler o site"));
    expect((q(".rp-text") as HTMLTextAreaElement).value).toBe("Mensagem que eu escrevi à mão.");
    expect((q(".contact-grid") as HTMLElement).textContent).toContain("@imoveisbelem_oficial"); // Instagram original preservado
    expect(q(".rp-panel")?.textContent).toContain("não indicado na página"); // o que sumiu da página é lido como ausência na página
    await tab("Leads");
    await click(q(".lead-card .more-button"));
    expect((q(".rp-text") as HTMLTextAreaElement).value).toBe("Mensagem que eu escrevi à mão.");
  });
});

describe("releitura que falha não destrói o que já foi verificado", () => {
  it("mantém fatos, score e painel quando o site cai entre uma leitura e outra", async () => {
    const good = parsePageFacts(SITE_HTML, "https://www.imoveisbelem.belem.br");
    stubRoutes({ "/api/research": { record: { lastResearchAt: "2026-09-13T00:00:00.000Z", researchHash: "h1", signals: [], opportunities: [], sources: [], facts: good } } });
    await tab("Leads");
    await setInput(q(".search-field input"), "Skye");
    await click(q(".lead-card .more-button"));
    await click(byText(".research-callout button", "Pesquisar empresa"));
    expect(text()).toContain("DADOS ENCONTRADOS");
    expect(q(".rp-row.rp-found")).toBeTruthy();
    const scoreAfterFirstRead = (q(".detail-score strong") as HTMLElement).textContent;
    // agora a releitura encontra o site fora do ar
    const dead = parsePageFacts("", "https://www.imoveisbelem.belem.br", { fetchOk: false });
    stubRoutes({ "/api/research": { record: { lastResearchAt: "2026-09-14T00:00:00.000Z", researchHash: "h2", signals: [], opportunities: [], sources: [], facts: dead } } });
    await click(byText(".research-callout button", "Reler o site"));
    expect(text()).toContain("mantive os dados verificados anteriormente");
    expect((q(".detail-score strong") as HTMLElement).textContent).toBe(scoreAfterFirstRead);
    expect(q(".rp-row.rp-found")).toBeTruthy(); // os fatos antigos seguem exibidos
    expect(q(".research-callout")?.textContent).toMatch(/mantidos|Reler o site/);
  });
});

describe("pesquisa aplicada na ficha do lead", () => {
  async function openLeadWithSite() {
    await tab("Leads");
    await setInput(q(".search-field input"), "Skye");
    await click(q(".lead-card .more-button"));
  }
  it("mostra DADOS ENCONTRADOS separados da INTERPRETAÇÃO e aproveita só o que falta", async () => {
    stubRoutes({ "/api/research": { record: { lastResearchAt: "2026-09-13T00:00:00.000Z", researchHash: "hash-1", signals: ["Instagram @imoveisbelem_oficial linkado"], opportunities: ["catálogo com pedido direto"], sources: [{ id: "s1", claim: "conteúdo público", sourceUrl: "https://x", sourceType: "website", sourceTitle: "Imóveis Belém", retrievedAt: "2026-09-13", confidence: "alta" }], facts: parsePageFacts(SITE_HTML, "https://www.imoveisbelem.belem.br") } } });
    await openLeadWithSite();
    expect(text()).toContain("Nada foi pesquisado ainda");
    await click(byText(".research-callout button", "Pesquisar empresa"));
    expect(text()).toContain("DADOS ENCONTRADOS");
    expect(text()).toContain("INTERPRETAÇÃO COMERCIAL");
    expect(text()).toContain("MOTIVOS DO SCORE");
    expect(text()).toContain("não verificado"); // o estado de quem não foi lido, visível
    // telefone/instagram já cadastrados continuam os mesmos, não foram sobrescritos
    expect(q(".rp-panel")?.textContent).toContain("não indicado na página");
    // o card da lista passa a dizer se o número tem evidência por trás
    await click(q(".modal-close"));
    expect((q(".lead-card .lead-score small") as HTMLElement).textContent).toMatch(/com evidência \(\d+→\d+\)/);
    expect(q(".lead-card .lead-score")?.getAttribute("title")).toMatch(/base \d+ →/);
    await click(q(".lead-card .more-button"));
    await unmount();
    await render();
    await openLeadWithSite();
    expect(text()).toContain("DADOS ENCONTRADOS"); // persistiu: a ficha não relê o site
  });
  it("gera, deixa editar e usa o texto editado ao abrir o WhatsApp", async () => {
    stubRoutes({ "/api/research": { record: { lastResearchAt: "2026-09-13T00:00:00.000Z", researchHash: "h", signals: [], opportunities: [], sources: [], facts: parsePageFacts(SITE_HTML, "https://www.imoveisbelem.belem.br") } } });
    await openLeadWithSite();
    await click(byText(".research-callout button", "Pesquisar empresa"));
    const area = q(".rp-text") as HTMLTextAreaElement;
    expect(area.value.length).toBeGreaterThan(40);
    const generated = area.value;
    await click(byText(".rp-styles button", "Direta"));
    expect((q(".rp-text") as HTMLTextAreaElement).value).not.toBe(generated);
    await setInput(area, "Texto meu revisado antes de enviar.");
    expect((q(".rp-text") as HTMLTextAreaElement).value).toBe("Texto meu revisado antes de enviar.");
    expect(q(".rp-usage")?.textContent).toContain("restaurar texto gerado");
    await click(byText(".rp-actions button", "Abrir WhatsApp"));
    const open = window.open as unknown as ReturnType<typeof vi.fn>;
    expect(decodeURIComponent(String(open.mock.calls.at(-1)?.[0] ?? ""))).toContain("Texto meu revisado antes de enviar.");
    await click(q(".detail-actions .whatsapp-button"));
    expect(decodeURIComponent(String(open.mock.calls.at(-1)?.[0] ?? ""))).toContain("Texto meu revisado antes de enviar.");
  });
});
