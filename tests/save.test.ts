import { describe, expect, it } from 'vitest';
import { newGame, advanceWeek } from '../src/core/game';
import { AUTO_KEY, loadFrom, memoryKV, saveTo, slotKey, listSlots, type KV } from '../src/core/save';

describe('セーブ', () => {
  it('セーブして読み直すと同じ状態にもどる', () => {
    const kv = memoryKV(); const G = newGame({ seed: 1 });
    for (let i = 0; i < 5; i++) advanceWeek(G);
    expect(saveTo(kv, slotKey(1), G)).toBe(true);
    const L = loadFrom(kv, slotKey(1))!;
    expect(JSON.stringify(L)).toBe(JSON.stringify(G));
    /* 読み直したあとに進めても、同じように進む */
    advanceWeek(G); advanceWeek(L);
    expect(JSON.stringify(L)).toBe(JSON.stringify(G));
  });
  it('こわれたセーブや、書けないときでも落ちない', () => {
    const kv = memoryKV(); kv.setItem(AUTO_KEY, '{こわれた');
    expect(loadFrom(kv, AUTO_KEY)).toBeNull();
    const bad: KV = { getItem: () => { throw new Error('x'); }, setItem: () => { throw new Error('満杯'); }, removeItem: () => { throw new Error('x'); } };
    expect(saveTo(bad, AUTO_KEY, newGame({ seed: 2 }))).toBe(false);
    expect(loadFrom(bad, AUTO_KEY)).toBeNull();
    expect(listSlots(bad).length).toBe(4);
    expect(listSlots(kv).find((s) => s.key === AUTO_KEY)!.broken).toBe(true);
  });
});

import { readFileSync } from 'fs';
import { SAVE_VERSION, myTier, standings, ME } from '../src/core/game';
describe('古い版のセーブの変換', () => {
  it('版1（段階1）のセーブを読みこめて、そのまま続けて遊べる', () => {
    const kv = memoryKV(); kv.setItem(AUTO_KEY, readFileSync(__dirname + '/fixtures/save-v1.json', 'utf8'));
    const raw = JSON.parse(kv.getItem(AUTO_KEY)!);
    expect(raw.state.version).toBe(1);
    const G = loadFrom(kv, AUTO_KEY)!;
    expect(G).not.toBeNull();
    expect(G.version).toBe(SAVE_VERSION);
    expect(G.clubs.length).toBe(36);
    expect(G.squad.length).toBe(raw.state.squad.length);
    expect(G.club.name).toBe(raw.state.club.name);
    /* 順位表の成績を引き継ぐ */
    const me = standings(G).find((x) => x.id === ME)!;
    expect(me.p).toBe(raw.state.table[0].p);
    expect(myTier(G)).toBe(3);
    for (let i = 0; i < 60; i++) advanceWeek(G);
    expect(G.season).toBe(raw.state.season + 1);
    expect(saveTo(kv, slotKey(2), G)).toBe(true);
    expect(loadFrom(kv, slotKey(2))!.season).toBe(G.season);
  });
});

describe('版2（段階2）のセーブの変換', () => {
  it('ユースが足され、そのまま続けて遊べる', () => {
    const kv = memoryKV(); kv.setItem(AUTO_KEY, readFileSync(__dirname + '/fixtures/save-v2.json', 'utf8'));
    const raw = JSON.parse(kv.getItem(AUTO_KEY)!);
    expect(raw.state.version).toBe(2);
    const G = loadFrom(kv, AUTO_KEY)!;
    expect(G.version).toBe(SAVE_VERSION);
    expect(G.youth.length).toBeGreaterThanOrEqual(12);
    expect(G.week).toBe(raw.state.week);
    expect(G.squad.length).toBe(raw.state.squad.length);
    for (let i = 0; i < 50; i++) advanceWeek(G);
    expect(G.season).toBe(2);
  });
});

describe('版3（段階3）のセーブの変換', () => {
  it('お金・施設・人が足され、そのまま続けて遊べる', () => {
    const kv = memoryKV(); kv.setItem(AUTO_KEY, readFileSync(__dirname + '/fixtures/save-v3.json', 'utf8'));
    const raw = JSON.parse(kv.getItem(AUTO_KEY)!);
    expect(raw.state.version).toBe(3);
    const G = loadFrom(kv, AUTO_KEY)!;
    expect(G.version).toBe(SAVE_VERSION);
    expect(G.owner.money).toBeGreaterThan(0);
    expect(G.owner.fac.field).toBe(1);
    expect(G.youth.length).toBe(raw.state.youth.length);
    for (let i = 0; i < 30; i++) advanceWeek(G);
    expect(G.season).toBe(2);
  });
});
