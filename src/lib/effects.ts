// Визуални/тактилни ефекти при познаване и грешка. Само в браузъра.
import confetti from "canvas-confetti";

const COLORS = ["#ff3d8b", "#a855f7", "#ffd166", "#ffffff"];

function reducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

/** Вибрация — работи на Android; iPhone (Safari) не позволява вибрация от сайтове. */
export function vibrate(pattern: number | number[]): void {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // неподдържано — без значение
  }
}

/** Конфети при познаване; по-голямо за ранно познаване. */
export function celebrate(step: number): void {
  vibrate([30, 40, 30]);
  if (reducedMotion()) return;
  const big = step <= 1;
  void confetti({
    particleCount: big ? 140 : 70,
    spread: big ? 90 : 60,
    startVelocity: big ? 45 : 35,
    origin: { y: 0.65 },
    colors: COLORS,
    disableForReducedMotion: true,
  });
}

export function wrongFeedback(): void {
  vibrate(90);
}

/** Голямо конфети за добър краен резултат. */
export function finale(): void {
  if (reducedMotion()) return;
  const end = Date.now() + 900;
  const frame = () => {
    void confetti({ particleCount: 6, angle: 60, spread: 55, origin: { x: 0 }, colors: COLORS, disableForReducedMotion: true });
    void confetti({ particleCount: 6, angle: 120, spread: 55, origin: { x: 1 }, colors: COLORS, disableForReducedMotion: true });
    if (Date.now() < end) requestAnimationFrame(frame);
  };
  frame();
}
