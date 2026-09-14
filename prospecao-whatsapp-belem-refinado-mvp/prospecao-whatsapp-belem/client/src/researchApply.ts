/**
 * pesquisa → lead. Transforma o `PageFacts` do servidor em campos do lead.
 *
 * Regras:
 *  - nunca sobrescreve o que o usuário já cadastrou (só preenche vazio);
 *  - normaliza telefone no formato canônico de dígitos e mantém a exibição amigável na
 *    camada de visualização (formatPhoneBr), então o dado original não é destruído;
 *  - se a leitura falhou, nada é escrito como "ausente" no lead — só o registro de
 *    pesquisa guarda isso, para a ficha dizer "não verificado" e não "não tem".
 */
import { hostOf, normalizeEmail, socialHandle, toWhatsAppNumber } from "@shared/normalize";
import type { PageFacts } from "@shared/research";

type PatchableLead = {
  phone?: string;
  email?: string;
  site?: string;
  instagram?: string;
  description?: string;
  address?: string;
  facebook?: string;
  location?: string;
};

export type AppliedResearch = {
  patch: Partial<PatchableLead> & { facts?: PageFacts; researchedAt?: string };
  added: string[];
  preserved: string[];
  ignored: string[];
};

export function leadPatchFromResearch(lead: PatchableLead, facts?: PageFacts, researchedAt?: string): AppliedResearch {
  const patch: AppliedResearch["patch"] = {};
  const added: string[] = [];
  const preserved: string[] = [];
  const ignored: string[] = [];
  if (!facts) return { patch: { facts: undefined, researchedAt }, added, preserved, ignored };

  patch.facts = facts;
  if (researchedAt) patch.researchedAt = researchedAt;
  const usable = facts.fetchOk;

  const claim = (field: keyof PatchableLead, value: string | undefined, label: string) => {
    if (!value) return;
    if (lead[field]) {
      preserved.push(label);
      return;
    }
    if (!usable) {
      ignored.push(`${label} (site não foi lido)`);
      return;
    }
    (patch as Record<string, unknown>)[field] = value;
    added.push(label);
  };

  claim("phone", facts.phones?.[0] ? toWhatsAppNumber(facts.phones[0]).replace(/^55/, "") : undefined, "telefone");
  claim("email", facts.emails?.map((e) => normalizeEmail(e)).find(Boolean), "e-mail");
  claim("site", facts.host || hostOf(facts.url), "site");
  claim("instagram", facts.instagram ? socialHandle(facts.instagram) : undefined, "Instagram");
  claim("facebook", facts.facebook ? socialHandle(facts.facebook) : undefined, "Facebook");
  claim("description", facts.description, "descrição");
  claim("address", facts.address, "endereço");
  if (usable && facts.address && !lead.location) {
    patch.location = facts.address.slice(0, 90);
    added.push("localização a partir do endereço publicado");
  }
  return { patch, added, preserved, ignored };
}
