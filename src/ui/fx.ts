/* 楽しさの演出（問92 C）：紙ふぶきと、数字がくるくる増える動き。動きを減らす設定の端末では出さない */
const calm = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
export function confetti(n = 60) {
  if (calm()) return;
  const box = document.createElement('div'); box.className = 'confetti'; box.setAttribute('aria-hidden', 'true');
  const colors = ['var(--club)', 'var(--gold)', '#ffffff', '#e8604c', '#3b82c4'];
  for (let i = 0; i < n; i++) {
    const s = document.createElement('i');
    s.style.left = `${Math.random() * 100}%`;
    s.style.background = colors[i % colors.length];
    s.style.animationDelay = `${Math.random() * 0.4}s`;
    s.style.animationDuration = `${1.6 + Math.random() * 1.2}s`;
    s.style.setProperty('--dx', `${(Math.random() - 0.5) * 120}px`);
    s.style.setProperty('--rot', `${Math.random() * 720 - 360}deg`);
    box.appendChild(s);
  }
  document.body.appendChild(box);
  setTimeout(() => box.remove(), 3200);
}
/** 数字が前の値から今の値へ、くるくる変わる */
export function countUp(el: HTMLElement, from: number, to: number, fmt: (v: number) => string, ms = 700) {
  if (calm() || from === to) { el.textContent = fmt(to); return; }
  const t0 = performance.now();
  const step = (t: number) => {
    const k = Math.min(1, (t - t0) / ms); const e = 1 - Math.pow(1 - k, 3);
    el.textContent = fmt(Math.round(from + (to - from) * e));
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
