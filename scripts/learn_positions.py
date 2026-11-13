# 2Dの選手の立ち位置を、SkillCorner の公開データ（実際の試合の位置データ）から学ぶ
# 使い方：python3 scripts/learn_positions.py <作業フォルダ> <出力.json>
#  - https://github.com/SkillCorner/opendata の全試合を1つずつ取ってきて集計し、生のデータは消す
#  - 集計するもの：役割（GK・CB左右・SB左右・DM・CM・AM・WG左右・STなど）ごとに、
#    ボールの位置（12×8のマス）と、自分のチームがボールを持っているかで、ふだんの位置から何mずれるか
#  - 向き：自分のチームが右（+x）へ攻める。y は画面と同じで下が＋（右サイド＝下）
import json, sys, os, subprocess, math
import numpy as np
work, out = sys.argv[1], sys.argv[2]
os.makedirs(work, exist_ok=True)
BASE = 'https://media.githubusercontent.com/media/SkillCorner/opendata/master/data'
RAW = 'https://raw.githubusercontent.com/SkillCorner/opendata/master/data'
ROLE = {'GK': 'GK-C', 'CB': 'CB-C', 'LCB': 'CB-L', 'RCB': 'CB-R', 'LB': 'SB-L', 'LWB': 'SB-L', 'RB': 'SB-R', 'RWB': 'SB-R',
        'DM': 'DM-C', 'CDM': 'DM-C', 'LDM': 'DM-L', 'RDM': 'DM-R', 'CM': 'CM-C', 'LCM': 'CM-L', 'RCM': 'CM-R',
        'AM': 'AM-C', 'CAM': 'AM-C', 'LAM': 'AM-L', 'RAM': 'AM-R', 'LM': 'WG-L', 'LW': 'WG-L', 'RM': 'WG-R', 'RW': 'WG-R',
        'CF': 'ST-C', 'ST': 'ST-C', 'LF': 'ST-L', 'RF': 'ST-R', 'LS': 'ST-L', 'RS': 'ST-R'}
NBX, NBY = 12, 8
acc = {}  # role -> dict of arrays
anchors = {}  # role -> [sumx, sumy, n]（試合ごとの、ふだんの位置）
def arr(role):
    if role not in acc: acc[role] = {k: np.zeros((2, NBX, NBY)) for k in ('sx', 'sy', 'sq', 'n')} | {'sp': []}
    return acc[role]
def get(url, path):
    subprocess.run(['curl', '-sS', '-L', '--retry', '3', '-o', path, url], check=True)
matches = json.load(open(get(RAW + '/matches.json', work + '/matches.json') or work + '/matches.json'))
used = 0
for mt in matches:
    mid = mt['id']; mj = f'{work}/{mid}_match.json'; tj = f'{work}/{mid}_tracking.jsonl'
    try:
        get(f'{RAW}/matches/{mid}/{mid}_match.json', mj); get(f'{BASE}/matches/{mid}/{mid}_tracking_extrapolated.jsonl', tj)
        meta = json.load(open(mj))
        if open(tj).read(40).startswith('version https://git-lfs'): raise RuntimeError('lfs pointer')
    except Exception as e:
        print('skip', mid, e); continue
    home = meta['home_team']['id']; sides = meta.get('home_team_side') or ['left_to_right', 'right_to_left']
    info = {}
    for p in meta['players']:
        r = (p.get('player_role') or {}).get('acronym')
        if r in ROLE: info[p['id']] = (ROLE[r], p['team_id'] == home)
    # 1回目：役割ごとの、ふだんの位置（チームの向きにそろえる）
    rows = []
    with open(tj) as f:
        for k, line in enumerate(f):
            if k % 2: continue  # 5回/秒にする
            fr = json.loads(line); per = fr.get('period'); b = fr['ball_data']
            if per not in (1, 2) or b['x'] is None: continue
            g = fr['possession']['group']
            if g not in ('home team', 'away team'): continue
            rows.append((per, b['x'], b['y'], g == 'home team', [(d['player_id'], d['x'], d['y']) for d in fr['player_data'] if d['player_id'] in info]))
    def tfm(per, isHome, x, y):
        ltr = sides[per - 1] == 'left_to_right'
        right = ltr if isHome else not ltr  # このチームが +x へ攻めているか
        X, Y = x + 52.5, 34 - y               # 画面の向き（左上が原点・下が＋）
        return (X, Y) if right else (105 - X, 68 - Y)
    anc = {}
    for per, bx, by, hp, pls in rows:
        for pid, x, y in pls:
            role, isH = info[pid]; X, Y = tfm(per, isH, x, y)
            a = anc.setdefault(pid, [0.0, 0.0, 0]); a[0] += X; a[1] += Y; a[2] += 1
    for pid, a in anc.items():
        if a[2] < 3000: continue
        r = anchors.setdefault(info[pid][0], [0.0, 0.0, 0]); r[0] += a[0] / a[2]; r[1] += a[1] / a[2]; r[2] += 1
    prev = {}
    for per, bx, by, hp, pls in rows:
        for pid, x, y in pls:
            role, isH = info[pid]; a = anc[pid]
            if a[2] < 3000: continue
            X, Y = tfm(per, isH, x, y); BX, BY = tfm(per, isH, bx, by)
            ib = min(NBX - 1, max(0, int(BX / (105 / NBX)))); jb = min(NBY - 1, max(0, int(BY / (68 / NBY))))
            own = 1 if hp == isH else 0
            dx, dy = X - a[0] / a[2], Y - a[1] / a[2]
            A = arr(role); A['sx'][own, ib, jb] += dx; A['sy'][own, ib, jb] += dy; A['sq'][own, ib, jb] += dx * dx + dy * dy; A['n'][own, ib, jb] += 1
            if pid in prev and len(A['sp']) < 400000:
                v = math.hypot(X - prev[pid][0], Y - prev[pid][1]) * 5
                if v < 11: A['sp'].append(v)
            prev[pid] = (X, Y)
    used += 1; print('match', mid, 'frames', len(rows), flush=True)
    os.remove(tj)
res = {'src': 'SkillCorner open data (A-League 2024/25 broadcast tracking)', 'matches': used, 'nbx': NBX, 'nby': NBY, 'roles': {}}
for role, A in acc.items():
    n = A['n']; mx = np.where(n > 0, A['sx'] / np.maximum(n, 1), 0); my = np.where(n > 0, A['sy'] / np.maximum(n, 1), 0)
    sd = np.sqrt(np.clip(np.where(n > 0, A['sq'] / np.maximum(n, 1) - mx ** 2 - my ** 2, 0), 0, None))
    sp = np.array(A['sp']) if A['sp'] else np.array([2.0])
    res['roles'][role] = {'dx': np.round(mx, 1).tolist(), 'dy': np.round(my, 1).tolist(), 'sd': np.round(sd, 1).tolist(), 'n': n.astype(int).tolist(),
                          'speed': [round(float(np.percentile(sp, q)), 2) for q in (50, 90, 99)],
                          'anchor': [round(anchors[role][0] / anchors[role][2], 1), round(anchors[role][1] / anchors[role][2], 1), anchors[role][2]] if role in anchors else None}
json.dump(res, open(out, 'w'), separators=(',', ':'))
print('matches', used, 'roles', sorted(res['roles']))
