/* PRESS START のデータ。ゲームの中に出る文は docs/kaisha/nihongo.md の決まりで書く。 */

export const START_YEAR = 1980;
export const WEEKS_PER_MONTH = 4;
export const MONTHS = 12;
export const TICKS_PER_WEEK = 4; // 1週を4つに分けて進める（ふつうの速さで1週は約37秒）

/* ===== 職種と能力（問13・問17・問20） ===== */
export const STATS = [
  { key: "plan", name: "企画" },
  { key: "design", name: "デザイン" },
  { key: "prog", name: "プログラミング" },
  { key: "sound", name: "サウンド" },
  { key: "sales", name: "営業" },
  { key: "hire", name: "採用" },
  { key: "pr", name: "広報" },
];
export const ROLES = [
  { key: "planner", name: "プランナー", stat: "plan", dev: true },
  { key: "programmer", name: "プログラマー", stat: "prog", dev: true },
  { key: "designer", name: "デザイナー", stat: "design", dev: true },
  { key: "sounder", name: "サウンド", stat: "sound", dev: true },
  { key: "pr", name: "広報", stat: "pr", dev: false, dept: "広報部" },
  { key: "sales", name: "営業", stat: "sales", dev: false, dept: "営業部" },
  { key: "hr", name: "人事", stat: "hire", dev: false, dept: "人事部" },
];
export const roleOf = (k) => ROLES.find((r) => r.key === k);

/* 役職（問25）。経験がたまると上がり、給料も上がる */
export const RANKS = [
  { name: "社員", exp: 0, pay: 1.0 },
  { name: "主任", exp: 120, pay: 1.2 },
  { name: "課長", exp: 360, pay: 1.5 },
  { name: "部長", exp: 800, pay: 1.9 },
  { name: "役員", exp: 1600, pay: 2.5 },
];
export const LEADER_RANK = 2; // 課長から、チームのリーダーになれる

/* 性格（問27）。働き方に少し効く */
export const TRAITS = [
  { key: "night", name: "夜型", work: 1.08, tire: 1.1, line: ["夜のほうが集中できる", "朝はどうも頭が回らない", "今日も終電かな"] },
  { key: "calm", name: "のんびり屋", work: 0.92, tire: 0.7, line: ["まあ、間に合いますよ", "お茶、淹れてきますね", "焦ってもしかたないか"] },
  { key: "hasty", name: "せっかち", work: 1.12, tire: 1.25, line: ["もう次の準備をしてます", "このパソコン、遅くないですか", "早く仕上げたい"] },
  { key: "picky", name: "凝り性", work: 0.95, tire: 1.0, quality: 1.1, line: ["ここ、もう少し詰めたい", "もう一回だけ直させてください", "細かいところが気になる"] },
  { key: "moody", name: "気分屋", work: 1.0, tire: 1.0, swing: 0.25, line: ["今日は調子がいい", "今日はどうも乗らない", "晴れてると進むんですよね"] },
  { key: "kind", name: "世話好き", work: 0.98, tire: 1.0, team: 3, line: ["みなさん、ちゃんと寝てますか", "お菓子、置いておきますね", "何か手伝えることありますか"] },
  { key: "stubborn", name: "負けず嫌い", work: 1.03, tire: 1.05, grow: 1.15, line: ["ハガネ商会には負けたくない", "次こそ満点を取りたい", "まだ詰めが甘い"] },
  { key: "airy", name: "天然", work: 1.0, tire: 0.95, spark: 2, line: ["あれ、何をしようとしてたんだっけ", "さっきのメモ、どこに置いたかな", "いい案が浮かんだのに忘れた"] },
];
export const traitOf = (k) => TRAITS.find((t) => t.key === k);

/* 社員のふだんのひとこと（問72）。職種ごと・状態ごと */
export const LINES = {
  planner: ["この企画、通りそうな気がする", "メモがたまってきた", "最初の5分をどう見せるかだな", "ボス戦、もう少し山場を作りたい"],
  programmer: ["このバグ、どこから来てるんだ", "やっと動いた", "ここを直せばもう少し軽くなる", "今日はここまで組みたい"],
  designer: ["この色、もう少し調整したい", "主人公の顔がまだ決まらない", "背景、もう少し描き込みたい", "動きがちょっと硬いな"],
  sounder: ["このメロディ、使えるかも", "効果音、もう少し軽くしたい", "少し音を出してもいいですか", "ボス戦の曲、できました"],
  pr: ["雑誌の取材に行ってきます", "広告の見出し、どうしよう", "発売日、早めに決めたいですね", "広告の写真、どれにしよう"],
  sales: ["お店を回ってきます", "店長さんに顔を覚えてもらえた", "また問い合わせの電話だ", "置いてくれるお店が増えました"],
  hr: ["いい人、来てくれないかな", "面接、何を聞こう", "みなさん、疲れてませんか", "求人の張り紙、出してきました"],
  tired: ["眠い……", "少し休みたい", "目が疲れた", "コーヒー、もう一杯"],
  happy: ["売れてるって聞きました", "次も作りたいですね", "今日は調子がいい"],
  low: ["最近、どうも乗らない", "給料日、まだかな", "少し相談したいことがあって"],
  idle: ["お昼、何にしよう", "次は何を作るんだろう", "机の上、片づけておこう", "次の仕事、まだですか"],
};

/* ===== 名前 ===== */
export const FAMILY = ["佐藤", "鈴木", "高橋", "田中", "伊藤", "渡辺", "山本", "中村", "小林", "加藤", "吉田", "山田", "佐々木", "山口", "松本", "井上", "木村", "林", "清水", "山崎", "森", "池田", "橋本", "阿部", "石川", "前田", "藤田", "小川", "岡田", "後藤", "長谷川", "村上", "近藤", "石井", "坂本", "遠藤", "青木", "藤井", "西村", "福田", "太田", "三浦", "岡本", "松田", "中島", "原田", "小野", "竹内", "金子", "和田"];
export const GIVEN = ["陽太", "健", "大輔", "翔", "誠", "拓也", "浩", "隆", "亮", "直樹", "修", "剛", "哲也", "悠", "蓮", "湊", "樹", "慎吾", "和也", "勇気", "美咲", "陽子", "恵", "彩", "優子", "真由美", "千尋", "舞", "香織", "麻衣", "由紀", "智子", "葵", "結衣", "楓", "さくら", "明日香", "奈々", "瞳", "沙織"];

/* ===== ジャンルとテーマ（問16） ===== */
// long：レビューで使う呼び名。fg・fb：レビューで使う、良いとき・惜しいときの言い方（言い切りの形。後ろに「と感じました」「のが惜しい」が付いても読めるように）
export const GENRES = [
  { key: "rpg", name: "RPG", long: "RPG", fg: "戦闘のテンポがいい", fb: "戦闘が途中から単調になる", from: 1980, size: 1.2 },
  { key: "act", name: "アクション", long: "アクション", fg: "操作の手ざわりがいい", fb: "操作に少しもたつきがある", from: 1980, size: 1.0 },
  { key: "pzl", name: "パズル", long: "パズル", fg: "解けたときの気持ちよさがある", fb: "問題の難しさにむらがある", from: 1980, size: 0.7 },
  { key: "stg", name: "シューティング", long: "シューティング", fg: "撃ち心地がいい", fb: "敵の出方に変化が少ない", from: 1980, size: 0.9 },
  { key: "race", name: "レース", long: "レースゲーム", fg: "スピード感がしっかり出ている", fb: "コースごとの違いが感じにくい", from: 1980, size: 1.0 },
  { key: "spt", name: "スポーツ", long: "スポーツゲーム", fg: "試合の盛り上がりがよく出ている", fb: "試合運びが単調になる", from: 1980, size: 1.0 },
  { key: "adv", name: "アドベンチャー", long: "アドベンチャー", fg: "謎解きの組み立てがうまい", fb: "謎解きの手がかりが少ない", from: 1980, size: 1.0 },
  { key: "sim", name: "シミュレーション", long: "シミュレーション", fg: "じっくり考える楽しさがある", fb: "やることが早めに決まってしまう", from: 1982, size: 1.1 },
  { key: "fgt", name: "格闘", long: "格闘ゲーム", fg: "読み合いが熱い", fb: "キャラごとの差が小さい", from: 1986, size: 1.0 },
  { key: "mus", name: "音楽", long: "音楽ゲーム", fg: "曲に合わせて叩くのが気持ちいい", fb: "譜面に変化が少ない", from: 1988, size: 0.8 },
];
// tg・tb：レビューで使う、題材が生きたとき・生きなかったときの言い方。good は相性のいいジャンル、bad は悪いジャンル
export const THEMES = [
  { key: "space", name: "宇宙", tg: "宇宙の広さがよく出ている", tb: "宇宙である意味が薄い", words: ["コスモ", "スター", "ほしぞら", "ギャラクシー"], good: ["stg", "rpg", "sim"], bad: ["spt", "mus"] },
  { key: "ninja", name: "忍者", tg: "忍び込むときの緊張がよく出ている", tb: "忍者らしさが見た目だけで終わっている", words: ["シノビ", "影丸", "忍法", "カゲ"], good: ["act", "fgt", "adv"], bad: ["race", "mus"] },
  { key: "cat", name: "猫", tg: "猫のしぐさがかわいい", tb: "猫である意味があまりない", words: ["ねこ", "ニャン", "こねこ", "タマ"], good: ["pzl", "adv", "mus"], bad: ["stg", "fgt"] },
  { key: "school", name: "学校", tg: "放課後の空気がよく出ている", tb: "学校が舞台である意味が薄い", words: ["がっこう", "放課後", "学園", "1年2組"], good: ["adv", "sim", "spt"], bad: ["stg", "race"] },
  { key: "pirate", name: "海賊", tg: "海へ漕ぎ出す気分が味わえる", tb: "海賊らしい荒っぽさが足りない", words: ["パイレーツ", "海賊王", "うみねこ", "キャプテン"], good: ["rpg", "act", "sim"], bad: ["pzl", "mus"] },
  { key: "dino", name: "恐竜", tg: "恐竜の迫力がある", tb: "恐竜の大きさが伝わってこない", words: ["ダイノ", "きょうりゅう", "ジュラ", "ティラノ"], good: ["act", "race", "rpg"], bad: ["adv", "mus"] },
  { key: "robot", name: "ロボット", tg: "ロボットの重量感がよく出ている", tb: "ロボットが軽く見える", words: ["メカ", "ロボ", "鉄人", "ギア"], good: ["stg", "fgt", "sim"], bad: ["pzl", "spt"] },
  { key: "detective", name: "探偵", tg: "犯人を追いつめていく流れがいい", tb: "推理の部分があっさりしている", words: ["探偵", "名推理", "事件簿", "ホームズ"], good: ["adv", "pzl"], bad: ["race", "stg", "spt"] },
  { key: "cook", name: "料理", tg: "料理がおいしそうに見える", tb: "料理である意味が薄い", words: ["キッチン", "ごはん", "シェフ", "おべんとう"], good: ["pzl", "sim", "mus"], bad: ["fgt", "stg"] },
  { key: "ghost", name: "お化け", tg: "ぞっとする場面の作り方がうまい", tb: "怖さが足りない", words: ["おばけ", "ゴースト", "怪談", "百物語"], good: ["adv", "act"], bad: ["spt", "race"] },
  { key: "magic", name: "魔法", tg: "呪文を唱える楽しさがある", tb: "魔法の種類が少ない", words: ["マジカル", "まほう", "ウィザード", "ルーン"], good: ["rpg", "pzl", "fgt"], bad: ["race", "spt"] },
  { key: "train", name: "電車", tg: "線路をつなぐ楽しさがある", tb: "電車である意味が薄い", words: ["トレイン", "でんしゃ", "鉄道", "急行"], good: ["sim", "race", "pzl"], bad: ["fgt", "rpg"] },
  { key: "sport", name: "野球", tg: "球場の熱気が伝わってくる", tb: "野球らしい駆け引きが足りない", words: ["ベースボール", "やきゅう", "スタジアム", "ホームラン"], good: ["spt", "sim"], bad: ["rpg", "adv", "stg"] },
  { key: "bug", name: "昆虫", tg: "虫を探す楽しさがある", tb: "虫の種類が少ない", words: ["むし", "カブト", "インセクト", "クワガタ"], good: ["act", "adv", "pzl"], bad: ["fgt", "spt"] },
];
// ジャンルごとのタイトルの後ろの言葉
export const GENRE_TAIL = {
  rpg: ["クエスト", "物語", "伝説", "サーガ"], act: ["アタック", "ジャンプ", "大冒険", "ラン"], pzl: ["パズル", "ならべ", "ブロック", "あつめ"],
  stg: ["シューター", "ストライク", "ブラスト", "迎撃隊"], race: ["レーサー", "グランプリ", "ラリー", "ダッシュ"], spt: ["スタジアム", "リーグ", "チャンピオン", "選手権"],
  adv: ["の謎", "ミステリー", "の館", "探検記"], sim: ["シティ", "マスター", "の国", "経営記"], fgt: ["ファイター", "バトル", "拳", "決闘"], mus: ["リズム", "ビート", "の音楽会", "ステップ"],
};

/* ===== 架空のゲーム機（問14） ===== */
// peak：いちばん広まったときの台数（万台）。fee：1本出すのにかかるお金（万円）
export const CONSOLES = [
  { key: "lumina", name: "ルミナ88", kind: "パソコン", year: 1978, peak: 150, rise: 5, life: 12, fee: 0, color: "#3d4a59" },
  { key: "pico", name: "ピコステーション", kind: "据え置き", year: 1983, peak: 1400, rise: 4, life: 10, fee: 40, color: "#e0e8ef" },
  { key: "pocket", name: "ポケットピコ", kind: "携帯機", year: 1989, peak: 1800, rise: 4, life: 10, fee: 60, color: "#9fb6c8" },
  { key: "superpico", name: "スーパーピコ", kind: "据え置き", year: 1990, peak: 1600, rise: 4, life: 8, fee: 120, color: "#b9c9d6" },
  { key: "neogear", name: "ネオギア", kind: "据え置き", year: 1994, peak: 2000, rise: 4, life: 9, fee: 300, color: "#3d4a59" },
  { key: "stella", name: "ステラ", kind: "据え置き", year: 2000, peak: 2400, rise: 4, life: 9, fee: 600, color: "#1d3557" },
  { key: "pocket2", name: "ポケットピコ2", kind: "携帯機", year: 2004, peak: 2800, rise: 4, life: 9, fee: 400, color: "#e86a6a" },
  { key: "stella2", name: "ステラ2", kind: "据え置き", year: 2009, peak: 2600, rise: 4, life: 9, fee: 1200, color: "#1d3557" },
  { key: "phone", name: "ピコフォン", kind: "スマホ", year: 2012, peak: 5000, rise: 5, life: 30, fee: 100, color: "#2f7fc1" },
];
export const CONSOLE_PRICE = { "パソコン": 0.25, "据え置き": 0.14, "携帯機": 0.12, "スマホ": 0.05 }; // 1本売れて会社に入るお金（万円）

/* ===== 規模（問12） ===== */
export const SIZES = [
  { key: "small", name: "小品", weeks: 12, cost: 80, pts: 1.0, sales: 0.6, exp: 1.0 },
  { key: "mid", name: "ふつう", weeks: 24, cost: 200, pts: 2.1, sales: 1.0, exp: 1.6 },
  { key: "big", name: "大作", weeks: 48, cost: 600, pts: 4.4, sales: 1.9, exp: 2.6 },
];

/* ===== 事務所（問36・問40）。最初の版は③まで ===== */
export const OFFICES = [
  { name: "自宅のガレージ", short: "ガレージ", cap: 2, rent: 3, move: 0, room: 4 },
  { name: "アパートの一室", short: "アパート", cap: 5, rent: 12, move: 300, room: 5 },
  { name: "雑居ビルの小さな事務所", short: "雑居ビル", cap: 10, rent: 40, move: 2000, room: 7 },
];
export const LOAN_LIMIT = [300, 1000, 3000]; // 事務所ごとに借りられる上限（万円）
export const LOAN_RATE = 0.06; // 年の利子

/* ===== ライバル（問32） ===== */
export const RIVALS = [
  { key: "hagane", name: "ハガネ商会", power: 1.15, genres: ["act", "stg", "fgt"] },
  { key: "aoba", name: "青葉ソフト", power: 1.0, genres: ["rpg", "adv"] },
  { key: "mitsuboshi", name: "ミツボシ電子", power: 1.3, genres: ["race", "spt", "sim"] },
  { key: "namiki", name: "ナミキゲームス", power: 0.85, genres: ["pzl", "mus", "act"] },
  { key: "kuroneko", name: "くろねこ堂", power: 0.7, genres: ["adv", "pzl", "rpg"] },
];

/* ===== 評論家（問41・問73・問90） ===== */
// レビューは3文：intro（どんなゲームか）＋良いところ＋惜しいところ（but でつなぐ）。
// 点が高いときは 良いところ＋top、低いときは 惜しいところ＋low。
// {fg}{fb}：ジャンルの言い方、{tg}{tb}：題材の言い方、{theme}：題材の名前、{long}：ジャンルの呼び名
// look：重く見るところ
export const CRITICS = [
  {
    name: "星野", look: { fun: 1.4, combo: 1.2, gfx: 0.7, snd: 0.6, vol: 0.9 }, but: "ただ、",
    intro: ["{theme}を題材にした{long}だ。", "{theme}ものの{long}。"],
    lines: {
      fun: { good: ["{fg}。", "最後まで手が止まらなかった。", "基本の遊びがよくできている。"], bad: ["{fb}。", "中盤から同じことのくり返しになる。", "遊びにもう一工夫ほしい。"] },
      combo: { good: ["{tg}。", "{theme}と{long}の組み合わせがうまい。"], bad: ["{tb}。", "{theme}と{long}がかみ合っていない。"] },
      gfx: { good: ["絵に手間がかかっている。", "画面がよく整理されている。"], bad: ["絵がやや物足りない。", "画面が見づらい。"] },
      snd: { good: ["曲が場面に合っている。", "音の使い方がうまい。"], bad: ["音がさびしい。", "曲が場面に合っていない。"] },
      vol: { good: ["遊びごたえは十分だ。", "長く遊べる。"], bad: ["すぐに終わってしまう。", "遊べる量が少ない。"] },
    },
    top: ["今年の1本に挙げたい。", "文句なしの出来だ。"], low: ["人には勧めにくい。", "もう一度作り直してほしい。"],
  },
  {
    name: "岩田", look: { snd: 1.6, fun: 1.0, gfx: 0.7, combo: 0.8, vol: 0.7 }, but: "ただ、",
    intro: ["{theme}の{long}。", "{theme}が題材の{long}。"],
    lines: {
      snd: { good: ["曲がいい。", "効果音が気持ちいい。", "耳に残る曲がある。"], bad: ["曲が耳に残らない。", "音が単調だ。", "効果音が軽い。"] },
      fun: { good: ["{fg}。", "遊びは素直でいい。"], bad: ["{fb}。", "遊びが薄い。"] },
      gfx: { good: ["画面は見やすい。", "絵は丁寧だ。"], bad: ["画面が地味だ。", "絵が粗い。"] },
      combo: { good: ["{tg}。", "題材は面白い。"], bad: ["{tb}。", "題材と遊びがずれている。"] },
      vol: { good: ["長く遊べる。", "量は十分だ。"], bad: ["短い。", "あっという間に終わる。"] },
    },
    top: ["久しぶりに夢中になった。", "文句なしに楽しめた。"], low: ["正直、退屈だった。", "残念な出来だ。"],
  },
  {
    name: "松本", look: { fun: 1.1, vol: 1.2, combo: 1.0, gfx: 0.9, snd: 0.8 }, but: "ただ、",
    intro: ["{theme}が題材の{long}です。", "今回は{theme}の{long}です。"],
    lines: {
      fun: { good: ["{fg}と感じました。", "遊んでいて素直に楽しいです。", "操作にすぐなじめます。"], bad: ["{fb}のが残念でした。", "序盤が少し長いです。", "少し難しすぎます。"] },
      vol: { good: ["ボリュームもしっかりあります。", "やり込める要素が多いです。"], bad: ["もう少し遊びたかったです。", "あっさり終わってしまいます。"] },
      combo: { good: ["{tg}と感じました。", "{theme}が好きな人にはうれしい作りです。"], bad: ["{tb}のが残念でした。", "{theme}である必要は感じませんでした。"] },
      gfx: { good: ["絵もきれいです。", "画面が見やすいです。"], bad: ["絵が少し古く見えます。", "画面がごちゃごちゃしています。"] },
      snd: { good: ["曲も場面に合っています。", "音の使い方が上手です。"], bad: ["曲がやや弱いです。", "音が少し単調です。"] },
    },
    top: ["誰にでも勧められる1本です。", "いい1本です。"], low: ["誰にでも勧めるのは難しいです。", "次回作に期待します。"],
  },
  {
    name: "大野", look: { gfx: 1.6, combo: 1.0, fun: 0.9, snd: 0.7, vol: 0.8 }, but: "でも、",
    intro: ["{theme}を題材にした{long}。", "{theme}ものの{long}だ。"],
    lines: {
      gfx: { good: ["絵の描き込みがすごい。", "キャラの表情がよく描けている。", "色づかいがきれいだ。"], bad: ["絵が粗い。", "見た目で損をしている。", "キャラの顔がいまひとつだ。"] },
      combo: { good: ["{tg}と思う。", "{theme}の雰囲気が絵からも伝わる。"], bad: ["{tb}のが惜しい。", "絵から{theme}らしさが伝わってこない。"] },
      fun: { good: ["{fg}と思う。", "遊びも手堅い。"], bad: ["{fb}のが惜しい。", "遊びはもうひと息。"] },
      snd: { good: ["音も絵に合っている。", "曲も悪くない。"], bad: ["音が絵に負けている。", "曲が弱い。"] },
      vol: { good: ["長く遊べる。"], bad: ["少し短い。", "すぐに終わってしまう。"] },
    },
    top: ["ずっと眺めていたくなる。", "絵だけでも買う価値がある。"], low: ["もう少し丁寧に作ってほしかった。", "次に期待したい。"],
  },
];

/* ===== 開発の方針（問18・問82・問93） ===== */
export const BRANCHES = [
  { key: "gfx", label: "絵を作り込む", effect: { gfx: 1.35 }, weeks: 1, hint: ["絵↑", "＋1週"] },
  { key: "snd", label: "音を作り込む", effect: { snd: 1.35 }, weeks: 1, hint: ["音↑", "＋1週"] },
  { key: "fun", label: "面白さを詰める", effect: { fun: 1.25 }, weeks: 2, hint: ["面白さ↑", "＋2週"] },
  { key: "fast", label: "納期を早める", effect: { fun: 0.9 }, weeks: -2, hint: ["−2週", "面白さ↓"] },
  { key: "vol", label: "ボリュームを増やす", effect: { vol: 1.3 }, weeks: 2, hint: ["ボリューム↑", "＋2週"] },
  { key: "polish", label: "仕上げを丁寧に", effect: { fun: 1.08, gfx: 1.08, snd: 1.08 }, weeks: 1, hint: ["全体が少し↑", "＋1週"] },
];
export const BRANCH_STAGE = ["序盤", "中盤", "終盤"];
export const BRANCH_ASK = ["ここから、どこに力を入れますか", "このあと、何を優先しますか", "最後に、どこを詰めますか"];

/* ===== 受託の仕事（問31） ===== */
export const CONTRACTS = [
  "学習ソフト", "社内向けの計算ソフト", "店頭の案内画面", "パソコン教室の教材", "展示会用のデモ",
  "ゲームの移植", "効果音の制作", "ロゴの制作",
];
export const CLIENTS = ["丸三工業", "大和書房", "東西電機", "みどり銀行", "さくら百貨店", "北斗通信", "海原商事", "ひかり学習社"];

/* ===== 節目の目標（問37） ===== */
export const GOALS = [
  { key: "firstRelease", text: "初めてのゲームを発売する", reward: 50 },
  { key: "staff3", text: "社員を3人にする", reward: 30 },
  { key: "sell1", text: "1万本売れるゲームを出す", reward: 80 },
  { key: "office1", text: "アパートに引っ越す", reward: 50 },
  { key: "review30", text: "レビューで合計30点を取る", reward: 150 },
  { key: "year5000", text: "1年の売上を¥5,000万にする", reward: 200 },
  { key: "staff8", text: "社員を8人にする", reward: 150 },
  { key: "office2", text: "雑居ビルに引っ越す", reward: 300 },
  { key: "sell10", text: "10万本売れるゲームを出す", reward: 500 },
  { key: "rank5", text: "業界で5位以内に入る", reward: 500 },
  { key: "award", text: "ゲーム大賞を取る", reward: 1000 },
  { key: "sell100", text: "100万本売れるゲームを出す", reward: 2000 },
  { key: "review40", text: "レビューで満点（40点）を取る", reward: 3000 },
  { key: "rank1", text: "業界1位になる", reward: 5000 },
];
