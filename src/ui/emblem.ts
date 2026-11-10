import type { Emblem } from '../core/emblem';
/* エンブレムの絵（形・模様・2色・しるし） */
const SHAPE_PATHS = [
  'M20 2 L37 7 V21 C37 32 29 39 20 42 C11 39 3 32 3 21 V7 Z',
  'M20 3 A19 19 0 1 1 19.99 3 Z',
  'M20 2 L37 11.5 V32.5 L20 42 L3 32.5 V11.5 Z',
  'M20 1 L39 22 L20 43 L1 22 Z',
  'M4 3 H36 V30 L20 42 L4 30 Z',
];
const SYMS = [
  '<path d="M20 12 L22.6 18.6 L29.6 19 L24.2 23.4 L26 30.2 L20 26.4 L14 30.2 L15.8 23.4 L10.4 19 L17.4 18.6 Z" fill="%c"/>',
  '<path d="M20 12 C15 16 14 22 20 29 C26 22 25 16 20 12 Z" fill="%c"/><path d="M20 29 V32" stroke="%c" stroke-width="2" stroke-linecap="round"/>',
  '<path d="M9 22 C13 18 16 18 20 22 C24 26 27 26 31 22 M9 28 C13 24 16 24 20 28 C24 32 27 32 31 28" fill="none" stroke="%c" stroke-width="2.6" stroke-linecap="round"/>',
  '<path d="M8 30 L16 17 L20 23 L24 15 L32 30 Z" fill="%c"/>',
  '<circle cx="20" cy="22" r="8.5" fill="none" stroke="%c" stroke-width="2.2"/><path d="M20 17.5 L24 20.4 L22.5 25 H17.5 L16 20.4 Z" fill="%c"/>',
  '',
];
let uid = 0;
export function emblemSVG(e: Emblem, cls = 'crest'): string {
  const id = 'em' + uid++;
  const shape = SHAPE_PATHS[e.shape] || SHAPE_PATHS[0];
  const pat = [
    '',
    `<g clip-path="url(#${id})"><rect x="9" y="0" width="7" height="44" fill="${e.c2}" opacity=".9"/><rect x="24" y="0" width="7" height="44" fill="${e.c2}" opacity=".9"/></g>`,
    `<g clip-path="url(#${id})"><rect x="0" y="16" width="40" height="11" fill="${e.c2}" opacity=".9"/></g>`,
    `<g clip-path="url(#${id})"><path d="M-4 34 L34 -4 L44 6 L6 44 Z" fill="${e.c2}" opacity=".9"/></g>`,
  ][e.pattern] || '';
  const symColor = e.pattern === 0 ? e.c2 : e.c1;
  const sym = (SYMS[e.symbol] || '').replace(/%c/g, symColor);
  return `<svg class="${cls}" viewBox="0 0 40 44" aria-hidden="true"><defs><clipPath id="${id}"><path d="${shape}"/></clipPath></defs>
  <path d="${shape}" fill="${e.c1}" stroke="#ffffff" stroke-width="2.2" stroke-linejoin="round"/>${pat}${sym ? `<g>${sym}</g>` : ''}</svg>`;
}
