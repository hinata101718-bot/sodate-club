/* 年末の表彰式（問110・111）：自動で開き、1つずつ発表する。自分の選手なら紙ふぶき。最後にベストイレブンをピッチの図で */
import { closeCeremony, type GameState } from '../core/game';
import { $, esc, sheet } from './dom';
import { confetti } from './fx';
import { sfx } from './sound';
import { pitchHTML } from './pitch';

export function openCeremony(G: GameState, done: () => void) {
  const c = G.cere; if (!c) { done(); return; }
  /* 自分の段の賞が先、ほかの段（MVPと得点王）はあとでまとめて */
  const mine = c.awards.filter((a) => a.tier === c.tier);
  const others = c.awards.filter((a) => a.tier !== c.tier);
  type Step = { kind: 'open' } | { kind: 'award'; i: number } | { kind: 'others' } | { kind: 'xi' } | { kind: 'end' };
  const steps: Step[] = [{ kind: 'open' }, ...mine.map((_, i) => ({ kind: 'award', i }) as Step), ...(others.length ? [{ kind: 'others' } as Step] : []), ...(c.xi.length ? [{ kind: 'xi' } as Step] : []), { kind: 'end' }];
  let k = 0;
  const show = () => {
    const s = steps[k]; let body = ''; let party = false;
    if (s.kind === 'open') body = `<div class="cere-open"><div class="cere-kicker">${c.season}年目</div><div class="cere-title">年末の表彰式</div><div class="muted">${c.tier}部の賞を、1つずつ発表します。</div></div>`;
    if (s.kind === 'award') { const a = mine[s.i]; party = a.me;
      body = `<div class="cere-card ${a.me ? 'me' : ''}"><div class="cere-kicker">${a.tier}部</div><div class="cere-title">${esc(a.title)}</div><div class="cere-name">${esc(a.name)}</div><div class="cere-club">${esc(a.club)}${a.pos ? ` ・ ${a.pos}` : ''}</div><div class="muted small">${esc(a.detail)}</div>${a.me ? '<div class="tag gold" style="margin-top:8px">自分のクラブの選手！</div>' : ''}</div>`; }
    if (s.kind === 'others') body = `<section class="card"><h2>ほかの段</h2><div class="list">${others.map((a) => `<div class="row"><span class="tag ${a.me ? 'gold' : ''}">${a.tier}部</span><span class="grow">${esc(a.title)}：<b>${esc(a.name)}</b> <span class="muted small">${esc(a.club)} ・ ${esc(a.detail)}</span></span></div>`).join('')}</div></section>`;
    if (s.kind === 'xi') { party = c.xi.some((a) => a.me);
      body = `<section class="card"><h2>${c.tier}部のベストイレブン</h2>${pitchHTML(c.xi.map((a) => { const p = a.pos ?? 'CM'; return { pos: (['DM', 'AM'].includes(p) ? 'CM' : p === 'WG' ? 'ST' : p) as typeof p, name: a.name.split(' ')[0], sub: a.club, mark: p, hl: a.me }; }).map((s) => ({ ...s, mark: s.mark === s.pos ? undefined : s.mark })))}<div class="muted small" style="margin-top:6px">金色の枠は自分のクラブの選手（${c.xi.filter((a) => a.me).length}人）。</div></section>`; }
    if (s.kind === 'end') { const my = [...mine, ...others, ...c.xi].filter((a) => a.me);
      body = `<section class="card"><h2>表彰式のまとめ</h2>${my.length ? `<div class="list">${my.map((a) => `<div class="row"><span class="tag gold">${esc(a.title)}</span><b class="grow">${esc(a.name)}</b></div>`).join('')}</div>${c.effects.length ? `<div class="muted small" style="margin-top:8px">${c.effects.map(esc).join('<br>')}<br>クラブの人気も上がった。</div>` : ''}` : '<div class="muted">今年は、自分のクラブの選手は選ばれなかった。来年こそ。</div>'}</section>`; }
    const last = k === steps.length - 1;
    sheet(`<div class="bar"><h2>年末の表彰式</h2><span class="muted small">${k + 1} / ${steps.length}</span></div><div class="cere">${body}</div>`,
      `<div class="in2">${last ? '' : '<button class="btn ghost" id="cSkip">最後まで飛ばす</button>'}<button class="btn primary" id="cNext">${last ? '閉じる' : '次へ'}</button></div>`);
    if (party) { confetti(); sfx('goal'); }
    $('#cNext').addEventListener('click', () => { if (last) { closeCeremony(G); done(); } else { k++; show(); } });
    $('#cSkip')?.addEventListener('click', () => { k = steps.length - 1; show(); });
  };
  show();
}
