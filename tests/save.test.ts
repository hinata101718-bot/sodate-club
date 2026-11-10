import { describe, expect, it } from 'vitest';
import { newGame, advanceWeek } from '../src/core/game';
import { AUTO_KEY, loadFrom, memoryKV, saveTo, slotKey, listSlots, type KV } from '../src/core/save';

describe('セーブ', () => {
  it('セーブして読み直すと同じ状態にもどる', () => {
    const kv = memoryKV(); const G = newGame(1);
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
    expect(saveTo(bad, AUTO_KEY, newGame(2))).toBe(false);
    expect(loadFrom(bad, AUTO_KEY)).toBeNull();
    expect(listSlots(bad).length).toBe(4);
    expect(listSlots(kv).find((s) => s.key === AUTO_KEY)!.broken).toBe(true);
  });
});
