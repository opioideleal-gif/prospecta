import { useEffect, useRef, useState } from "react";
import { ArrowRight, ArrowUpRight, Plus, Search, Sparkles, Star } from "lucide-react";
import type { HuntedLead, Lead } from "@/pages/Home";
import { enterSequence, pop, revealResults, scanLine, scrollReveal } from "@/motion";
import { formatDate, scoreLabel } from "@/intelligence";

export type SearchMemory = { query: string; at: string; found: number; unique: number };
type Insights = { total: number; researched: number; withOpportunity: number; starred: number; hot: number };

type Props = {
  hunting: boolean;
  error?: string;
  query: string;
  setQuery: (value: string) => void;
  onHunt: (query: string) => void;
  results: HuntedLead[];
  lastQuery: string;
  recentSearches: SearchMemory[];
  recentLeads: Lead[];
  insights: Insights;
  onOpenLead: (lead: Lead, origin: HTMLElement) => void;
  onAddHunted: (item: HuntedLead) => void;
  onResearchHunted: (item: HuntedLead) => void;
  onGoHunt: () => void;
  onGoLeads: () => void;
};

/**
 * Início. Antes de qualquer lista, a tela responde as três perguntas de quem chega sem
 * treinamento: o que é isto, o que eu faço, o que acontece depois. O resto aparece
 * gradualmente conforme o sistema tem o que dizer — nada aqui é preenchido com número
 * inventado: se não há busca, o bloco de recentes diz isso e convida.
 */
export function Start({ hunting, error, query, setQuery, onHunt, results, lastQuery, recentSearches, recentLeads, insights, onOpenLead, onAddHunted, onResearchHunted, onGoHunt, onGoLeads }: Props) {
  const root = useRef<HTMLDivElement | null>(null);
  const input = useRef<HTMLInputElement | null>(null);
  const scan = useRef<HTMLSpanElement | null>(null);
  const goRef = useRef<HTMLButtonElement | null>(null);
  const [focused, setFocused] = useState(false);

  useEffect(() => enterSequence(root.current, "[data-motion]", { stagger: 0.075, y: 18 }), []);
  useEffect(() => scrollReveal(root.current, "[data-reveal]"), [results.length, recentSearches.length, recentLeads.length]);
  useEffect(() => { if (results.length) return revealResults(root.current, "[data-result]"); }, [results.length]);
  useEffect(() => scanLine(scan.current, hunting), [hunting]);
  // atalho de ferramenta rápida: "/" foca a busca, como em paleta de comando
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName);
      if (event.key === "/" && !typing) { event.preventDefault(); input.current?.focus(); }
      if (event.key === "Escape" && typing) { setQuery(""); input.current?.blur(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setQuery]);

  const submit = () => { if (!hunting) { pop(goRef.current, { scale: 1.06 }); onHunt(query.trim()); } };
  const state = error ? "Falha na busca pública" : hunting ? "DISCOVERING BUSINESSES" : results.length ? "SIGNALS FOUND" : lastQuery ? "NOTHING FOUND" : null;

  return (
    <div className="page-content">
      <div className="px-start" ref={root}>
        <section className="px-hero">
          <span className="px-wordmark" data-motion><i /> Prospecta · Belém</span>
          <h1 data-motion>Empresas que valem <em>uma conversa.</em></h1>
          <p data-motion>Você diz o que procura. O Prospecta caça em fonte pública, lê a página da empresa, separa o que encontrou do que é leitura dele e devolve uma primeira mensagem escrita para aquela empresa — não para qualquer empresa.</p>
          <ul className="px-hero-steps" data-motion>
            <li>discover</li><li>find</li><li>understand</li><li>decide</li><li>reach out</li>
          </ul>

          <div className={`px-search ${focused ? "is-focus" : ""}`} data-motion>
            <div className="px-search-inner">
              <div>
                <label htmlFor="px-hunt">O que você está procurando?</label>
                <input
                  id="px-hunt"
                  ref={input}
                  value={query}
                  placeholder="restaurantes japoneses em Belém"
                  autoComplete="off"
                  onFocus={() => setFocused(true)}
                  onBlur={() => setFocused(false)}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submit(); } }}
                />
              </div>
              <button ref={goRef} className="px-search-go" onClick={submit} disabled={hunting}>
                {hunting ? "Caçando" : "Hunt"} <ArrowRight size={16} />
              </button>
            </div>
            <div className="px-search-foot">
              <span>Busque empresas, descubra sinais e transforme isso em conversa.</span>
              {state && <span className={`px-search-state ${hunting ? "is-live" : ""}`}><i />{state}{state === "SIGNALS FOUND" ? ` · ${results.length}` : ""}</span>}
              <span style={{ marginLeft: "auto", fontFamily: "DM Mono, monospace", fontSize: 10, color: "var(--px-text-3)" }}>
                <kbd>/</kbd> para buscar
              </span>
            </div>
            <span className="px-scan" ref={scan} />
          </div>

          {error && <p className="px-hero-error">{error} — nada foi adicionado à sua carteira.</p>}
        </section>

        {results.length > 0 && (
          <section data-reveal>
            <div className="px-section-label">
              <h2>Your search</h2>
              <button className="outline-button" onClick={onGoHunt}>Revisar todas <ArrowUpRight size={13} /></button>
            </div>
            <p className="px-search-summary">“{lastQuery}” · {results.length} {results.length === 1 ? "empresa encontrada" : "empresas encontradas"} · nada entra na carteira sozinho</p>
            <div className="px-results">
              <article className="px-result px-result--best" data-result>
                <span className="px-result-kicker">Best match</span>
                <h3>{results[0].name}</h3>
                <p>{results[0].segment} · {results[0].location}</p>
                <p className="px-result-why">{results[0].opportunity}</p>
                <div className="px-result-foot">
                  <span className="px-result-score"><b>{results[0].score}</b> score</span>
                  <div className="px-result-actions">
                    <button className="outline-button" onClick={() => onResearchHunted(results[0])}><Search size={13} /> Ler o site</button>
                    <button className="dark-action" onClick={() => onAddHunted(results[0])}><Plus size={14} /> Adicionar aos leads</button>
                  </div>
                </div>
              </article>
              {results.length > 1 && (
                <div className="px-result-list">
                  <span className="px-result-kicker">More opportunities</span>
                  {results.slice(1, 6).map((item) => (
                    <div className="px-row" data-result key={item.id} onClick={() => onResearchHunted(item)}>
                      <span className="px-row-num">{item.score}</span>
                      <span><b>{item.name}</b><small>{item.segment} · {item.location} · {item.site ? item.site : "sem site no resultado"}</small></span>
                      <button className="outline-button" onClick={(e) => { e.stopPropagation(); onAddHunted(item); }}><Plus size={13} /> Adicionar</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        )}

        <section data-reveal>
          <div className="px-section-label"><h2>Recent searches</h2><span>{recentSearches.length ? "clique para rodar de novo" : "nenhuma busca ainda"}</span></div>
          {recentSearches.length ? (
            <div className="px-rows">
              {recentSearches.slice(0, 4).map((entry) => (
                <button className="px-row" key={`${entry.query}-${entry.at}`} onClick={() => { setQuery(entry.query); onHunt(entry.query); }}>
                  <span className="px-row-num">{entry.found || "—"}</span>
                  <span><b>{entry.query}</b><small>{formatDate(entry.at)} · {entry.unique} nova(s) na época</small></span>
                  <ArrowRight size={14} />
                </button>
              ))}
            </div>
          ) : (
            <div className="px-empty">
              <h3>Nenhuma busca ainda</h3>
              <p>Rode a primeira caçada acima para começar a montar sua carteira. O Prospecta salva aqui o que ele de fato encontrou — sem busca, sem lista.</p>
              <button className="dark-action" onClick={() => input.current?.focus()}><Sparkles size={14} /> Começar pela busca</button>
            </div>
          )}
        </section>

        <section data-reveal>
          <div className="px-section-label">
            <h2>Recent leads</h2>
            <button className="outline-button" onClick={onGoLeads}>Abrir carteira <ArrowUpRight size={13} /></button>
          </div>
          {recentLeads.length ? (
            <div className="px-rows">
              {recentLeads.map((lead, index) => (
                <div className="px-row" key={lead.id} onClick={(e) => onOpenLead(lead, e.currentTarget as HTMLElement)}>
                  <span className="px-row-num">{String(index + 1).padStart(2, "0")}</span>
                  <span>
                    <b>{lead.starred && <Star size={11} fill="currentColor" style={{ verticalAlign: "-1px", marginRight: 5, color: "var(--px-warn)" }} />}{lead.name}</b>
                    <small>{lead.segment} · {lead.location} · {lead.facts?.fetchOk ? `${lead.interpretation?.opportunity ?? "site lido"}` : "site ainda não lido"}</small>
                  </span>
                  <span className="px-row-score"><b>{lead.score}</b><small>{scoreLabel(lead.score)}</small></span>
                </div>
              ))}
            </div>
          ) : (
            <div className="px-empty">
              <h3>Sua carteira está vazia</h3>
              <p>Ela começa com uma caçada ou com uma empresa cadastrada à mão. Os 157 contatos da base congelada continuam na aba Leads.</p>
              <button className="dark-action" onClick={onGoHunt}><Search size={14} /> Cazar empresas</button>
            </div>
          )}
        </section>

        <section data-reveal>
          <div className="px-section-label"><h2>Insights</h2><span>contados sobre o que existe, não estimados</span></div>
          <div className="px-insights">
            <div className="px-insight"><span>Na carteira</span><strong>{insights.total}</strong><small>empresas com algum dado de contato</small></div>
            <div className="px-insight"><span>Com evidência lida</span><strong>{insights.researched}</strong><small>{insights.total ? `${Math.round((insights.researched / insights.total) * 100)}% da carteira foi lida no site` : "ainda nada foi lido — comece pela aba Leads"}</small></div>
            <div className="px-insight px-insight--accent"><span>Oportunidade escrita</span><strong>{insights.withOpportunity}</strong><small>leads com leitura concluída e ganho identificado</small></div>
            <div className="px-insight"><span>Suas prioridades</span><strong>{insights.starred}</strong><small>marcados com estrela por você</small></div>
          </div>
        </section>
      </div>
    </div>
  );
}
