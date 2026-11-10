import { Rng } from '../src/core/rng';
import { makeSquad, ovr } from '../src/core/player';
import { chooseForm, pickLineup } from '../src/core/match';
import { makeManager } from '../src/core/staff';
const r = new Rng(3); const ids={n:1};
for (const L of [53,57,69,76]) { let s=0,n=0,mx=0;
 for (let i=0;i<40;i++){ const sq=makeSquad(r,ids,L+r.int(-4,5)); const m=makeManager(r,ids,.5); const {lineup}=pickLineup(r,{id:1,name:'',me:false,color:'',squad:sq,mgr:m},m.forms[0]); const v=lineup.map(x=>ovr(x.p)); s+=v.reduce((a,b)=>a+b,0)/v.length; n++; mx=Math.max(mx,...v);} console.log(L,(s/n).toFixed(1),'max',mx); }
