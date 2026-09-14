import { useEffect, useRef } from "react";
import { ArrowUpRight, CalendarClock, Clipboard, Globe2, Instagram, Mail, MessageCircle, MoreHorizontal, Phone, Search, Star } from "lucide-react";
import type { Lead, LeadStatus } from "@/pages/Home";
import { contactLinksOf } from "@/ui/contact";
import { cardTier, countSignals, signalsOf } from "@/signals";
import { pointerDepth, pop } from "@/motion";
import { formatPhoneBr } from "@shared/normalize";
import { scoreLabel } from "@/intelligence";

type Props = {
  lead: Lead;
  index: number;
  /** `undefined` deixa o card derivar o peso do próprio lead (evidência + score + estrela). */
  tier?: "primary" | "secondary" | "utility";
  statuses?: Record<string, LeadStatus>;
  statusOptions?: readonly LeadStatus[];
  scoreTag: string;
  scoreHint: string;
  dueLabel: string;
  fuState: "vencido" | "hoje" | "futuro" | "nenhum";
  onOpen: (lead: Lead, origin: HTMLElement) => void;
  onWhatsApp: (lead: Lead) => void;
  onStatus?: (id: string, status: LeadStatus) => void;
  onToggleStar: (lead: Lead) => void;
  onResearch?: (lead: Lead) => void;
};

/** o que cada estado do sinal diz na tela, em palavra — cor nunca é o único portador de sentido */
const MARK: Record<string, { prefix: string; word: string }> = {
  found: { prefix: "+", word: "" },
  inferred: { prefix: "", word: "INFERIDO" },
  listed: { prefix: "", word: "SÓ CADASTRO" },
  absent: { prefix: "", word: "NÃO ENCONTRADO" },
};

/**
 * Card de lead. A composição responde as três perguntas do produto em ordem:
 * o que é (nome e segmento), o que foi encontrado (sinais com estado) e o que fazer (NEXT STEP).
 * O peso é desigual de propósito — PRIMARY respira, UTILITY encolhe — porque lista
 * uniforme é o que faz uma fila de 157 empresas parecer planilha.
 */
export function LeadCard({ lead, index, tier, statuses, statusOptions = [], scoreTag, scoreHint, dueLabel, fuState, onOpen, onWhatsApp, onStatus, onToggleStar, onResearch }: Props) {
  const ref = useRef<HTMLElement | null>(null);
  useEffect(() => pointerDepth(ref.current as HTMLElement), []);
  const signals = signalsOf(lead);
  const counts = countSignals(signals);
  const resolved = tier ?? cardTier({ score: lead.score, facts: lead.facts, interpretation: lead.interpretation, starred: lead.starred, status: lead.status }, index);
  const links = contactLinksOf(lead);
  const read = Boolean(lead.facts?.fetchOk);
  const contacted = Boolean(lead.events?.length) || Boolean(lead.nextActionAt) || (lead.status ?? "Novo") !== "Novo";
  const status = statuses?.[lead.id] ?? lead.status ?? "Novo";
  // o próximo passo é uma frase só, derivada do que falta — não de gosto
  const next = !read && lead.site && onResearch
    ? { label: "Ler o site", action: () => onResearch(lead), icon: <Search size={13} />, hint: "ainda não olhamos a página pública desta empresa" }
    : !read
      ? { label: "Ver ficha", action: () => ref.current && onOpen(lead, ref.current), icon: <ArrowUpRight size={13} />, hint: "sem site para ler: comece pelo que está cadastrado" }
      : { label: "Ver inteligência", action: () => ref.current && onOpen(lead, ref.current), icon: <ArrowUpRight size={13} />, hint: `${counts.found} sinal(is) verificado(s)${counts.absent ? ` · ${counts.absent} ausência(s) confirmada(s)` : ""}` };

  return (
    <article
      ref={ref}
      data-flip-item
      data-motion
      className={`lead-card lead-card--${resolved} ${fuState === "vencido" ? "is-overdue" : ""}`}
      onDoubleClick={() => ref.current && onOpen(lead, ref.current)}
    >
      {/* CABEÇALHO: quem é a empresa e quanto ela vale. O score vive aqui, à direita do nome,
          porque na ordem de leitura ele é o segundo item — antes era uma coluna lateral que
          competia com o texto por largura. */}
      <header className="lead-head">
        <div className="lead-id">
          <div className="lead-title-row">
            <h3>{lead.name}</h3>
            <span className={`px-card-tag ${resolved === "primary" ? "" : lead.score >= 78 ? "is-warm" : "is-cool"}`}>
              {resolved === "primary" ? (lead.starred ? "PRIORIDADE SUA" : "MELHOR MATCH") : lead.score >= 78 ? "QUENTE" : "PARA OLHAR"}
            </span>
            <span className={`priority ${lead.priority === "Alta" ? "high" : "medium"}`}>{lead.demo ? "DEMO · " : ""}{lead.priority}</span>
            <span className="status-pill">{status}</span>
          </div>
          <div className="lead-meta">
            <span>{lead.segment}{lead.intelligence?.subsegment ? ` · ${lead.intelligence.subsegment}` : ""}</span>
            <span className="meta-separator">·</span>
            <span>{lead.location}</span>
            {lead.site && (links.site ? <a className="site-meta" href={links.site} target="_blank" rel="noreferrer" title="Abrir o site" onClick={(e) => e.stopPropagation()}><Globe2 size={12} /> {lead.site}</a> : <span className="site-meta"><Globe2 size={12} /> {lead.site}</span>)}
            {lead.instagram && (links.instagram ? <a className="site-meta" href={links.instagram} target="_blank" rel="noreferrer" title="Abrir o Instagram" onClick={(e) => e.stopPropagation()}><Instagram size={12} /> {lead.instagram}</a> : <span className="site-meta"><Instagram size={12} /> {lead.instagram}</span>)}
          </div>
        </div>

        <div className="lead-score px-card-score" title={scoreHint}>
          <span className="px-card-score-label">Score</span>
          <strong className="px-card-score-num" data-depth>{lead.score}</strong>
          <small>{scoreLabel(lead.score)}{scoreTag}</small>
          <div className="px-card-bar"><i style={{ width: `${lead.score}%` }} /></div>
          {/* o número precisa dizer de onde veio sem popup e sem estado novo: uma linha, no hover */}
          <small className="px-card-why">{(scoreHint || "").split(" · ").slice(0, 2).join(" · ") || "score heurístico · leia o site para justificar"}</small>
        </div>
      </header>

      {/* CORPO: duas colunas de verdade — o que foi ENCONTRADO (evidência, com estado) e o que
          SIGNIFICA (interpretação comercial). DADOS ≠ INTERPRETAÇÃO lado a lado, e telefone/e-mail
          nunca mais espremidos em coluna estreita: é o grid que organiza a largura. */}
      <div className="lead-main">
        <section className="lead-col lead-col--evidence">
          <span className="px-block-label">Sinais na página pública</span>
          <div className="px-signals" data-depth aria-label="Sinais encontrados sobre esta empresa">
            {signals.map((signal) => {
              const mark = MARK[signal.state] ?? MARK.listed;
              return (
                <span key={signal.key} className={`px-signal px-signal--${signal.state}`} title={`${signal.detail} · ${signal.state === "found" ? "fato lido na página" : signal.state === "absent" ? "a página foi lida e não tem" : signal.state === "inferred" ? "inferência, não fato" : "vem do seu cadastro, ainda não verificado"}`}>
                  {mark.prefix ? <b className="px-signal-mark">{mark.prefix}</b> : null}
                  <span className="px-signal-label">{signal.label}</span>
                  {mark.word ? <em className="px-signal-word">{mark.word}</em> : null}
                </span>
              );
            })}
            {!signals.length && <span className="px-signal px-signal--absent"><span className="px-signal-label">NADA VERIFICADO</span></span>}
          </div>
          <p className="px-card-count">
            {counts.found ? <><b>{counts.found}</b> sinal{counts.found > 1 ? "is" : ""} encontrado{counts.found > 1 ? "s" : ""}</> : <b>nada verificado ainda</b>}
            {counts.listed ? ` · ${counts.listed} do cadastro` : ""}
            {counts.absent ? ` · ${counts.absent} ausência confirmada` : ""}
          </p>
        </section>

        <section className="lead-col lead-col--read">
          <span className="px-block-label">Por que este lead</span>
          <p className="opportunity">
            <strong>Dor provável:</strong> {lead.intelligence?.probablePains[0] ?? lead.pain} <span className="opportunity-arrow">→</span> {lead.opportunity}
          </p>
          {!read && <p className="px-card-count">leia o site para transformar cadastro em evidência</p>}
        </section>
      </div>

      {/* RODAPÉ: contato e ações na mesma régua. Um único dominante por card — o WhatsApp — e o
          resto em texto, para a fila de 157 não virar painel de botões. */}
      <footer className="lead-foot">
        <div className="contact-hints">
          <span><Phone size={11} /> {lead.phone ? formatPhoneBr(lead.phone) || lead.phone : "sem telefone"}</span>
          {lead.email && (links.email ? <a href={links.email} title="Escrever para o lead" onClick={(e) => e.stopPropagation()}><Mail size={11} /> {lead.email}</a> : <span><Mail size={11} /> {lead.email}</span>)}
          <span className={`lead-followup fu-${fuState} ${contacted ? "is-touched" : ""}`}><CalendarClock size={11} /> {dueLabel}</span>
        </div>

        <div className="lead-actions">
          <button className="px-card-next" onClick={next.action} title={next.hint}>{next.icon} {next.label}</button>
          <button className={`px-star ${lead.starred ? "is-on" : ""}`} aria-pressed={Boolean(lead.starred)} title={lead.starred ? "Tirar das prioridades" : "Marcar como prioridade"} onClick={(e) => { pop(e.currentTarget, { scale: 1.22 }); onToggleStar(lead); }}>
            <Star size={15} fill={lead.starred ? "currentColor" : "none"} />
          </button>
          {onStatus && (
            <label className="status-select">
              <select value={status} onChange={(e) => onStatus(lead.id, e.target.value as LeadStatus)}>{statusOptions.map((s) => <option key={s}>{s}</option>)}</select>
            </label>
          )}
          {lead.phone
            ? <button className="whatsapp-button" onClick={() => onWhatsApp(lead)}><MessageCircle size={16} /> WhatsApp</button>
            : <button className="outline-button" onClick={() => onWhatsApp(lead)} title="Lead sem telefone: copia a mensagem para outro canal"><Clipboard size={15} /> Copiar</button>}
          <button className="more-button" aria-label="Abrir ficha da empresa" onClick={() => ref.current && onOpen(lead, ref.current)}><MoreHorizontal size={18} /></button>
        </div>
      </footer>
    </article>
  );
}
