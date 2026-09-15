/**
 * Normalização compartilhada entre client e server.
 *
 * Regra do projeto: normalizar para uso, nunca destruir o dado original. Por isso cada
 * função devolve a forma canônica *e* mantém a amigável ao lado — nada sobrescreve o
 * valor cadastrado pelo usuário sem passar por aqui.
 */

/** Só dígitos. `tel:(91) 99999-9999` → `91999999999`. */
export function digitsOf(value?: string | null): string {
  return (value || "").replace(/\D/g, "");
}

/** Formato para wa.me / tel:. Mantém o 55 uma única vez, sem inventar DDD. */
export function toWhatsAppNumber(value?: string | null): string {
  const digits = digitsOf(value);
  if (!digits) return "";
  return digits.startsWith("55") && digits.length >= 12 ? digits : `55${digits}`;
}

/** BRL legível: 10/11 dígitos = fixo, 11 dígitos com 9 na frente = celular. */
export function formatPhoneBr(value?: string | null): string {
  const digits = digitsOf(value).replace(/^55(?=\d{10,11}$)/, "");
  if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  if (digits.length === 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return digits || "";
}

/** `https://www.Limaq.net/pagina` → `limaq.net` */
export function hostOf(value?: string | null): string {
  if (!value) return "";
  try {
    return new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return value.replace(/^https?:\/\//i, "").replace(/^www\./i, "").split("/")[0].toLowerCase();
  }
}

/** URL clicável a partir do que está cadastrado (aceita domínio solto). */
export function toUrl(value?: string | null): string | undefined {
  if (!value) return undefined;
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

/** `@imoveisbelem_oficial`, `instagram.com/foo` ou URL completa → apenas o @handle. */
export function socialHandle(value?: string | null): string | undefined {
  if (!value) return undefined;
  const raw = value.trim();
  const fromUrl = raw.match(/(?:instagram|facebook|youtube|linkedin|tiktok)\.com\/([^/?#\s]+)/i)?.[1];
  const handle = (fromUrl || raw).replace(/^@+/, "").replace(/\/+$/, "");
  return handle && handle.toLowerCase() !== "p" && handle.length > 1 ? `@${handle}` : undefined;
}

export function profileUrl(network: "instagram" | "facebook" | "youtube" | "linkedin" | "tiktok", handle: string): string {
  return `https://${network}.com/${handle.replace(/^@/, "")}`;
}

/** e-mail: minúsculo, sem ponto-e-vírgula sobrando; `mailto:` só quando for plausível. */
export function normalizeEmail(value?: string | null): string | undefined {
  const email = (value || "").trim().toLowerCase().replace(/[;,]+$/, "");
  return /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email) ? email : undefined;
}

/** Texto de página: colapsa espaço, remove marcação e limita — usado antes de guardar. */
export function cleanText(value: string, limit = 240): string {
  const text = value.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#x27;|&apos;/g, "'").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
  return text.length > limit ? `${text.slice(0, limit - 1).trimEnd()}…` : text;
}

/** Junta listas sem duplicar ignorando caixa/acentos. */
export function uniqueBy<T>(items: T[], key: (item: T) => string): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    const k = key(item).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(item);
  }
  return out;
}

export function accentInsensitive(value: string): string {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}
