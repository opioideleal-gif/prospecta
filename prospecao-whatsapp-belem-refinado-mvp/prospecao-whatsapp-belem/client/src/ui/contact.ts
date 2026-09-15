/**
 * Para onde cada dado de contato leva — um cálculo só, compartilhado entre card e ficha.
 * Fica fora do Home para o card novo poder importar sem criar ciclo de importação.
 * Handle inutilizável ⇒ sem link, e o texto continua aparecendo: ausência de link não é
 * ausência de dado, e link quebrado é pior que link nenhum.
 */
import { profileUrl, socialHandle, toUrl } from "@shared/normalize";

export type Contactish = { site?: string; instagram?: string; email?: string; phone?: string };

export function contactLinksOf(lead: Contactish) {
  const handle = socialHandle(lead.instagram);
  const digits = (lead.phone || "").replace(/\D/g, "");
  const canonical = digits ? (digits.startsWith("55") ? digits : `55${digits}`) : undefined;
  return {
    site: toUrl(lead.site),
    instagram: handle ? profileUrl("instagram", handle) : undefined,
    email: lead.email ? `mailto:${lead.email}` : undefined,
    whatsapp: canonical ? `https://wa.me/${canonical}` : undefined,
  };
}

/** Os cinco sinais que o card mostra como linha própria — ordem é a de leitura, não a de peso. */
export const SIGNAL_HINT: Record<string, string> = {
  found: "visto na página",
  listed: "declarado no cadastro",
  inferred: "leitura heurística",
  absent: "lido e não encontrado",
};
