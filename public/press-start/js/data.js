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
  { key: "night", name: "夜型", work: 1.08, tire: 1.1, line: ["夜のほうがはかどるんですよね", "朝はまだ頭が起きてない", "終電、何時だっけ"] },
  { key: "calm", name: "のんびり屋", work: 0.92, tire: 0.7, line: ["まあ、なんとかなりますよ", "お茶、いれてきます", "急がば回れって言うし"] },
  { key: "hasty", name: "せっかち", work: 1.12, tire: 1.25, line: ["もう次のこと考えてます", "このパソコン、遅くないですか", "早く仕上げたい"] },
  { key: "picky", name: "凝り性", work: 0.95, tire: 1.0, quality: 1.1, line: ["ここの1ドット、気になる", "もう一回だけ直させてください", "細かいところが大事なんです"] },
  { key: "moody", name: "気分屋", work: 1.0, tire: 1.0, swing: 0.25, line: ["今日は乗ってる気がする", "なんか今日はだめだ", "天気がいいと進むんですよ"] },
  { key: "kind", name: "世話好き", work: 0.98, tire: 1.0, team: 3, line: ["みんな、ちゃんと寝てる？", "おやつ買ってきました", "手伝えることあったら言って"] },
  { key: "stubborn", name: "負けず嫌い", work: 1.03, tire: 1.05, grow: 1.15, line: ["ハガネ商会には負けたくない", "次は満点を取る", "まだまだです"] },
  { key: "airy", name: "天然", work: 1.0, tire: 0.95, spark: 2, line: ["あれ、いま何の話でしたっけ", "猫の動画、見ます？", "ひらめいた気がしたけど忘れた"] },
];
export const traitOf = (k) => TRAITS.find((t) => t.key === k);

/* 社員のふだんのひとこと（問72）。職種ごと・状態ごと */
export const LINES = {
  planner: ["この企画、通る気がする", "メモ帳がもう足りない", "面白いって、なんだろう", "ボスの場面、もう少し盛りたい"],
  programmer: ["バグがひとつ消えて、ふたつ出た", "動いた。なんで動いたかはわからない", "キーボードの音が好きなんです", "あと少しで速くなる"],
  designer: ["この色、もうちょっといける気がする", "主人公の顔、まだ決まらない", "ドット打つの、楽しい", "背景を描きこみたい"],
  sounder: ["頭の中で曲が鳴ってる", "効果音って奥が深い", "ピコピコ鳴らしてもいいですか", "ボスの曲、できました"],
  pr: ["雑誌の人と会ってきます", "見出しを考えるのが好き", "発売日、早く決めたい", "広告の写真、どれにしよう"],
  sales: ["お店を回ってきます", "店長さんに覚えてもらえた", "電話、また鳴ってる", "置いてくれるお店が増えた"],
  hr: ["いい人、来てくれないかな", "面接って緊張するんですよ", "みんなの顔色、見てます", "求人の紙、貼ってきました"],
  tired: ["眠い……", "ちょっと休みたい", "目がしょぼしょぼする", "コーヒー、もう一杯"],
  happy: ["売れてるって聞きました", "次も作りたい", "なんだか体が軽い"],
  low: ["最近、楽しくないな", "給料日、まだかな", "ちょっと考えたいことがあって"],
  idle: ["お昼、何にしようかな", "何か作りたいなあ", "掃除でもしようかな", "次の仕事、まだですか"],
};

/* ===== 名前 ===== */
export const FAMILY = ["佐藤", "鈴木", "高橋", "田中", "伊藤", "渡辺", "山本", "中村", "小林", "加藤", "吉田", "山田", "佐々木", "山口", "松本", "井上", "木村", "林", "清水", "山崎", "森", "池田", "橋本", "阿部", "石川", "前田", "藤田", "小川", "岡田", "後藤", "長谷川", "村上", "近藤", "石井", "坂本", "遠藤", "青木", "藤井", "西村", "福田", "太田", "三浦", "岡本", "松田", "中島", "原田", "小野", "竹内", "金子", "和田"];
export const GIVEN = ["陽太", "健", "大輔", "翔", "誠", "拓也", "浩", "隆", "亮", "直樹", "修", "剛", "哲也", "悠", "蓮", "湊", "樹", "慎吾", "和也", "勇気", "美咲", "陽子", "恵", "彩", "優子", "真由美", "千尋", "舞", "香織", "麻衣", "由紀", "智子", "葵", "結衣", "楓", "さくら", "明日香", "奈々", "瞳", "沙織"];

/* ===== ジャンルとテーマ（問16） ===== */
// bit：評論家の感想で使う、そのジャンルの「見どころ」
export const GENRES = [
  { key: "rpg", name: "RPG", bit: "戦い", from: 1980, size: 1.2 },
  { key: "act", name: "アクション", bit: "操作の気持ちよさ", from: 1980, size: 1.0 },
  { key: "pzl", name: "パズル", bit: "手ごたえ", from: 1980, size: 0.7 },
  { key: "stg", name: "シューティング", bit: "撃ち心地", from: 1980, size: 0.9 },
  { key: "race", name: "レース", bit: "スピード感", from: 1980, size: 1.0 },
  { key: "spt", name: "スポーツ", bit: "試合の流れ", from: 1980, size: 1.0 },
  { key: "adv", name: "アドベンチャー", bit: "謎解き", from: 1980, size: 1.0 },
  { key: "sim", name: "シミュレーション", bit: "考えどころ", from: 1982, size: 1.1 },
  { key: "fgt", name: "格闘", bit: "駆け引き", from: 1986, size: 1.0 },
  { key: "mus", name: "音楽", bit: "リズム", from: 1988, size: 0.8 },
];
// bit：そのテーマの「らしさ」。good は相性のいいジャンル、bad は悪いジャンル
export const THEMES = [
  { key: "space", name: "宇宙", bit: "宇宙の広さ", words: ["コスモ", "スター", "ほしぞら", "ギャラクシー"], good: ["stg", "rpg", "sim"], bad: ["spt", "mus"] },
  { key: "ninja", name: "忍者", bit: "忍び込むときの緊張", words: ["シノビ", "影丸", "忍法", "カゲ"], good: ["act", "fgt", "adv"], bad: ["race", "mus"] },
  { key: "cat", name: "猫", bit: "猫のしぐさ", words: ["ねこ", "ニャン", "こねこ", "タマ"], good: ["pzl", "adv", "mus"], bad: ["stg", "fgt"] },
  { key: "school", name: "学校", bit: "放課後の空気", words: ["がっこう", "放課後", "学園", "1年2組"], good: ["adv", "sim", "spt"], bad: ["stg", "race"] },
  { key: "pirate", name: "海賊", bit: "海に出るときの高ぶり", words: ["パイレーツ", "海賊王", "うみねこ", "キャプテン"], good: ["rpg", "act", "sim"], bad: ["pzl", "mus"] },
  { key: "dino", name: "恐竜", bit: "恐竜の大きさ", words: ["ダイノ", "きょうりゅう", "ジュラ", "ティラノ"], good: ["act", "race", "rpg"], bad: ["adv", "mus"] },
  { key: "robot", name: "ロボット", bit: "ロボットの重さ", words: ["メカ", "ロボ", "鉄人", "ギア"], good: ["stg", "fgt", "sim"], bad: ["pzl", "spt"] },
  { key: "detective", name: "探偵", bit: "犯人を追いつめる流れ", words: ["探偵", "名推理", "事件簿", "ホームズ"], good: ["adv", "pzl"], bad: ["race", "stg", "spt"] },
  { key: "cook", name: "料理", bit: "おいしそうな見た目", words: ["キッチン", "ごはん", "シェフ", "おべんとう"], good: ["pzl", "sim", "mus"], bad: ["fgt", "stg"] },
  { key: "ghost", name: "お化け", bit: "ぞっとする間", words: ["おばけ", "ゴースト", "怪談", "百物語"], good: ["adv", "act"], bad: ["spt", "race"] },
  { key: "magic", name: "魔法", bit: "呪文を唱える楽しさ", words: ["マジカル", "まほう", "ウィザード", "ルーン"], good: ["rpg", "pzl", "fgt"], bad: ["race", "spt"] },
  { key: "train", name: "電車", bit: "線路がつながる楽しさ", words: ["トレイン", "でんしゃ", "鉄道", "急行"], good: ["sim", "race", "pzl"], bad: ["fgt", "rpg"] },
  { key: "sport", name: "野球", bit: "球場のにぎわい", words: ["ベースボール", "やきゅう", "スタジアム", "ホームラン"], good: ["spt", "sim"], bad: ["rpg", "adv", "stg"] },
  { key: "bug", name: "昆虫", bit: "虫を見つけたときのうれしさ", words: ["むし", "カブト", "インセクト", "クワガタ"], good: ["act", "adv", "pzl"], bad: ["fgt", "spt"] },
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

/* ===== 評論家（問41・問73） ===== */
// look：重く見るところ。lines：見るところごとの、良いとき・惜しいときの言い方
export const CRITICS = [
  {
    name: "星野", look: { fun: 1.4, combo: 1.2, gfx: 0.7, snd: 0.6, vol: 0.9 },
    lines: {
      fun: { good: ["{gbit}がよく練られている。", "最後まで手が止まらなかった。", "遊びの芯がしっかりしている。"], bad: ["{gbit}が単調なのが惜しい。", "途中で同じことのくり返しになる。", "{gbit}に工夫がほしい。"] },
      combo: { good: ["{tbit}はよく出ている。", "{theme}を選んだのが効いている。", "{theme}と{genre}の組み合わせがうまい。"], bad: ["{theme}である意味が薄い。", "{theme}と{genre}がかみ合っていない。", "題材を生かしきれていない。"] },
      gfx: { good: ["絵に手間がかかっている。", "画面がよく整っている。"], bad: ["絵がもう少しほしい。", "画面が見づらい。"] },
      snd: { good: ["音もいい。", "曲が場面に合っている。"], bad: ["音が少しさびしい。", "曲が場面に合っていない。", "効果音が物足りない。"] },
      vol: { good: ["遊びごたえは十分だ。", "長く遊べる。"], bad: ["すぐ終わってしまう。", "量が少ない。"] },
    },
    top: ["今年の1本に入れたい。", "文句なし。"], low: ["人には勧めにくい。", "もう一度、作り直してほしい。"],
  },
  {
    name: "岩田", look: { snd: 1.6, fun: 1.0, gfx: 0.7, combo: 0.8, vol: 0.7 },
    lines: {
      snd: { good: ["曲がいい。", "効果音が気持ちいい。", "耳に残る曲がある。"], bad: ["曲が耳に残らない。", "音が単調。", "効果音が軽い。", "音がうるさい。"] },
      fun: { good: ["{gbit}は悪くない。", "遊びは素直。"], bad: ["{gbit}が弱い。", "遊びが薄い。"] },
      gfx: { good: ["画面は見やすい。", "絵は丁寧。"], bad: ["画面がちょっと地味。", "絵が粗い。"] },
      combo: { good: ["{tbit}がいい。", "題材は面白い。"], bad: ["{theme}らしさが足りない。", "題材と遊びがずれている。"] },
      vol: { good: ["長く遊べる。", "量は十分。"], bad: ["短い。", "あっという間。"] },
    },
    top: ["それだけで最後まで遊べた。", "サントラがほしい。"], low: ["音を消して遊んだ。", "残念。"],
  },
  {
    name: "松本", look: { fun: 1.1, vol: 1.2, combo: 1.0, gfx: 0.9, snd: 0.8 },
    lines: {
      fun: { good: ["遊んでいて素直に楽しいです。", "{gbit}がよくできています。", "操作になじみやすいです。"], bad: ["序盤が長いです。", "{gbit}にもう一工夫ほしいです。", "少し難しすぎます。"] },
      vol: { good: ["ボリュームもしっかりあります。", "やりこむところが多いです。"], bad: ["もう少し遊びたかったです。", "あっさり終わります。"] },
      combo: { good: ["{tbit}がうまく出ています。", "{theme}が好きな人にはたまらないと思います。"], bad: ["{theme}を生かしきれていません。", "{theme}である必要を感じませんでした。"] },
      gfx: { good: ["絵もきれいです。", "画面が見やすいです。"], bad: ["絵が少し古く見えます。", "画面がごちゃごちゃしています。"] },
      snd: { good: ["曲も合っています。", "音の使い方が上手です。"], bad: ["曲がやや弱いです。", "音が少し単調です。"] },
    },
    top: ["でも、抜けた先は面白いです。", "いい1本です。"], low: ["誰にでも勧めるのは難しいです。", "次に期待します。"],
  },
  {
    name: "大野", look: { gfx: 1.6, combo: 1.0, fun: 0.9, snd: 0.7, vol: 0.8 },
    lines: {
      gfx: { good: ["絵の描きこみがすごいね。", "キャラが生きてる。", "色づかいがきれいだね。"], bad: ["絵が荒いね。", "見た目で損してる。", "キャラの顔が残念だね。"] },
      combo: { good: ["{tbit}が絵からも伝わる。", "{theme}の雰囲気がいいね。"], bad: ["{theme}の絵に見えないね。", "{theme}らしさが薄いね。"] },
      fun: { good: ["{gbit}も楽しい。", "遊びも手堅い。"], bad: ["{gbit}は物足りない。", "遊びはもうひと息。"] },
      snd: { good: ["音も合ってる。", "曲も悪くないね。"], bad: ["音が弱いね。", "曲が絵に負けてる。"] },
      vol: { good: ["長く遊べるね。"], bad: ["ちょっと短いね。", "すぐ終わっちゃう。"] },
    },
    top: ["ずっと眺めていたい。", "絵だけでも買う価値がある。"], low: ["もう少し丁寧に作ってほしい。", "次に期待しておく。"],
  },
];

/* ===== 分かれ道（問18） ===== */
export const BRANCHES = [
  { key: "gfx", label: "絵に力を入れる", effect: { gfx: 1.35 }, weeks: 1, hint: ["絵↑", "＋1週"] },
  { key: "snd", label: "音楽に力を入れる", effect: { snd: 1.35 }, weeks: 1, hint: ["音↑", "＋1週"] },
  { key: "fun", label: "遊びを練り直す", effect: { fun: 1.25 }, weeks: 2, hint: ["面白さ↑", "＋2週"] },
  { key: "fast", label: "早く仕上げる", effect: { fun: 0.9 }, weeks: -2, hint: ["−2週", "面白さ↓"] },
  { key: "vol", label: "遊べる量を増やす", effect: { vol: 1.3 }, weeks: 2, hint: ["量↑", "＋2週"] },
  { key: "polish", label: "細かいところを直す", effect: { fun: 1.08, gfx: 1.08, snd: 1.08 }, weeks: 1, hint: ["全部少し↑", "＋1週"] },
];
export const BRANCH_STAGE = ["開発のはじめ", "開発の中ごろ", "仕上げ"];
export const BRANCH_ASK = ["ここからどこに力を入れましょう？", "このあと、何を優先しますか", "最後に、どこを詰めますか"];

/* ===== 受託の仕事（問31） ===== */
export const CONTRACTS = [
  "{c}の学習ソフト", "{c}の社内向けの計算ソフト", "{c}のお店の案内画面", "{c}のパソコン教室の教材", "{c}の展示会の画面",
  "{c}のゲームの移植", "{c}の効果音づくり", "{c}のロゴの絵",
];
export const CLIENTS = ["丸三工業", "大和書房", "東西電機", "みどり銀行", "さくら百貨店", "北斗通信", "海原商事", "ひかり学習社"];

/* ===== 節目の目標（問37） ===== */
export const GOALS = [
  { key: "firstRelease", text: "はじめてのゲームを発売する", reward: 50 },
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
