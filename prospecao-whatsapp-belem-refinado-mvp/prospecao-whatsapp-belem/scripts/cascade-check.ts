/**
 * Solver de cascata do Prospecta.
 *
 * Porque este script existe: num app com 4 folhas de estilo herdadas + uma camada nova por cima,
 * "o que aparece na tela" não é o que você escreveu por último — é quem vence em especificidade e
 * ordem. Foi assim que apareceram bugs reais: `.lead-score strong` (0,1,1) engolindo
 * `.px-card-score-num` (0,1,0), e a regra antiga de pill do trilho de passos virando discos cinza.
 * Teste nenhum pega isso, e aqui não há navegador para inspecionar.
 *
 * Como funciona: lê as 4 folhas na ordem real de `main.tsx`, separa o que está dentro de
 * `@media` que não vale num desktop de 1360px, calcula especificidade por seletor, resolve
 * `var()`/`color-mix()`/`clamp(...vw...)`/`calc()` contra os tokens de `:root` (+ `html.dark`),
 * e imprime o valor VENCEDOR de cada propriedade nos elementos que importam — com a origem
 * (arquivo:linha) e o vice-campeão, porque é exatamente aí que uma camada nova perde para uma antiga.
 *
 * Rodar: pnpm exec tsx scripts/cascade-check.ts
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// ordem de import em client/src/main.tsx — mudar aqui sem mudar lá é mentir para o relatório
const FILES = ["client/src/index.css", "client/src/feature.css", "client/src/operations.css", "client/src/depth.css"];
const VIEWPORT = 1360;
const WATCH = new Set([
  "font", "font-size", "font-family", "font-weight", "line-height", "letter-spacing", "text-transform",
  "color", "background", "background-color", "border", "border-radius", "padding", "opacity", "box-shadow", "text-align", "width", "display",
]);
const PROPS = ["font-family", "font-size", "font-weight", "letter-spacing", "text-transform", "line-height", "color", "background", "background-color", "border", "border-left", "border-right", "border-radius", "padding", "box-shadow", "opacity"];

type Decl = { prop: string; value: string; important: boolean };
type Rule = { sel: string; decls: Decl[]; file: string; line: number; media: string | null };

/**
 * Comentários viram espaços em branco, preservando a contagem de linhas. Sem isso o seletor que vem
 * depois de um bloco de comentário entra no parser com o fechamento do comentário colado, nunca casa
 * com o alvo, e o auditor dá veredito "limpo" exatamente para as regras mais recentes — o pior falso
 * negativo possível num auditor.
 */
function stripComments(src: string): string {
  let out = "";
  for (let i = 0; i < src.length; ) {
    if (src[i] === "/" && src[i + 1] === "*") {
      const end = src.indexOf("*/", i + 2);
      const stop = end < 0 ? src.length : end + 2;
      out += src.slice(i, stop).replace(/[^\n]/g, " ");
      i = stop;
    } else { out += src[i]; i++; }
  }
  return out;
}
/** varre um arquivo em regras planas, lembrando em qual @media cada uma está */
function parse(file: string, text: string): Rule[] {
  const rules: Rule[] = [];
  text = stripComments(text);
  let i = 0;
  const stack: { sel: string; start: number }[] = [];
  let buf = "";
  let line = 1;
  const mediaAt = (depth: number) => (depth >= 1 && stack[0] ? stack[0].sel : null);
  while (i < text.length) {
    const ch = text[i];
    if (ch === "\n") line++;
    if (ch === "{") {
      stack.push({ sel: buf.trim(), start: line });
      buf = "";
      i++;
      continue;
    }
    if (ch === "}") {
      const open = stack.pop();
      if (open && open.sel && !open.sel.startsWith("@")) {
        // corpo acumulado em buf são as declarações do bloco que fecha agora
        const decls = parseDecls(buf);
        if (decls.length) rules.push({ sel: open.sel.replace(/\s+/g, " "), decls, file, line: open.start, media: mediaAt(stack.length) });
      }
      buf = "";
      i++;
      continue;
    }
    buf += ch;
    i++;
  }
  return rules;
}
function parseDecls(body: string): Decl[] {
  const out: Decl[] = [];
  for (const raw of body.split(";")) {
    const d = raw.trim();
    if (!d || d.startsWith("/*")) continue;
    const idx = d.indexOf(":");
    if (idx < 1) continue;
    const prop = d.slice(0, idx).trim();
    let value = d.slice(idx + 1).trim();
    const important = /!important$/i.test(value);
    value = value.replace(/\s*!important$/i, "");
    if (!/^[a-z-]+$/.test(prop)) continue;
    out.push({ prop, value, important });
  }
  return out;
}
/**
 * Especificidade por PARTE de seletor, não pela string inteira: CSS calcula cada lado da vírgula
 * separadamente, e somar as classes do grupo fazia `.nav-item, .shortcut-list button` parecer mais
 * forte do que `.px-side-nav .nav-item` — flag falsa, do tipo que faria "consertar" coisa sã.
 */
function spec(sel: string): number {
  let best = 0;
  for (const part of sel.split(",")) {
    const s = part.replace(/@media[^{]*/g, "");
    let b = 0, c = 0;
    b += (s.match(/\.[\w-]+/g) || []).length;
    b += (s.match(/\[[^\]]+\]/g) || []).length;
    b += (s.match(/:(?!:)[\w-]+/g) || []).length;
    c += (s.match(/(^|[\s>+~])([a-z][\w-]*)/g) || []).length;
    best = Math.max(best, b * 10 + c);
  }
  return best;
}
/** @media que NÃO vale em 1360px fica de fora (é o estado responsivo, não o padrão) */
function mediaActive(media: string | null): boolean {
  if (!media) return true;
  if (/prefers-reduced-motion/.test(media)) return false;
  const min = media.match(/min-width:\s*(\d+)/);
  const max = media.match(/max-width:\s*(\d+)/);
  if (min && Number(min[1]) > VIEWPORT) return false;
  if (max && Number(max[1]) < VIEWPORT) return false;
  return true;
}
function themeOf(sel: string): "both" | "light" | "dark" {
  if (/^html\.dark\b/.test(sel) || /\.dark\s/.test(sel.slice(0, 24))) return "dark";
  if (/^html:not\(\.dark\)/.test(sel)) return "light";
  return "both";
}
function normalize(sel: string): string {
  return sel.replace(/^html\.dark\s+/, "").replace(/^html:not\(\.dark\)\s+/, "").replace(/^:root\s+/, "").trim();
}
/**
 * Um seletor de regra vale para o alvo? Descendente em CSS não exige adjacência:
 * `.lead-card .lead-title-row h3` vale para `.lead-card .lead-main .lead-title-row h3`.
 * Comparar sufixo literal (como eu fazia) não aplica — e dava veredito "limpo" para coisa não olhada,
 * que é o pior tipo de falso negativo num auditor. Então: a sequência de compostos da regra tem de
 * aparecer na ordem dos compostos do alvo, com `>` exigindo vizinhança imediata.
 */
function compounds(sel: string): string[] {
  return sel.trim().split(/\s+|(?=>)/).filter(Boolean);
}
function applies(ruleSel: string, target: string): boolean {
  const tp = compounds(target);
  for (const raw of ruleSel.split(",")) {
    const part = normalize(raw);
    if (!part) continue;
    const rp = compounds(part);
    if (rp.some((c) => c === ">")) {
      if (rp.join(" ").replace(/\s>/g, " >") === tp.slice(tp.length - rp.length).join(" ")) return true;
    }
    // o SUJEITO da regra é o último composto: `.lead-card` não pinta o h3 do card, e sem isso o
    // auditor acusava herança onde só havia ancestral
    if (rp[rp.length - 1] !== tp[tp.length - 1]) continue;
    let i = 0;
    for (let k = 0; k < tp.length - 1; k++) {
      if (i < rp.length - 1 && tp[k] === rp[i]) i++;
    }
    if (i === rp.length - 1) return true;
  }
  return false;
}

/* ── tokens: :root (todas as folhas) com html.dark por cima ─────────────────────────── */
function tokenMap(css: string, selector: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of css.matchAll(new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{([\\s\\S]*?)\\n\\}`, "g"))) {
    for (const d of m[1].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[d[1]] = d[2].trim();
  }
  return out;
}
const sources = new Map<string, string>();
for (const f of FILES) sources.set(f, readFileSync(resolve(root, f), "utf8"));
const allCss = [...sources.values()].join("\n");
const baseTokens = tokenMap(readFileSync(resolve(root, "client/src/index.css"), "utf8"), ":root");
Object.assign(baseTokens, tokenMap(readFileSync(resolve(root, "client/src/depth.css"), "utf8"), ":root"));

function mix(c1: string, c2: string, t: number): string {
  const p = (c: string) => (c.startsWith("#") ? [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)) : null);
  const a = p(c1), b = p(c2);
  if (!a || !b) return c1;
  return `#${a.map((v, i) => Math.round(v * t + b[i] * (1 - t)).toString(16).padStart(2, "0")).join("")}`;
}
function resolveValue(v: string, theme: "light" | "dark", depth = 0): string {
  if (depth > 6) return v;
  let out = v;
  const tokens = theme === "dark" ? { ...baseTokens, ...tokenMap(allCss, "html.dark") } : baseTokens;
  out = out.replace(/var\((--[\w-]+)(?:,\s*([^()]+))?\)/g, (_m, name, fb) => resolveValue(tokens[name] ?? fb ?? _m, theme, depth + 1));
  out = out.replace(/color-mix\(in srgb,\s*([^,]+),\s*([^)]+)\)/g, (_m, a, b) => {
    const t = /(\d+(?:\.\d+)?)%/.exec(a);
    const colA = resolveValue(a.replace(/\s*\d+(?:\.\d+)?%/, "").trim(), theme, depth + 1);
    const colB = resolveValue(b.trim(), theme, depth + 1);
    return t ? mix(colA, colB, Number(t[1]) / 100) : colA;
  });
  out = out.replace(/clamp\(\s*([\d.]+)px\s*,\s*([\d.]+)vw\s*,\s*([\d.]+)px\s*\)/g, (_m, mn, vw, mx) => {
    const px = (Number(vw) * VIEWPORT) / 100;
    return `${Math.min(Math.max(px, Number(mn)), Number(mx)).toFixed(1)}px`;
  });
  out = out.replace(/calc\(\s*([\d.]+)px\s*\*\s*([\d.]+)\s*\)/g, (_m, px, k) => `${(Number(px) * Number(k)).toFixed(1)}px`);
  out = out.replace(/calc\(\s*([\d.]+)px\s*-\s*([\d.]+)px\s*\)/g, (_m, a, b) => `${Number(a) - Number(b)}px`);
  return out.trim();
}

/* ── todas as regras dos 4 arquivos ─────────────────────────────────────────────────── */
const rules: Rule[] = [];
for (const [file, text] of sources) {
  const parsed = parse(file, text);
  const offset = rules.length;
  for (const r of parsed) rules.push(r);
  void offset;
}
const TARGETS: [string, string][] = [
  ["trilho · li", ".sidebar .px-hero-steps li"],
  ["trilho · rótulo", ".px-hero-steps li span"],
  ["trilho · frase", ".px-hero-steps li p"],
  ["barra · item", ".sidebar .px-side-nav .nav-item"],
  ["barra · item ativo", ".sidebar .px-side-nav .nav-item.active"],
  ["barra · badge", ".sidebar .px-side-nav .nav-item .nav-count"],
  ["barra · atalho", ".sidebar .shortcut-list button"],
  ["barra · perfil", ".sidebar .mini-profile strong"],
  ["barra · nota", ".sidebar .privacy-note"],
  ["topbar · breadcrumb", ".topbar .breadcrumbs strong"],
  ["topbar · chip da base", ".topbar .px-data-state"],
  ["busca · painel", ".px-start .px-search .px-search-inner"],
  ["busca · rótulo", ".px-search-inner .px-search label"],
  ["busca · campo", ".px-search-inner input"],
  ["busca · CTA", ".px-search-inner .px-search-go"],
  ["busca · estado", ".px-search-foot .px-search-state"],
  ["rail · cartão", ".px-start .px-rail .px-rail-card"],
  ["rail · linha de dado", ".px-rail-rows--data b"],
  ["turno · rótulo", ".page-content .px-step-row .px-step-kicker"],
  ["turno · hint", ".px-step-row .px-step-hint"],
  ["turno · próximo passo", ".px-step-block .px-next-step"],
  ["card do lead", ".lead-list .lead-card"],
  ["card · título", ".lead-card .lead-main .lead-title-row h3"],
  ["card · tag", ".lead-title-row .px-card-tag"],
  ["card · meta", ".lead-main .lead-meta span"],
  ["card · score (número)", ".lead-card .lead-score .px-card-score-num"],
  ["card · score (selo)", ".lead-card .lead-score small"],
  ["card · motivo", ".lead-score .px-card-why"],
  ["card · barra", ".px-card-score .px-card-bar"],
  ["card · sinal", ".px-signals .px-signal"],
  ["card · oportunidade", ".lead-main .opportunity"],
  ["card · próximo passo", ".contact-hints .px-card-next"],
  ["card · WhatsApp", ".lead-actions .whatsapp-button"],
  ["resultado do início", ".px-results .px-result"],
  ["resultado · kicker", ".px-result .px-result-kicker"],
  ["resultado · score", ".px-result-score b"],
  ["linha de lista", ".px-rows .px-row"],
  ["linha · número", ".px-row .px-row-num"],
  ["linha · score", ".px-row-score b"],
  ["caça · cartão", ".hunt-results .hunt-card"],
  ["caça · score", ".hunt-card .hunt-score"],
  ["caça · confiança", ".hunt-card .confidence"],
  ["caça · campo", ".hunt-form label"],
  ["caça · input", ".hunt-form input"],
  ["hoje · métrica", ".metric-grid > div"],
  ["hoje · cartão", ".next-card"],
  ["oportunidade · linha", ".opportunity-list .opportunity-row"],
  ["ficha · score da caixa", ".lead-modal .detail-score strong"],
  ["ficha · cabeçalho", ".lead-modal h2"],
  ["card · selo de estágio", ".lead-card .lead-title-row .status-pill"],
  ["card · prioridade", ".lead-title-row .priority"],
  ["card · follow-up", ".contact-hints .lead-followup"],
  ["card · contato", ".contact-hints span"],
  ["ficha · kicker", ".lead-modal .modal-kicker"],
  ["ficha · meta", ".lead-modal .detail-meta"],
  ["ficha · motivo do score", ".score-reasons li"],
  ["ficha · mensagem", ".message-body p"],
  ["abordagem · parágrafo", ".approach-grid article p"],
  ["fila · linha", ".queue-row .queue-name"],
  ["hoje · azulejo", ".today-grid .today-tile strong"],
  ["resultados · kpi", ".analytics-kpis strong"],
  ["pesquisa · linha", ".rp-panel .rp-row"],
];


/* ── modo --dead: declarações 100% ofuscadas por uma regra idêntica mais adiante ───────
   Mesmo seletor, mesmo arquivo, mesma propriedade, nenhum :hover/atributo/meio no meio → a
   primeira é código morto. É a sujeira que faz "mexi no token e não apareceu na tela". */
if (process.argv.includes("--dead")) {
  for (const [file, text] of sources) {
    const bySel = new Map<string, { prop: string; line: number; value: string }[]>();
    for (const rule of rules.filter((r) => r.file === file)) {
      const sel = normalize(rule.sel);
      if (rule.media || /:hover|:active|:focus|\[|\bhtml\./.test(rule.sel)) continue;
      const list = bySel.get(sel) || [];
      bySel.set(sel, list);
      for (const d of rule.decls) list.push({ prop: d.prop, line: rule.line, value: d.value });
    }
    for (const [sel, list] of bySel) {
      if (list.length < 2) continue;
      const seen = new Map<string, { line: number; value: string }>();
      const dead: string[] = [];
      for (const d of list) {
        const prev = seen.get(d.prop);
        if (prev) dead.push(`${prev.line} (${prev.value})`);
        seen.set(d.prop, d);
      }
      if (dead.length) console.log(`${file.replace("client/src/", "")} :: ${sel}  →  ${dead.length} declaração(ões) morta(s): ${dead.join(", ")}`);
    }
  }
  process.exit(0);
}

const OLD = new Set(["client/src/index.css", "client/src/feature.css", "client/src/operations.css"]);
let flags = 0;
for (const theme of ["light", "dark"] as const) {
  console.log(`\n########## ${theme === "light" ? "TEMA CLARO" : "TEMA ESCURO"} @ ${VIEWPORT}px`);
  for (const [name, target] of TARGETS) {
    const winner: Record<string, { decl: Decl; rule: Rule; score: number }> = {};
    const writers: Record<string, Set<string>> = {};
    rules.forEach((rule, order) => {
      const th = themeOf(rule.sel);
      if (th !== "both" && th !== theme) return;
      if (!mediaActive(rule.media) || !applies(normalize(rule.sel), target)) return;
      const s = spec(normalize(rule.sel)) + order / 10000;
      for (const decl of rule.decls) {
        const prop = decl.prop;
        const group = prop === "font" ? ["font", "font-size", "font-family", "font-weight", "line-height", "letter-spacing", "font-style"]
          : prop === "background" ? ["background", "background-color", "background-image"]
          : prop === "border" ? ["border", "border-color", "border-width", "border-style"]
          : prop === "padding" || prop === "margin" || prop === "inset" || prop === "border-radius" ? [prop] : [prop];
        for (const key of group) {
          if (!WATCH.has(key)) continue;
          (writers[key] ||= new Set()).add(rule.file);
          const cand = { decl: { prop, value: decl.value, important: decl.important }, rule, score: s + (decl.important ? 1e6 : 0) };
          const cur = winner[key];
          if (!cur || cand.score > cur.score) winner[key] = cand;
        }
      }
    });
    const only = process.argv[2] === "--values" ? "" : process.argv[2];
    if (only) {
      if (!target.includes(only) && !name.includes(only)) continue;
      console.log(`\n▸ ${name}  [${target}]`);
      for (const key of [...WATCH].sort()) {
        const w = winner[key];
        if (!w) continue;
        console.log(`   ${key.padEnd(14)} ${resolveValue(w.decl.value, theme).slice(0, 76)}  ← ${w.rule.file.replace("client/src/", "")}:${w.rule.line}  (spec ${spec(normalize(w.rule.sel))}${w.decl.important ? " !important" : ""})`);
      }
      const who: Record<string, string[]> = {};
      for (const rule of rules) {
        const th = themeOf(rule.sel);
        if (th !== "both" && th !== theme) continue;
        if (!mediaActive(rule.media) || !applies(normalize(rule.sel), target)) continue;
        for (const d of rule.decls) if (WATCH.has(d.prop)) (who[d.prop] ||= []).push(`${rule.file.replace("client/src/", "")}:${rule.line} [${rule.sel.slice(0, 46)}]`);
      }
      for (const [k, list] of Object.entries(who)) console.log(`   · quem escreve ${k}: ${list.join(" | ")}`);
      continue;
    }
    if (process.argv.includes("--values")) {
      console.log(`\n▸ ${name}  [${target}]`);
      for (const key of [...WATCH].sort()) {
        const w = winner[key];
        if (!w) continue;
        console.log(`   ${key.padEnd(14)} ${resolveValue(w.decl.value, theme).slice(0, 70)}  ← ${w.rule.file.replace("client/src/", "")}:${w.rule.line}`);
      }
      continue;
    }
    const lines: string[] = [];
    for (const key of [...WATCH].sort()) {
      const w = winner[key];
      if (!w) continue;
      const val = resolveValue(w.decl.value, theme);
      const fromFile = w.rule.file;
      const oldWinsHere = OLD.has(fromFile) && writers[key] && [...writers[key]].some((f) => f === "client/src/depth.css");
      if (oldWinsHere) {
        flags++;
        lines.push(`   ⚠ ${key.padEnd(14)} ${val.slice(0, 70)}  ← ${fromFile.replace("client/src/", "")}:${w.rule.line} (depth.css também escreve ${key} aqui e PERDE)`);
      }
    }
    if (lines.length) console.log(`\n▸ ${name}  [${target}]\n${lines.join("\n")}`);
    else console.log(`\n▸ ${name}  ✓ nenhuma herança por cima da camada nova`);
  }
}
const WATCH_LOCAL = 0; void WATCH_LOCAL;
console.log(`\n════ flag total: ${flags} declaração(ões) das camadas herdadas vencendo onde depth.css também escreve ════`);
