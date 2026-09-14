/**
 * Painéis da ficha que mostram a cadeia pesquisa → interpretação → score → abordagem.
 * Nenhum deles inventa texto: cada linha sai de um Probe (`found`/`absent`/`unknown`) ou
 * de uma interpretação já calculada, com o rótulo do estado visível.
 */
import { Clipboard, Check, MessageCircle, RotateCcw } from "lucide-react";
import { factGroups, type PageFacts, type ProbeState } from "@shared/research";
import type { Interpretation, ScoreDelta } from "@/intelligence";
import { objectives, type GeneratedApproach, type Objective } from "@/approach";

const STATE_LABEL: Record<ProbeState, string> = { found: "encontrado", absent: "não indicado na página", unknown: "não verificado" };

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="rp-group"><h5>{title}</h5>{children}</section>;
}

/** DADOS ENCONTRADOS — os 5 grupos que o parser monta, renderizados sem regra nova. */
export function PresencePanel({ facts }: { facts?: PageFacts }) {
  if (!facts) {
    return (
      <div className="rp-empty">
        <strong>Nada foi pesquisado ainda.</strong>
        <span>Sem leitura do site, a análise usa apenas o que está cadastrado aqui — e o score não recebe nenhuma evidência externa.</span>
      </div>
    );
  }
  const groups = facts.groups ?? factGroups(facts);
  return (
    <div className="rp-panel" data-flip-content>
      <div className="rp-panel-head">
        <h4><span className="rp-kicker">Signals</span>DADOS ENCONTRADOS</h4>
        <span>{facts.url}{facts.checkedOtherUrl ? ` + ${facts.checkedOtherUrl}` : ""} · lido em {new Date(facts.retrievedAt).toLocaleString("pt-BR")}</span>
      </div>
      {!facts.fetchOk && <p className="rp-warn">A página não respondeu (HTTP {facts.httpStatus ?? "sem resposta"}). Nenhum item abaixo pode ser lido como “não tem”.</p>}
      <div className="rp-groups">
        {groups.map((group) => (
          <Group key={group.id} title={group.title}>
            {group.items.map((entry) => (
              <div key={entry.label} className={`rp-row rp-${entry.state}`}>
                <span className="rp-label">{entry.label}</span>
                {entry.href ? <a href={entry.href} target="_blank" rel="noreferrer" title={entry.evidence}>{entry.value}</a> : <strong title={entry.evidence}>{entry.value}</strong>}
                <em className="rp-state">{STATE_LABEL[entry.state]}</em>
              </div>
            ))}
          </Group>
        ))}
      </div>
      <p className="rp-foot">“não indicado na página” = a página foi lida e não traz isso. “não verificado” = não foi possível ler. Ausência nunca vira argumento de venda.</p>
    </div>
  );
}

/** INTERPRETAÇÃO COMERCIAL — leitura sobre os dados, sempre marcada como hipótese. */
export function InterpretationPanel({ interpretation, deltas, base, score }: { interpretation?: Interpretation; deltas?: ScoreDelta[]; base?: number; score: number }) {
  if (!interpretation) {
    return (
      <div className="rp-empty">
        <strong>Sem interpretação por pesquisa.</strong>
        <span>A leitura abaixo vem apenas do que está cadastrado no lead. Pesquise o site para transformar isso em evidência.</span>
      </div>
    );
  }
  const reasons = (deltas ?? []).filter((d) => d.delta !== 0);
  return (
    <div className="rp-panel rp-interpretation">
      <div className="rp-panel-head"><h4><span className="rp-kicker">Why this lead</span>INTERPRETAÇÃO COMERCIAL</h4><span>{interpretation.confidence}% de confiança{(base ?? score) !== score ? ` · score ${base}→${score}` : ""}</span></div>
      <p className="rp-headline">{interpretation.headline}</p>
      <div className="rp-split">
        <section>
          <h5>OPORTUNIDADE IDENTIFICADA</h5>
          <p>{interpretation.opportunity}</p>
          <h5>POR QUÊ</h5>
          <ul>{interpretation.factsUsed.slice(0, 3).map((fact) => <li key={fact}>{fact}</li>)}</ul>
          {interpretation.detectedProblems.length > 0 && <><h5>POSSÍVEIS GANHOS</h5><ul>{interpretation.detectedProblems.slice(0, 3).map((problem) => <li key={problem}>{problem}</li>)}</ul></>}
        </section>
        <section>
          <h5>MOTIVOS DO SCORE</h5>
          {reasons.length ? <ul className="rp-deltas">{reasons.map((d) => <li key={d.label}><b className={d.delta > 0 ? "up" : "down"}>{d.delta > 0 ? `+${d.delta}` : d.delta}</b><span>{d.label}</span>{d.evidence && <small>{d.evidence}</small>}</li>)}</ul> : <p className="rp-muted">Nenhuma evidência externa alterou o score base.</p>}
          <h5>NÃO VERIFICADO</h5>
          <ul className="rp-unverified">{interpretation.unverified.map((x) => <li key={x}>{x}</li>)}</ul>
        </section>
      </div>
    </div>
  );
}

type ApproachPanelProps = {
  approaches: GeneratedApproach[];
  objective?: Objective;
  style: "Direta" | "Consultiva" | "Natural";
  draft?: string;
  hasPhone: boolean;
  onObjective: (value: Objective) => void;
  onStyle: (value: "Direta" | "Consultiva" | "Natural") => void;
  onDraft: (value: string) => void;
  onReset: () => void;
  onCopy: (text: string) => void;
  onOpen: (text: string) => void;
  copied: boolean;
};

/** GERAR ABORDAGEM — objetivo comercial + estilo + texto editável antes de copiar ou abrir. */
export function ApproachPanel({ approaches, objective, style, draft, hasPhone, onObjective, onStyle, onDraft, onReset, onCopy, onOpen, copied }: ApproachPanelProps) {
  const current = approaches.find((a) => a.style === style) ?? approaches[0];
  const text = draft ?? current?.text ?? "";
  const edited = Boolean(draft) && draft !== current?.text;
  return (
    <div className="rp-panel rp-approach">
      <div className="rp-panel-head"><h4><span className="rp-kicker">First contact</span>ABORDAGEM CONTEXTUAL</h4><span>gerada só com os campos que existem</span></div>
      <div className="rp-controls">
        <label>Objetivo comercial
          <select value={objective ?? ""} onChange={(e) => onObjective(e.target.value as Objective)}>
            <option value="">detectar automaticamente</option>
            {objectives.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
        <div className="rp-styles" role="group" aria-label="Estilo da mensagem">
          {(["Direta", "Consultiva", "Natural"] as const).map((item) => <button key={item} type="button" className={item === style ? "on" : ""} onClick={() => onStyle(item)}>{item}</button>)}
        </div>
      </div>
      <textarea className="rp-text" rows={6} value={text} onChange={(e) => onDraft(e.target.value)} aria-label="Mensagem gerada" />
      <div className="rp-usage">
        <span>usa: {current?.usedFacts.length ? current.usedFacts.join(" · ") : "só o nome da empresa"}</span>
        {current?.skippedFacts.length ? <span>de fora: {current.skippedFacts.join(" · ")}</span> : null}
        {edited && <button type="button" onClick={onReset}><RotateCcw size={12} /> restaurar texto gerado</button>}
      </div>
      <div className="rp-actions">
        <button className="outline-button" onClick={() => onCopy(text)}>{copied ? <><Check size={14} /> Copiado</> : <><Clipboard size={14} /> Copiar</>}</button>
        <button className="whatsapp-button" disabled={!hasPhone} onClick={() => onOpen(text)}><MessageCircle size={15} /> Abrir WhatsApp</button>
        {!hasPhone && <small>sem telefone cadastrado — nada é enviado, só o texto</small>}
      </div>
    </div>
  );
}
