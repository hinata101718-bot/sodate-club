/* クラブの色で画面を染める（企画書 14・問46）。明るい画面と暗い画面の両方で読めるように、文字の色を調整する */
function hex(c: string): [number, number, number] {
  const m = c.replace('#', ''); const n = parseInt(m.length === 3 ? m.split('').map((x) => x + x).join('') : m, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const toHex = (r: number[]) => '#' + r.map((x) => Math.round(Math.max(0, Math.min(255, x))).toString(16).padStart(2, '0')).join('');
function lum([r, g, b]: number[]) {
  const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
export function contrast(a: string, b: string) { const x = lum(hex(a)), y = lum(hex(b)); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
const mix = (a: number[], b: number[], t: number) => a.map((v, i) => v + (b[i] - v) * t);
/** bg の上で 4.5 以上の差が出るまで、白か黒に寄せる */
export function readable(c: string, bg: string, toward: 'black' | 'white'): string {
  const base = hex(c); const tgt = toward === 'black' ? [0, 0, 0] : [255, 255, 255];
  for (let t = 0; t <= 1.0001; t += 0.05) { const h = toHex(mix(base, tgt, t)); if (contrast(h, bg) >= 4.6) return h; }
  return toward === 'black' ? '#000000' : '#ffffff';
}
export function inkFor(c: string) { return contrast(c, '#ffffff') >= contrast(c, '#111111') ? '#ffffff' : '#111111'; }
export function applyClubColor(c: string) {
  const s = document.documentElement.style;
  s.setProperty('--club', c);
  s.setProperty('--club-ink', inkFor(c));
  s.setProperty('--club-text', readable(c, '#ffffff', 'black'));
  s.setProperty('--club-text-d', readable(c, '#18211e', 'white'));
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', c);
}
export function oppVars(el: HTMLElement, c: string) {
  el.style.setProperty('--opp', readable(c, '#ffffff', 'black'));
  el.style.setProperty('--opp-d', readable(c, '#18211e', 'white'));
}
/** 自分のクラブの色と見分けにくいときは、相手の名前を決まりの色にする */
export function oppColor(mine: string, theirs: string) {
  const [a, b] = [hex(mine), hex(theirs)];
  const dist = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  return dist < 90 ? '#9a4b2e' : theirs;
}
export function applyThemeMode(mode: string) {
  const el = document.documentElement;
  if (mode === 'light' || mode === 'dark') el.setAttribute('data-theme', mode); else el.removeAttribute('data-theme');
}
