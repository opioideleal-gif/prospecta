/**
 * Auditoria de contraste do Prospecta.
 *
 * Porque este script existe: "texto apagado" é impressão, ratio WCAG é fato. Ele lê os tokens
 * reais de `client/src/depth.css` (bloco `:root` = claro e bloco `html.dark` = escuro), resolve
 * rgba sobre a superfície em que cada par vive e mede a razão de contraste WCAG 2.1. Depois
 * compara com os mínimos que a interface precisa cumprir:
 *
 *   · corpo de texto        ≥ 4,5  (AA)
 *   · texto grande/meta     ≥ 3,0
 *   · rótulo sobre cor      ≥ 3,0  (não-texto/limiar AA-Large)
 *   · texto de botão primário ≥ 4,5
 *
 * Rodar: pnpm exec tsx scripts/contrast-audit.ts   (offline, determinístico, sem deps)
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const cssPath = resolve(dirname(fileURLToPath(import.meta.url)), "../client/src/depth.css");
const css = readFileSync(cssPath, "utf8");

type RGBA = [number, number, number, number];

function parseColor(raw: string): RGBA | null {
  const v = raw.trim();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(v);
  if (hex) {
    let h = hex[1];
    if (h.length === 3) h = [...h].map((c) => c + c).join("");
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), 1];
  }
  const rgb = /^rgba?\(([^)]+)\)$/i.exec(v);
  if (rgb) {
    const parts = rgb[1].split(/[,\s/]+/).filter(Boolean);
    const [r, g, b] = parts.map((p) => (p.endsWith("%") ? (parseFloat(p) / 100) * 255 : parseFloat(p)));
    const a = parts[3] !== undefined ? (parts[3].endsWith("%") ? parseFloat(parts[3]) / 100 : parseFloat(parts[3])) : 1;
    if ([r, g, b].some((n) => Number.isNaN(n))) return null;
    return [r, g, b, Number.isNaN(a) ? 1 : a];
  }
  return null;
}

/** tokens de um bloco (`:root { ... }` ou `html.dark { ... }`) */
function tokensOf(selector: string): Record<string, string> {
  const start = css.indexOf(selector);
  if (start < 0) throw new Error(`bloco não encontrado: ${selector}`);
  const end = css.indexOf("\n}", start);
  const body = css.slice(start, end);
  const out: Record<string, string> = {};
  for (const m of body.matchAll(/(--px-[a-z0-9-]+)\s*:\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
}

const over = (fg: RGBA, bg: RGBA): RGBA => {
  const a = fg[3];
  return [fg[0] * a + bg[0] * (1 - a), fg[1] * a + bg[1] * (1 - a), fg[2] * a + bg[2] * (1 - a), 1];
};
const lum = (c: RGBA) => {
  const ch = c.slice(0, 3).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
};
function ratio(fgRaw: string | undefined, bgRaw: string | undefined, tokens: Record<string, string>): number | null {
  if (!fgRaw || !bgRaw) return null;
  const bg = parseColor(bgRaw);
  const fgParsed = parseColor(fgRaw);
  if (!bg || !fgParsed) return null;
  const l1 = lum(over(fgParsed, bg));
  const l2 = lum(bg);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}
const tok = (t: Record<string, string>, name: string) => (t[name] ?? "").replace(/var\(--px-[\w-]+\)/g, "").trim();

// o que aparece em cada plano — foreground contra o fundo real daquele plano
const PAIRS: Array<{ label: string; fg: string; bg: string; min: number; scope: string }> = [
  { label: "texto de página", fg: "--px-text", bg: "--px-surface", min: 4.5, scope: "body" },
  { label: "título sobre canvas", fg: "--px-text", bg: "--px-canvas", min: 4.5, scope: "body" },
  { label: "secundário em card", fg: "--px-text-2", bg: "--px-surface-2", min: 4.5, scope: "body" },
  { label: "secundário em painel", fg: "--px-text-2", bg: "--px-surface-1", min: 4.5, scope: "body" },
  { label: "meta/label", fg: "--px-text-3", bg: "--px-surface-2", min: 3, scope: "meta" },
  { label: "meta em painel", fg: "--px-text-3", bg: "--px-surface-1", min: 3, scope: "meta" },
  { label: "CTA: tinta sobre accent", fg: "--px-accent-ink", bg: "--px-accent", min: 4.5, scope: "button" },
  { label: "link/rótulo accent em card", fg: "--px-accent", bg: "--px-surface-2", min: 3, scope: "label" },
  { label: "sinal confirmado (ok)", fg: "--px-ok", bg: "--px-surface-2", min: 3, scope: "label" },
  { label: "atenção (warn) em meta", fg: "--px-warn", bg: "--px-surface-2", min: 3, scope: "label" },
  { label: "erro (bad) em painel", fg: "--px-bad", bg: "--px-surface-1", min: 3, scope: "label" },
  { label: "ausência — precisa sumir, mas não desaparecer", fg: "--px-absent", bg: "--px-surface-2", min: 1.6, scope: "ink" },
  // no claro o plano não se separa por luminância (branco sobre branco é 1,00 e está certo):
  // quem desenha a borda do plano é o fio de --px-edge + a sombra. É isso que medimos aqui.
  { label: "plano 2 vs plano 1 (fio)", fg: "--px-edge", bg: "--px-surface-1", min: 1.06, scope: "depth" },
  { label: "plano 3 vs plano 2 (fio da ficha)", fg: "--px-edge-strong", bg: "--px-surface-2", min: 1.06, scope: "depth" },
  { label: "canvas vs plano de trabalho", fg: "--px-surface", bg: "--px-canvas", min: 1.05, scope: "depth" },
  // a sidebar é escura nos DOIS temas, então o contraste dela é independente do token de tema —
  // foi o "apagado" original, e agora é par medido: item de nav, atalho, nome e nota de privacidade
  { label: "sidebar: item de navegação", fg: "--px-side-text", bg: "--px-side-bg", min: 4.5, scope: "text" },
  { label: "sidebar: nome do perfil", fg: "--px-side-strong", bg: "--px-side-bg", min: 4.5, scope: "text" },
  { label: "sidebar: meta (nota de privacidade)", fg: "--px-side-meta", bg: "--px-side-bg", min: 3, scope: "label" },
];

function report(name: string, tokens: Record<string, string>) {
  console.log(`\n## ${name}`);
  const fails: string[] = [];
  for (const pair of PAIRS) {
    const r = ratio(tok(tokens, pair.fg), tok(tokens, pair.bg), tokens);
    if (r === null) { console.log(`  (não medido) ${pair.label}`); continue; }
    const ok = pair.scope === "depth" ? r >= pair.min : r >= pair.min;
    if (!ok) fails.push(pair.label);
    const bar = r >= 7 ? "■■■■■" : r >= 4.5 ? "■■■■" : r >= 3 ? "■■■" : r >= 1.5 ? "■■" : "■";
    console.log(`  ${ok ? "ok  " : "FAIL"}  ${r.toFixed(2).padStart(5)}  ${bar}  ${pair.label}  [${pair.fg} ${tok(tokens, pair.fg)} sobre ${pair.bg} ${tok(tokens, pair.bg)}]`);
  }
  if (fails.length) console.log(`  → ${fails.length} par(es) abaixo do mínimo`);
  return fails;
}

const light = tokensOf(":root {");
// o escuro é um diff sobre o claro (mesma cascade do CSS): tokens definidos só em :root valem nos dois
const dark = { ...light, ...tokensOf("html.dark {") };
const f1 = report("LIGHT  (:root)", light);
const f2 = report("DARK   (html.dark)", dark);
console.log(`\nresumo: ${f1.length} falhas no claro, ${f2.length} no escuro`);
