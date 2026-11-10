/* 効果音（企画書 16・問49）：ボタン・ゴールの歓声・覚醒などの短い音だけ。最初はオフ。
   音の素材は使わず、その場でブラウザの音のしくみ（Web Audio）で作る */
let on = false;
let ctx: AudioContext | null = null;
export function setSound(v: boolean) { on = v; if (v) ac(); }
export function soundOn() { return on; }
function ac(): AudioContext | null {
  try {
    if (!ctx) { const C = (window as any).AudioContext || (window as any).webkitAudioContext; if (!C) return null; ctx = new C(); }
    if (ctx!.state === 'suspended') void ctx!.resume();
    return ctx;
  } catch { return null; }
}
function tone(c: AudioContext, f: number, t0: number, dur: number, type: OscillatorType = 'sine', vol = 0.12, f2?: number) {
  const o = c.createOscillator(); const g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t0); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(c.destination); o.start(t0); o.stop(t0 + dur + 0.02);
}
function noise(c: AudioContext, t0: number, dur: number, vol = 0.08, freq = 1200) {
  const len = Math.floor(c.sampleRate * dur); const buf = c.createBuffer(1, len, c.sampleRate); const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const s = c.createBufferSource(); s.buffer = buf; const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 0.6;
  const g = c.createGain(); g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + 0.08); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  s.connect(f).connect(g).connect(c.destination); s.start(t0); s.stop(t0 + dur);
}
export function sfx(name: string) {
  if (!on) return;
  const c = ac(); if (!c) return;
  try {
    const t = c.currentTime + 0.01;
    switch (name) {
      case 'tap': tone(c, 660, t, 0.06, 'triangle', 0.05); break;
      case 'goal': noise(c, t, 1.3, 0.16, 900); [523, 659, 784, 1047].forEach((f, i) => tone(c, f, t + i * 0.09, 0.28, 'triangle', 0.1)); break;
      case 'goalOpp': noise(c, t, 0.7, 0.06, 500); tone(c, 330, t, 0.3, 'sine', 0.06, 220); break;
      case 'special': tone(c, 880, t, 0.12, 'square', 0.04); tone(c, 1320, t + 0.08, 0.2, 'triangle', 0.07); break;
      case 'awake': [392, 523, 659, 784, 1047].forEach((f, i) => tone(c, f, t + i * 0.11, 0.45, 'triangle', 0.1)); tone(c, 1568, t + 0.6, 0.6, 'sine', 0.06); break;
    }
  } catch { /* 音が出せなくても続ける */ }
}
