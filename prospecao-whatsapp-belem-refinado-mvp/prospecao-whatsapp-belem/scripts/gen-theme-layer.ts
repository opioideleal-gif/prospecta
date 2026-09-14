/**
 * Gera a camada dark a partir do CSS que já existe, em vez de reescrever os três arquivos na mão.
 *
 * Por que gerado: há centenas de cores literais (#fff, #18243a…) espalhadas por index/feature/
 * operations. Reescrevê-las à mão é onde um tema novo costuma quebrar tela. O script só assume
 * duas coisas seguras:
 *
 *   fundo claro neutro   → superfície do tema (var(--px-surface))
 *   fundo claro colorido → o MESMO matiz, translúcido sobre a superfície (color-mix 22%)
 *   texto escuro         → texto do tema
 *
 * O matiz preservado importa porque estado é semântica aqui: `.fu-vencido` vermelho e
 * `.priority.high` verde não podem virar cinza só porque o tema escuro é escuro. Gradiente é
 * iluminação, não pintura: fica onde está. Regra que pinta o próprio fundo sólido (avatar sobre
 * lima, badge de confiança) tem o texto intocado — aquele contraste foi escolhido para aquele fundo.
 *
 * Uso: pnpm exec tsx scripts/gen-theme-layer.ts > trecho.css  (colar dentro de client/src/depth.css)
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const FILES = ["client/src/index.css", "client/src/feature.css", "client/src/operations.css"];
const HEX = /#([0-9a-f]{6}|[0-9a-f]{3})\b/gi;

function rgb(hex: string) {
  let h = hex.replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)] as const;
}
const isLight = ([r, g, b]: readonly number[]) => (r + g + b) / 3 > 205;
/** saturação baixa = neutro (branco, cinza, off-white). alta = matiz com significado. */
const isNeutral = ([r, g, b]: readonly number[]) => Math.max(r, g, b) - Math.min(r, g, b) < 18;
const isDark = ([r, g, b]: readonly number[]) => (r + g + b) / 3 < 112;

type Rule = { sel: string; decls: string };
const rules: Rule[] = [];
for (const file of FILES) {
  const css = fs.readFileSync(path.join(ROOT, file), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  for (const match of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = match[1].trim().replace(/\s+/g, " ");
    if (!selector || /@(media|keyframes|supports|import|font-face|property)/.test(selector) || selector.startsWith("@")) continue;
    for (const sel of selector.split(",").map((s) => s.trim()).filter((s) => /^[.#\w[:>[]/.test(s) && !/^(html|body|\*|\*)$/.test(s))) rules.push({ sel, decls: match[2] });
  }
}

const neutral = new Set<string>();
const tinted: string[] = [];
const dark = new Set<string>();
const soft = new Set<string>();

for (const { sel, decls } of rules) {
  const gradient = /(?:linear|radial)-gradient/.test(decls);
  const bgDecl = /background(?:-color)?:\s*([^;]+)/i.exec(decls)?.[1] ?? "";
  if (!gradient && bgDecl) {
    const hex = bgDecl.match(/#[0-9a-f]{3,6}\b/i)?.[0];
    if (hex && isLight(rgb(hex!))) {
      if (isNeutral(rgb(hex!))) neutral.add(sel);
      else tinted.push(`${sel}|${hex}`);
    }
  }
  const colorHex = /(?:^|[;{\s])color:\s*(#[0-9a-f]{3,6})/i.exec(decls)?.[1];
  const paintsOwnSolid = !gradient && bgDecl && /#[0-9a-f]{3,6}/i.test(bgDecl) && !isLight(rgb(bgDecl.match(/#[0-9a-f]{3,6}/i)![0]));
  if (colorHex && !paintsOwnSolid) {
    if (isDark(rgb(colorHex))) dark.add(sel);
    else if (!isLight(rgb(colorHex))) soft.add(sel);
  }
}

const chunk = (list: string[], size = 10) => {
  const out: string[] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size).join(", "));
  return out;
};
const lines: string[] = [];
for (const group of chunk([...neutral].sort())) lines.push(`html.dark :is(${group}) { background: var(--px-surface); border-color: var(--px-edge); }`);
for (const entry of [...new Set(tinted)].sort()) {
  const [sel, hex] = entry.split("|");
  lines.push(`html.dark ${sel} { background: color-mix(in srgb, ${hex} 20%, var(--px-surface)); border-color: color-mix(in srgb, ${hex} 34%, transparent); }`);
}
for (const group of chunk([...dark].sort())) lines.push(`html.dark :is(${group}) { color: var(--px-text); }`);
for (const group of chunk([...soft].sort())) lines.push(`html.dark :is(${group}) { color: var(--px-text-2); }`);

console.log(lines.join("\n"));
console.log(`\n/* gerado: ${neutral.size} superfícies neutras · ${new Set(tinted).size} matizes preservados · ${dark.size} textos · ${soft.size} textos suaves */`);
