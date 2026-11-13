# 2Dの選手の動きを、Metrica Sports のサンプルの位置データから学ぶ（docs/pc/movement.md）
# 使い方：python3 scripts/learn_movement.py <Sample_Game_1のフォルダ>,<Sample_Game_2のフォルダ> src/pc/movemodel.raw.json
# フォルダには home.csv・away.csv・events.csv（RawTrackingData_Home_Team / Away_Team / RawEventsData）を置く
import numpy as np, pandas as pd, json, sys
DIRS=sys.argv[1].split(',')
def load(f):
    raw=pd.read_csv(f, header=None, skiprows=3, low_memory=False)
    hdr=pd.read_csv(f, header=None, skiprows=2, nrows=1).iloc[0].tolist()
    cols=[]
    for i,h in enumerate(hdr):
        if isinstance(h,str) and h.startswith('Player'): cols.append((h,i))
    return raw, cols
AXB=[0,21,42,63,84,105.01]; AYB=[0,22.67,45.33,68.01]; BXB=np.linspace(0,105.01,8); BYB=np.linspace(0,68.01,6)
sumx=np.zeros((5,3,2,7,5)); sumy=np.zeros_like(sumx); n=np.zeros_like(sumx); sq=np.zeros_like(sumx)
speeds=[]; gaps=[]
for D in DIRS:
    H,hc=load(D+'/home.csv'); A,ac=load(D+'/away.csv')
    period=H[0].values.astype(int); frame=H[1].values.astype(int)
    bx=H[hdr_i:=len(pd.read_csv(D+'/home.csv',header=None,skiprows=2,nrows=1).columns)-2].values.astype(float)*105
    by=H[len(pd.read_csv(D+'/home.csv',header=None,skiprows=2,nrows=1).columns)-1].values.astype(float)*68
    ev=pd.read_csv(D+'/events.csv')
    # ボールを持っているチーム（直前のイベントのチーム）
    poss=np.full(len(frame), -1)
    ev=ev.sort_values('Start Frame')
    cur=-1; j=0; evf=ev['Start Frame'].values; evt=ev['Team'].values; evy=ev['Type'].values
    for i,f in enumerate(frame):
        while j<len(evf) and evf[j]<=f:
            if evy[j] not in ('BALL OUT','CARD'): cur=0 if evt[j]=='Home' else 1
            if evy[j]=='BALL OUT': cur=-1
            j+=1
        poss[i]=cur
    step=5; idx=np.arange(0,len(frame),step)
    for team,(T,cols) in enumerate([(H,hc),(A,ac)]):
        for per in (1,2):
            m=(period==per)
            # チームの向き：GKを、平均の x がいちばん端の選手とする
            xs={}; 
            for name,ci in cols:
                x=T[ci].values.astype(float)[m]*105; y=T[ci+1].values.astype(float)[m]*68
                if np.isfinite(x).sum()>5000: xs[name]=(np.nanmean(x),ci)
            gk=min(xs,key=lambda k:min(xs[k][0],105-xs[k][0]))
            flip = xs[gk][0]>52.5   # GKが右にいる → 左へ攻めている → 反転
            for name,(mx,ci) in xs.items():
                x=T[ci].values.astype(float)*105; y=T[ci+1].values.astype(float)*68
                sel=idx[(period[idx]==per)]
                px=x[sel]; py=y[sel]; b1=bx[sel]; b2=by[sel]; po=poss[sel]
                ok=np.isfinite(px)&np.isfinite(py)&np.isfinite(b1)&np.isfinite(b2)&(po>=0)
                px,py,b1,b2,po=px[ok],py[ok],b1[ok],b2[ok],po[ok]
                if flip: px=105-px; py=68-py; b1=105-b1; b2=68-b2
                ax=px.mean(); ay=py.mean()
                if name==gk: continue  # キーパーは別に扱う
                ia=np.clip(np.digitize(ax,AXB)-1,0,4); ja=np.clip(np.digitize(ay,AYB)-1,0,2)
                ib=np.clip(np.digitize(b1,BXB)-1,0,6); jb=np.clip(np.digitize(b2,BYB)-1,0,4)
                ours=(po==team).astype(int)
                dx=px-ax; dy=py-ay
                for k in range(len(px)):
                    sumx[ia,ja,ours[k],ib[k],jb[k]]+=dx[k]; sumy[ia,ja,ours[k],ib[k],jb[k]]+=dy[k]; n[ia,ja,ours[k],ib[k],jb[k]]+=1; sq[ia,ja,ours[k],ib[k],jb[k]]+=dx[k]**2+dy[k]**2
                v=np.hypot(np.diff(px),np.diff(py))/(step/25); speeds+=list(v[v<12])
    pas=ev[ev.Type=='PASS']
    prev=None
    for _,r in pas.iterrows():
        if prev is not None and prev['Team']==r['Team'] and 0<r['Start Time [s]']-prev['Start Time [s]']<12: gaps.append(r['Start Time [s]']-prev['Start Time [s]'])
        prev=r
mx=np.where(n>0,sumx/np.maximum(n,1),0); my=np.where(n>0,sumy/np.maximum(n,1),0)
sd=np.sqrt(np.where(n>0,sq/np.maximum(n,1)-(mx**2+my**2),0).clip(0))
# パスの間隔（同じチームのパスが続くとき）
out={'src':'Metrica Sports sample data (Sample Game 1)','ax':AXB,'ay':AYB,'bx':BXB.round(2).tolist(),'by':BYB.round(2).tolist(),
 'dx':np.round(mx,1).tolist(),'dy':np.round(my,1).tolist(),'sd':np.round(sd,1).tolist(),'n':n.astype(int).tolist(),
 'speed':{'mean':round(float(np.mean(speeds)),2),'p90':round(float(np.percentile(speeds,90)),2)},'passGap':round(float(np.median(gaps)),2)}
json.dump(out,open(sys.argv[2],'w'))
print('cells',int((n>0).sum()),'/',n.size,'speed',out['speed'],'passGap',out['passGap'])
# 例：真ん中の後ろの選手（CB）、守っているとき、ボールが相手の右サイド深く
print('CB def, ball own left deep',mx[1,1,0,1,0],my[1,1,0,1,0]); print('ST att, ball midfield', mx[3,1,1,3,2], my[3,1,1,3,2])
