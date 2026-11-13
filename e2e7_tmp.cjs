const {chromium}=require('playwright');
(async()=>{
 const SP=process.argv[2]; const b=await chromium.launch(); const pg=await b.newPage({viewport:{width:1440,height:900}});
 const errs=[]; pg.on('pageerror',e=>errs.push('PAGEERR '+e.message));
 await pg.goto('http://localhost:4173/sodate-club/'); await pg.waitForTimeout(400);
 if(await pg.$('[data-act=delSlotAsk][data-arg="3"]')){ await pg.click('[data-act=delSlotAsk][data-arg="3"]'); await pg.click('[data-act=confirmOk]'); }
 await pg.click('[data-act=newClub][data-arg="3"]'); await pg.click('[data-act=startGame]'); await pg.waitForTimeout(300);
 const handle=async()=>{ for(let k=0;k<12;k++){ let hit=false; for(const s of ['[data-act=pickSp][data-arg="0"]','[data-act=evAns][data-arg="0"]','[data-act=blockDone]','[data-act=mtDone]','[data-act=promoDone]','[data-act=regDone]','[data-act=reportDone]','[data-act=closeChain]']){ const el=await pg.$(s); if(el){await el.click(); await pg.waitForTimeout(60); hit=true; break;} } if(!hit)break; } };
 const toMatch=async()=>{ for(let w=0;w<14;w++){ await handle(); await pg.click('[data-act=next]'); await pg.waitForTimeout(100); if(await pg.$('.match-ov')) return; } };
 await toMatch();
 // 1倍で20秒：時計が20秒くらい進むか
 await pg.waitForTimeout(20000); console.log('1x clock after 20s:', await pg.$eval('#clock',e=>e.textContent));
 await pg.locator('.mp').screenshot({path:`${SP}/shots/R_1x.png`});
 // 10倍で40秒
 await pg.click('[data-act=mSpd][data-arg="10"]'); await pg.waitForTimeout(40000); console.log('10x clock after +40s:', await pg.$eval('#clock',e=>e.textContent), await pg.$eval('#mp-left',e=>e.textContent));
 await pg.screenshot({path:`${SP}/shots/R_10x.png`});
 const fps=await pg.evaluate(()=>new Promise(r=>{let n=0;const t=performance.now();const f=()=>{n++; if(performance.now()-t<1000) requestAnimationFrame(f); else r(n);}; requestAnimationFrame(f);})); console.log('fps',fps);
 // 見どころだけで最後まで
 await pg.click('[data-act=mFeed][data-arg=hl]'); const t0=Date.now();
 await pg.waitForFunction(()=>document.querySelector('#clock')?.textContent==='試合終了',null,{timeout:900000});
 console.log('highlights at 10x took', Math.round((Date.now()-t0)/1000),'s');
 await pg.click('[data-act=mClose]'); await handle();
 // 次の試合：見どころだけ・ふつうの速さ
 await pg.click('[data-act=nav][data-arg=home]'); await toMatch(); await pg.click('[data-act=mSpd][data-arg="1"]'); await pg.click('[data-act=mFeed][data-arg=hl]'); const t1=Date.now();
 await pg.waitForTimeout(30000); await pg.screenshot({path:`${SP}/shots/R_hl.png`}); console.log('hl 1x clock after 30s', await pg.$eval('#clock',e=>e.textContent));
 await pg.waitForFunction(()=>document.querySelector('#clock')?.textContent==='試合終了',null,{timeout:1500000});
 console.log('highlights at 1x took', Math.round((Date.now()-t1)/1000),'s');
 console.log('errors',errs.length, errs.slice(0,5).join('\n')); await b.close();
})();
