import type { Pos, StyleName } from './constants';

export interface Player {
  id: number;
  name: string;
  age: number;
  pos: Pos;
  /** 8項目（小数を持つ。画面では切り捨て） */
  a: number[];
  /** ポテンシャル（隠れている。上限88） */
  pot: number;
  /** 成長期のはじまりの年齢と長さ（隠れている） */
  gStart: number;
  gLen: number;
  /** 下がり始める年齢（隠れている） */
  decl: number;
  apt: Record<Pos, number>;
  /** 適性を伸ばすための、そのポジションでの出場の積み上げ */
  aptXp: Partial<Record<Pos, number>>;
  sp: string[];
  bad: string[];
  exp: number;
  cond: number;
  fat: number;
  inj: number;
  /** 問134：その年のイエローの累積（L＝リーグ・C＝天皇杯）と、出場停止の残り試合 */
  yc?: { L: number; C: number }; ban?: { L: number; C: number };
  /** 出場停止・あと1枚になったことの知らせ（監督のメッセージにする） */
  banMsg?: string[];
  pref: string;
  height: number;
  foot: '右' | '左' | '両';
  origin: string;
  num: number;
  apps: number;
  goals: number;
  seasonApps: number;
  seasonGoals: number;
  /** シーズンの活躍（出場とゴールと評価の積み上げ。ポテンシャルの上下に使う） */
  seasonPerf: number;
  firstApp: string | null;
  firstGoal: string | null;
  req: boolean;
  played: boolean;
  injNew: boolean;
  /** 年ごとの伸びの記録 */
  hist: { y: number; ovr: number; a: number[] }[];
  /** 契約（残り年数）と給料（万円/年） */
  contract: number;
  salary: number;
  /** 移籍市場に出しているか */
  listed?: boolean;
  /** ユースの学年（1〜3）。トップの選手はなし */
  grade?: number;
  /** ユース：前の報告会議のときの能力（伸び方を言葉で見せるため） */
  snap?: number[];
  /** ユースの試合の記録（その月・通算） */
  mApps?: number; mGoals?: number; yApps?: number; yGoals?: number;
  /** 今季で引退する */
  retiring?: boolean;
  /** 練習生（あと何か月預かるか） */
  trialMonths?: number;
  /** オーナーから監督への頼み（問93） */
  ord?: { kind: 'start' | 'sub' | 'bench' | 'pos'; pos?: Pos };
  /** 監督の信頼（0〜100。問94）・クラブへの愛着（0〜100）・出番への不満（0〜100）・「移籍したい」と言っている（問95） */
  trust?: number; love?: number; unrest?: number; wantOut?: boolean;
  /** お気に入り（問103：トップとユース） */
  fav?: boolean;
  /** アシスト（通算・今季）と、今季の評価点の合計と試合数（問106・110） */
  ast?: number; seasonAst?: number; seasonRt?: number; seasonRtN?: number;
  /** 賞をとった名声（市場の値段が上がる。毎年半分になる：問111） */
  fame?: number;
  /** 年末の伸びしろの見立ての記録（問120） */
  potLog?: { y: number; arrow: string; why: string }[];
  /** 選手登録（試合に出られる23人：感想42）と、クラブに入った週 */
  reg?: boolean; joined?: number;
  /** 問124：コーチが見きわめた成長タイプ（わかるまではなし） */
  gType?: string;
  /** 表彰歴（年・賞・段・そのときのクラブ） */
  honors?: { y: number; title: string; tier: number; club: string }[];
  /** PC版：個別練習（重点にする項目の番号。なし＝全体練習に従う） */
  tf?: number;
  /** PC版：このクラブでの出場数とゴール（殿堂の判定に使う） */
  capps?: number; cgoals?: number;
}

export interface Manager {
  id: number;
  name: string;
  style: StyleName;
  forms: string[];
  /** 若手を使う好み（1より大きいほど若手を使う） */
  youth: number;
  /** 頼みを聞く素直さ（0〜1） */
  obey: number;
  /** 育てる腕前（1が平均） */
  grow: number;
  salary: number;
  age: number;
}

export type Token = string | { t: string; me: boolean } | { sp: string; t: string; me: boolean };
export type Line = Token[];

export interface ViewItem {
  min: number;
  kind: 'goal' | 'chance' | 'talk' | 'flow' | 'memo';
  /** 自分のクラブの攻めか */
  me: boolean;
  lines: Line[];
  goal?: { scorer: string; score: [number, number]; flow?: string | null; mem?: boolean; team: string; me: boolean };
  /** 実況・解説の言葉（問122） */
  who?: '実況' | '解説';
  /** 並べる順（同じ分の中で） */
  ord?: number;
  /** 試合の時計の秒（場面の始まり）と、行ごとの秒・見どころの大きさ */
  sec?: number; secs?: number[]; hv?: number;
}

export interface MatchView {
  title: string;
  home: { name: string; me: boolean; color: string };
  away: { name: string; me: boolean; color: string };
  score: [number, number];
  pk?: [number, number] | null;
  highlights: ViewItem[];
  full: ViewItem[];
  chances: [number, number];
  scorers: { name: string; min: number; me: boolean }[];
  /** オーナーの頼みを監督が聞いたか（問93） */
  orders?: { name: string; kind: string; heard: boolean }[];
  /** 自分のクラブの出場選手 */
  played: { id: number; name: string; pos: Pos; sub: boolean; goals: number; ast?: number; rt?: number; min?: number;
    st?: { pa: number; pc: number; tk: number; sh: number; ot: number; sv: number; dr: number; kp: number } }[];
  /** その試合でいちばんよかった選手（問108） */
  mom?: { name: string; me: boolean; rt: number; club: string };
  /** 試合のあとの実況と解説のふり返り（問122） */
  recap?: { who: '実況' | '解説'; line: Line }[];
  /** 問135：試合の数字（[ホーム, アウェー]） */
  stats?: Record<'poss' | 'sh' | 'ot' | 'pa' | 'pc' | 'ck' | 'fo' | 'yc' | 'rc' | 'off' | 'sv', [number, number]>;
  /** 問139：流れのグラフ（5分ごと・ホームが押していれば＋）と印 */
  flowG?: { pts: number[]; marks: { min: number; kind: 'goal' | 'red' | 'sub'; side: 0 | 1 }[] };
  /** 問139：シュートの位置（x は 0〜105、ホームは右のゴールへ攻める。y は 0〜68） */
  shots?: { min: number; side: 0 | 1; x: number; y: number; goal: boolean; ot: boolean; sp: boolean; who: string; how: string }[];
  /** 問138：自分の選手の1対1（場所ごとの勝ち負け） */
  duels?: { zone: string; me: string; opp: string; w: number; l: number; x: number; y: number }[];
  /** 問137：交代（理由と、入った選手のでき） */
  subs?: { min: number; side: 0 | 1; off: string; on: string; why: string; rt?: number; g?: number; a?: number }[];
  /** 問134：カード */
  cards?: { min: number; side: 0 | 1; who: string; red: boolean }[];
  /** 問133：自分のクラブのキッカー */
  kick?: { ck: string; fk: string; pk: string };
  /** PC版：両チームの先発（2Dのピッチ用。[ホーム, アウェー]） */
  lineups?: { name: string; num: number; pos: Pos; lr: 'L' | 'R' | 'C' }[][];
}

export interface ReportEntry {
  pid: number;
  ups: number[];
  before: number[];
  after: number[];
  awake: { i: number; from: number; to: number } | null;
  newSp: string | null;
  cured: string | null;
  injNew: boolean;
  aptUp: Pos | null;
}
