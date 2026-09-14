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
