/* 効果音（企画書 16）。段階5で中身を入れる。最初はオフ */
let on = false;
export function setSound(v: boolean) { on = v; }
export function soundOn() { return on; }
export function sfx(_name: string) { if (!on) return; }
