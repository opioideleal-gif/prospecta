import { useEffect, useRef, useState } from "react";
import { ArrowRight, ArrowUpRight, Plus, Search, Sparkles, Star } from "lucide-react";
import type { HuntedLead, Lead } from "@/pages/Home";
import { enterSequence, pop, revealResults, scanLine, scrollReveal } from "@/motion";
import { formatDate, scoreLabel } from "@/intelligence";

export type SearchMemory = { query: string; at: string; found: number; unique: number };
type Insights = { total: number; researched: number; withOpportunity: number; starred: number; hot: number };

/**
 * A espinha do produto escrita na tela de entrada — não cinco palavras soltas. Cada passo recebe
 * um estado lido do que o sistema já sabe (busca digitada, resultado voltado, base pesquisada),
 * então a linha conta a filosofia e também onde você está nela agora.
 */
/* sementes do empty state: sugestões de busca, nenhum dado inventado */
const SEEDS = ["restaurantes em Belém", "lojas de roupa", "clínicas odontológicas"];

const STEPS = [
  { key: "discover", now: "você diz o que procura: segmento, bairro, cidade" },
  { key: "find", now: "a busca varre fonte pública e traz empresas de Belém" },
  { key: "understand", now: "lemos a página da empresa e separamos fato de leitura" },
  { key: "decide", now: "score com motivos; você escolhe o que entra na carteira" },
  { key: "reach out", now: "primeira mensagem escrita para aquela empresa, sua antes de enviar" },
] as const;
type StepState = "idle" | "next" | "now" | "done";
function stateFor(key: (typeof STEPS)[number]["key"], query: string, hunting: boolean, found: number, insights: Insights): StepState {
  const typed = query.trim().length > 0;
  if (key === "discover") return typed ? "done" : "now";
  if (key === "find") return hunting ? "now" : found ? "done" : typed ? "next" : "idle";
  if (key === "understand") return insights.researched ? "done" : found ? "now" : "idle";
  if (key === "decide") return found || insights.withOpportunity ? "now" : "idle";
  return found ? "next" : "idle";
}

type Props = {
  hunting: boolean;
  error?: string;
  errorDetail?: string;
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
export function Start({ hunting, error, errorDetail, query, setQuery, onHunt, results, lastQuery, recentSearches, recentLeads, insights, onOpenLead, onAddHunted, onResearchHunted, onGoHunt, onGoLeads }: Props) {
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
              {state && <span className={`px-search-state ${hunting ? "is-live" : ""}${error ? " is-error" : ""}`}><i />{state}{state === "SIGNALS FOUND" ? ` · ${results.length}` : ""}</span>}
              <span className="px-search-hint"><kbd>/</kbd> para buscar · <kbd>esc</kbd> limpa</span>
            </div>
            <span className="px-scan" ref={scan} />
          </div>

          {error && <p className="px-hero-error">{error} — nada foi adicionado à sua carteira.{errorDetail && <em className="px-error-raw">resposta técnica: {errorDetail}</em>}</p>}
        </section>

          <ol className="px-hero-steps" data-motion aria-label="Como o Prospecta trabalha">
            {STEPS.map((step, index) => <li key={step.key} data-step={step.key} data-state={stateFor(step.key, query, hunting, results.length, insights)}><b>{String(index + 1).padStart(2, "0")}</b><span>{step.key}</span><p>{step.now}</p></li>)}
          </ol>

        <aside className="px-rail" data-motion>
          <div className={`px-rail-card${recentSearches.length ? "" : " px-empty"}`}>
            <span className="px-rail-kicker">Recent searches</span>
            {recentSearches.length ? (
              <ul className="px-rail-rows">
                {recentSearches.slice(0, 4).map((entry) => (
                  <li key={`${entry.query}-${entry.at}`}>
                    <button onClick={() => { setQuery(entry.query); onHunt(entry.query); }}>
                      <b>{entry.query}</b>
                      <small>{formatDate(entry.at)} · {entry.found || "—"} encontradas · {entry.unique} nova(s) na época</small>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <>
                <h3>Nenhuma busca ainda.</h3>
                <p>A base existe, mas o motor de caça ainda não rodou. Nada aqui foi inventado para preencher o espaço.</p>
                <span className="px-rail-sub">Comece por:</span>
                <ul className="px-seeds">
                  {SEEDS.map((seed) => <li key={seed}><button onClick={() => { setQuery(seed); input.current?.focus(); }}>{seed}</button></li>)}
                </ul>
                <button className="dark-action" onClick={() => input.current?.focus()}>Começar pela busca <ArrowRight size={14} /></button>
              </>
            )}
          </div>
          <div className="px-rail-card">
            <span className="px-rail-kicker">Estado da base</span>
            <p className="px-rail-lede">contados sobre o que existe, não estimados</p>
            <ul className="px-rail-rows px-rail-rows--data">
              <li><span>Na carteira</span><b>{insights.total}</b></li>
              <li><span>Com evidência lida</span><b>{insights.researched}</b></li>
              <li><span>Oportunidade escrita</span><b>{insights.withOpportunity}</b></li>
              <li><span>Suas prioridades</span><b>{insights.starred}</b></li>
            </ul>
            <small className="px-rail-note">{insights.total ? `${Math.round((insights.researched / insights.total) * 100)}% da carteira foi lida no site` : "ainda nada foi lido no site de ninguém"}</small>
          </div>
        </aside>

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

      </div>
    </div>
  );
}
