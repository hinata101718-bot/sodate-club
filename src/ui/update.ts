/* 新しい版のお知らせ（感想25）：ホーム画面から開いたiPhoneは古いページを持ちつづけることがあるので、
   開いたときと、アプリにもどってきたときに version.json を見て、新しい版があれば「更新する」を出す */
declare const __BUILD__: string;
export const BUILD: string = typeof __BUILD__ === 'string' ? __BUILD__ : 'dev';
export function buildLabel(): string {
  if (BUILD === 'dev') return '開発中';
  const d = new Date(BUILD); return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
}
let shown = false;
async function check() {
  if (BUILD === 'dev' || shown) return;
  try {
    const r = await fetch(`${import.meta.env.BASE_URL}version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!r.ok) return;
    const v = await r.json();
    if (v.build && v.build !== BUILD) show();
  } catch { /* 電波がないときは何もしない */ }
}
function show() {
  shown = true;
  const el = document.createElement('button');
  el.className = 'update-bar'; el.type = 'button';
  el.textContent = '新しい版があります。押すと更新します（セーブはそのまま）';
  el.addEventListener('click', () => location.reload());
  document.body.appendChild(el);
}
export function watchUpdates() {
  void check();
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') void check(); });
}
