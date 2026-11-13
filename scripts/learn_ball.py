# 2Dのボールの動き（ボール回し）を、StatsBomb の公開データ（イベントデータ）から学ぶ
# 使い方：python3 scripts/learn_ball.py <作業フォルダ> <出力.json> [試合数]
#  - https://github.com/statsbomb/open-data の男子の試合のイベントを1試合ずつ取ってきて集計し、生のデータは消す
#  - ボールのある場所（12×8のマス。ボールを持つチームが右へ攻める向き）ごとに：
#    パス／ドリブル（キャリー）の割合、パスの行き先のマス、パスの成功率、外に出る割合、ボールの速さ、次のプレーまでの時間
import json, sys, os, subprocess, math, collections
work, out = sys.argv[1], sys.argv[2]; limit = int(sys.argv[3]) if len(sys.argv) > 3 else 250
os.makedirs(work, exist_ok=True)
RAW = 'https://raw.githubusercontent.com/statsbomb/open-data/master/data'
def get(url, path): subprocess.run(['curl', '-sS', '-L', '--retry', '3', '-o', path, url], check=True); return path
NX, NY = 12, 8
zone = lambda x, y: min(NX - 1, max(0, int(x / (120 / NX)))) * NY + min(NY - 1, max(0, int(y / (80 / NY))))
Z = NX * NY
cnt = [collections.Counter() for _ in range(Z)]        # pass / carry
pend = [collections.Counter() for _ in range(Z)]       # パスの行き先
cend = [collections.Counter() for _ in range(Z)]       # キャリーの行き先
pres = [collections.Counter() for _ in range(Z)]       # ok / lost / out
cres = [collections.Counter() for _ in range(Z)]       # ok / lost
pspd = [[] for _ in range(Z)]; gap = [[] for _ in range(Z)]
comps = json.load(open(get(RAW + '/competitions.json', work + '/competitions.json')))
comps = [c for c in comps if c.get('competition_gender') == 'male']
comps.sort(key=lambda c: (c['competition_name'] not in ('La Liga', 'Premier League', 'FIFA World Cup', 'UEFA Euro', '1. Bundesliga', 'Serie A', 'Ligue 1', 'Champions League'), -int(str(c['season_name'])[:4])))
ids = []
for c in comps:
    if len(ids) >= limit: break
    try: ms = json.load(open(get(f"{RAW}/matches/{c['competition_id']}/{c['season_id']}.json", work + '/m.json')))
    except Exception: continue
    for m in ms[:40]: ids.append(m['match_id'])
ids = ids[:limit]; used = 0
def ts(e): h, mi, s = e['timestamp'].split(':'); return int(h) * 3600 + int(mi) * 60 + float(s)
for mid in ids:
    try: ev = json.load(open(get(f'{RAW}/events/{mid}.json', work + '/e.json')))
    except Exception: continue
    onball = [e for e in ev if e['type']['name'] in ('Pass', 'Carry') and 'location' in e and not (e['type']['name'] == 'Pass' and e.get('pass', {}).get('type', {}).get('name') in ('Kick Off', 'Corner', 'Free Kick', 'Throw-in', 'Goal Kick', 'Penalty'))]
    for i, e in enumerate(onball):
        x, y = e['location'][:2]; z = zone(x, y); t = e['type']['name']
        nxt = onball[i + 1] if i + 1 < len(onball) else None
        if nxt and nxt['period'] == e['period']:
            g = ts(nxt) - ts(e)
            if 0 <= g < 15: gap[z].append(g)
        if t == 'Pass':
            p = e['pass']; ex, ey = p['end_location'][:2]; cnt[z]['pass'] += 1; pend[z][zone(ex, ey)] += 1
            o = (p.get('outcome') or {}).get('name')
            pres[z]['out' if o == 'Out' else 'ok' if o is None else 'lost'] += 1
            d = math.hypot(ex - x, ey - y) * 105 / 120; du = e.get('duration') or 0
            if du > 0.15 and d > 3: pspd[z].append(min(35, d / du))
        else:
            c = e['carry']; ex, ey = c['end_location'][:2]
            if math.hypot(ex - x, ey - y) < 2: continue
            cnt[z]['carry'] += 1; cend[z][zone(ex, ey)] += 1
            lost = nxt is not None and nxt['team']['id'] != e['team']['id']
            cres[z]['lost' if lost else 'ok'] += 1
    used += 1
    if used % 20 == 0: print('matches', used, flush=True)
os.remove(work + '/e.json')
def top(c, k):
    t = sum(c.values()) or 1
    return [[z, round(v / t, 4)] for z, v in c.most_common(k)]
med = lambda a, d: round(sorted(a)[len(a) // 2], 2) if a else d
res = {'src': 'StatsBomb open data (event data)', 'matches': used, 'nx': NX, 'ny': NY, 'zones': []}
for z in range(Z):
    n = cnt[z]['pass'] + cnt[z]['carry']
    res['zones'].append({'n': n, 'pPass': round(cnt[z]['pass'] / n, 3) if n else 0.7, 'pass': top(pend[z], 24), 'carry': top(cend[z], 10),
        'pOk': round(pres[z]['ok'] / max(1, sum(pres[z].values())), 3), 'pOut': round(pres[z]['out'] / max(1, sum(pres[z].values())), 3),
        'cOk': round(cres[z]['ok'] / max(1, sum(cres[z].values())), 3), 'speed': med(pspd[z], 14), 'gap': med(gap[z], 1.8)})
json.dump(res, open(out, 'w'), separators=(',', ':'))
print('done matches', used)
