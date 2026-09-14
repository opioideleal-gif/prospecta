/**
 * Camada de movimento do Prospecta.
 *
 * Regra que atravessa este arquivo: animação representa ESTADO DO SISTEMA, não decoração.
 * Nada de barra que enche sozinha enquanto a requisição não respondeu nada, nada de spinner
 * que sugere progresso. Se o sistema está esperando, o movimento é indeterminado e honesto;
 * se ele terminou, o movimento termina. `prefers-reduced-motion` desliga transformação e
 * deslocamento sem desligar informação nenhuma.
 */
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { Flip } from "gsap/Flip";

let registered = false;
function core() {
  if (registered || typeof window === "undefined" || typeof document === "undefined") return;
  gsap.registerPlugin(ScrollTrigger, Flip);
  registered = true;
}

export function reducedMotion() {
  try {
    return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

/** Toda helper passa por aqui: sem document, sem movimento. */
function can() {
  if (typeof document === "undefined") return false;
  core();
  return true;
}

/**
 * Sequência de entrada: os elementos de um escopo entram em ordem, com deslocamento e
 * foco recuperando. Substitui o `gsap.to(el, {opacity:1})` genérico por uma linha do tempo
 * com ritmo — é isso que faz a tela parecer montada, não despejada.
 */
export function enterSequence(scope: HTMLElement | null, selector = "[data-motion]", opts: { y?: number; stagger?: number; delay?: number; duration?: number } = {}) {
  if (!scope || !can()) return () => {};
  if (reducedMotion()) {
    gsap.set(scope.querySelectorAll(selector), { clearProps: "opacity,transform,filter" });
    return () => {};
  }
  const ctx = gsap.context(() => {
    const items = gsap.utils.toArray<HTMLElement>(selector);
    if (!items.length) return;
    const tl = gsap.timeline({ defaults: { ease: "power3.out", duration: opts.duration ?? 0.52 } });
    tl.from(items, { autoAlpha: 0, y: opts.y ?? 16, filter: "blur(6px)", stagger: opts.stagger ?? 0.07, delay: opts.delay ?? 0 }, 0);
  }, scope);
  return () => ctx.revert();
}

/** ScrollTrigger nos trechos longos: cada bloco é revelado quando entra, uma vez só. */
export function scrollReveal(scope: HTMLElement | null, selector = "[data-reveal]") {
  if (!scope || !can() || reducedMotion()) return () => {};
  const ctx = gsap.context(() => {
    gsap.utils.toArray<HTMLElement>(selector).forEach((el) => {
      gsap.from(el, {
        autoAlpha: 0,
        y: 22,
        duration: 0.6,
        ease: "power2.out",
        scrollTrigger: { trigger: el, start: "top 86%", once: true },
      });
    });
  }, scope);
  return () => ctx.revert();
}

/**
 * Profundidade ao cursor. O efeito existe para dar leitura de plano, não para entreter:
 * inclinação de até ~2,2°, highlight que segue o ponteiro e camadas internas deslocando em
 * velocidades diferentes. Tudo por CSS var — nenhum re-render do React por quadro.
 */
export function pointerDepth(el: HTMLElement, opts: { tilt?: number; shift?: number } = {}) {
  if (!can() || reducedMotion()) return () => {};
  const maxTilt = opts.tilt ?? 2.2;
  const shift = opts.shift ?? 4;
  let raf = 0;
  const layers = Array.from(el.querySelectorAll<HTMLElement>("[data-depth]"));

  const move = (event: PointerEvent) => {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      const rect = el.getBoundingClientRect();
      const px = (event.clientX - rect.left) / rect.width;
      const py = (event.clientY - rect.top) / rect.height;
      el.style.setProperty("--px-mx", `${(px * 100).toFixed(2)}%`);
      el.style.setProperty("--px-my", `${(py * 100).toFixed(2)}%`);
      el.style.setProperty("--px-tx", `${(-(py - 0.5) * 2 * maxTilt).toFixed(3)}deg`);
      el.style.setProperty("--px-ty", `${((px - 0.5) * 2 * maxTilt).toFixed(3)}deg`);
      layers.forEach((layer, i) => {
        const k = (i + 1) * shift;
        layer.style.transform = `translate3d(${((px - 0.5) * k).toFixed(2)}px, ${((py - 0.5) * k).toFixed(2)}px, 0)`;
      });
    });
  };
  const leave = () => {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    gsap.to(el, { rotateX: 0, rotateY: 0, duration: 0.5, ease: "power2.out", clearProps: "transform" });
    el.style.removeProperty("--px-tx");
    el.style.removeProperty("--px-ty");
    layers.forEach((layer) => (layer.style.transform = ""));
  };
  el.addEventListener("pointermove", move);
  el.addEventListener("pointerleave", leave);
  return () => {
    el.removeEventListener("pointermove", move);
    el.removeEventListener("pointerleave", leave);
    if (raf) cancelAnimationFrame(raf);
  };
}

/**
 * FLIP de superfície: o card vira a ficha. Mede o card (First), deixa o painel no lugar final
 * para medir (Last), inverte com top/left/width/height e toca (Play). Anima o retângulo, não o
 * texto escalado — é a diferença entre "o card se transformou" e "deu zoom estourado".
 */
export function flipSurface(from: HTMLElement | null, to: HTMLElement | null, onDone?: () => void) {
  if (!from || !to || !can() || reducedMotion()) {
    onDone?.();
    return;
  }
  const first = from.getBoundingClientRect();
  const last = to.getBoundingClientRect();
  if (!first.width || !last.width) {
    onDone?.();
    return;
  }
  const inner = Array.from(to.querySelectorAll<HTMLElement>("[data-flip-content]"));
  gsap.set(to, { position: "fixed", top: first.top, left: first.left, width: first.width, height: first.height, margin: 0, borderRadius: gsap.getProperty(from, "border-radius") || 18, zIndex: 60 });
  gsap.set(inner, { autoAlpha: 0, y: 10 });
  const tl = gsap.timeline({ onComplete: () => { gsap.set(to, { clearProps: "position,top,left,width,height,margin,borderRadius,zIndex,transform" }); onDone?.(); } });
  tl.to(to, { top: last.top, left: last.left, width: last.width, height: last.height, borderRadius: 20, duration: 0.44, ease: "power3.inOut" }, 0);
  tl.to(inner, { autoAlpha: 1, y: 0, duration: 0.32, stagger: 0.045, ease: "power2.out" }, 0.26);
  return tl;
}

/**
 * Caminho de volta: a ficha encolhe de volta para dentro do card de onde saiu. Mesma técnica
 * do flipSurface, invertida — o conteúdo desaparece antes da superfície, para nada “encolher”.
 */
export function returnSurface(panel: HTMLElement | null, back: HTMLElement | null, done: () => void) {
  if (!panel || !back || !can() || reducedMotion()) {
    done();
    return;
  }
  const here = panel.getBoundingClientRect();
  const target = back.getBoundingClientRect();
  const inner = Array.from(panel.querySelectorAll<HTMLElement>("[data-flip-content]"));
  gsap.set(panel, { position: "fixed", top: here.top, left: here.left, width: here.width, height: here.height, margin: 0, zIndex: 60 });
  const tl = gsap.timeline({ onComplete: done });
  tl.to(inner, { autoAlpha: 0, duration: 0.12, ease: "power1.in" }, 0);
  tl.to(panel, { top: target.top, left: target.left, width: target.width, height: target.height, autoAlpha: 0.15, borderRadius: 14, duration: 0.32, ease: "power3.in" }, 0.06);
}

/** Reordenação da lista (filtro, ordenação, favoritar): FLIP de verdade, sem pulo. */
export function flipList(container: HTMLElement | null, mutate: () => void) {
  if (!container || !can() || reducedMotion()) {
    mutate();
    return;
  }
  const state = Flip.getState(container.querySelectorAll<HTMLElement>("[data-flip-item]"), { props: "opacity,transform" });
  mutate();
  Flip.from(state, { duration: 0.42, ease: "power2.inOut", absolute: true, prune: true, onEnter: (els) => gsap.fromTo(els, { autoAlpha: 0, scale: 0.97 }, { autoAlpha: 1, scale: 1, duration: 0.3 }), onLeave: (els) => gsap.to(els, { autoAlpha: 0, duration: 0.18 }) });
}

/**
 * Estado de busca. `hunting` é o único motor desta animação: enquanto a requisição está de pé
 * a barra varre (indeterminado, porque não existe percentual a mostrar); quando ela volta, a
 * barra fecha e o resultado é revelado. Sem `setInterval` inventando 30%…70%.
 */
export function scanLine(el: HTMLElement | null, active: boolean) {
  if (!el || !can()) return () => {};
  if (reducedMotion()) {
    gsap.set(el, { autoAlpha: active ? 1 : 0 });
    return () => {};
  }
  if (!active) {
    gsap.to(el, { autoAlpha: 0, scaleX: 1, duration: 0.2, transformOrigin: "left center", onComplete: () => gsap.set(el, { scaleX: 0 }) });
    return () => {};
  }
  const tl = gsap.timeline({ repeat: -1, defaults: { ease: "sine.inOut" } });
  tl.set(el, { autoAlpha: 1, transformOrigin: "left center" }).fromTo(el, { scaleX: 0.04 }, { scaleX: 0.62, duration: 0.72 }).to(el, { scaleX: 0.04, xPercent: 96, duration: 0.72 }, ">-0.1");
  return () => tl.kill();
}

/** Resultado principal primeiro, o resto em sequência: é a narrativa da busca em movimento. */
export function revealResults(scope: HTMLElement | null, selector = "[data-result]") {
  if (!scope || !can() || reducedMotion()) return () => {};
  const ctx = gsap.context(() => {
    const items = gsap.utils.toArray<HTMLElement>(selector);
    if (!items.length) return;
    const tl = gsap.timeline({ defaults: { ease: "power2.out" } });
    tl.from(items[0], { autoAlpha: 0, y: 26, scale: 0.985, duration: 0.55 });
    tl.from(items.slice(1), { autoAlpha: 0, y: 16, duration: 0.4, stagger: 0.05 }, "-=0.24");
  }, scope);
  return () => ctx.revert();
}

/** Microinteração de confirmação: botão de copiar, favoritar, chip de estágio. */
export function pop(el: HTMLElement | null, opts: { scale?: number } = {}) {
  if (!el || !can() || reducedMotion()) return;
  gsap.fromTo(el, { scale: opts.scale ?? 1.14 }, { scale: 1, duration: 0.42, ease: "back.out(2.4)" });
}

/** Saída suave antes de desmontar (fechar ficha, limpar resultados). */
export function exitThen(el: HTMLElement | null, done: () => void) {
  if (!el || !can() || reducedMotion()) {
    done();
    return;
  }
  gsap.to(el, { autoAlpha: 0, y: 12, scale: 0.99, duration: 0.18, ease: "power2.in", onComplete: done });
}

export { gsap };
