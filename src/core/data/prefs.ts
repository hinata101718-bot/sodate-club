/* 47都道府県（代表の市は県庁所在地。企画書 3）。pop は人口（万人のおおよそ） */
export interface Pref { name: string; city: string; region: string; pop: number; }
export const PREFS: Pref[] = [
  { name: '北海道', city: '札幌市', region: '北海道', pop: 510 },
  { name: '青森県', city: '青森市', region: '東北', pop: 120 }, { name: '岩手県', city: '盛岡市', region: '東北', pop: 118 },
  { name: '宮城県', city: '仙台市', region: '東北', pop: 228 }, { name: '秋田県', city: '秋田市', region: '東北', pop: 93 },
  { name: '山形県', city: '山形市', region: '東北', pop: 104 }, { name: '福島県', city: '福島市', region: '東北', pop: 179 },
  { name: '茨城県', city: '水戸市', region: '関東', pop: 284 }, { name: '栃木県', city: '宇都宮市', region: '関東', pop: 191 },
  { name: '群馬県', city: '前橋市', region: '関東', pop: 191 }, { name: '埼玉県', city: 'さいたま市', region: '関東', pop: 733 },
  { name: '千葉県', city: '千葉市', region: '関東', pop: 627 }, { name: '東京都', city: '新宿区', region: '関東', pop: 1404 },
  { name: '神奈川県', city: '横浜市', region: '関東', pop: 922 },
  { name: '新潟県', city: '新潟市', region: '中部', pop: 214 }, { name: '富山県', city: '富山市', region: '中部', pop: 102 },
  { name: '石川県', city: '金沢市', region: '中部', pop: 111 }, { name: '福井県', city: '福井市', region: '中部', pop: 75 },
  { name: '山梨県', city: '甲府市', region: '中部', pop: 80 }, { name: '長野県', city: '長野市', region: '中部', pop: 200 },
  { name: '岐阜県', city: '岐阜市', region: '中部', pop: 195 }, { name: '静岡県', city: '静岡市', region: '中部', pop: 355 },
  { name: '愛知県', city: '名古屋市', region: '中部', pop: 748 },
  { name: '三重県', city: '津市', region: '近畿', pop: 174 }, { name: '滋賀県', city: '大津市', region: '近畿', pop: 141 },
  { name: '京都府', city: '京都市', region: '近畿', pop: 254 }, { name: '大阪府', city: '大阪市', region: '近畿', pop: 878 },
  { name: '兵庫県', city: '神戸市', region: '近畿', pop: 538 }, { name: '奈良県', city: '奈良市', region: '近畿', pop: 131 },
  { name: '和歌山県', city: '和歌山市', region: '近畿', pop: 90 },
  { name: '鳥取県', city: '鳥取市', region: '中国', pop: 54 }, { name: '島根県', city: '松江市', region: '中国', pop: 65 },
  { name: '岡山県', city: '岡山市', region: '中国', pop: 185 }, { name: '広島県', city: '広島市', region: '中国', pop: 275 },
  { name: '山口県', city: '山口市', region: '中国', pop: 131 },
  { name: '徳島県', city: '徳島市', region: '四国', pop: 70 }, { name: '香川県', city: '高松市', region: '四国', pop: 93 },
  { name: '愛媛県', city: '松山市', region: '四国', pop: 131 }, { name: '高知県', city: '高知市', region: '四国', pop: 67 },
  { name: '福岡県', city: '福岡市', region: '九州・沖縄', pop: 510 }, { name: '佐賀県', city: '佐賀市', region: '九州・沖縄', pop: 80 },
  { name: '長崎県', city: '長崎市', region: '九州・沖縄', pop: 128 }, { name: '熊本県', city: '熊本市', region: '九州・沖縄', pop: 172 },
  { name: '大分県', city: '大分市', region: '九州・沖縄', pop: 111 }, { name: '宮崎県', city: '宮崎市', region: '九州・沖縄', pop: 105 },
  { name: '鹿児島県', city: '鹿児島市', region: '九州・沖縄', pop: 156 }, { name: '沖縄県', city: '那覇市', region: '九州・沖縄', pop: 147 },
];
export const REGIONS = ['北海道', '東北', '関東', '中部', '近畿', '中国', '四国', '九州・沖縄'];
export const prefByName = (n: string) => PREFS.find((p) => p.name === n) ?? PREFS[21];
/** 県の大きさ（0.6〜1.4くらい）。人口・お金の集まりやすさ・ユースに入る子の数に効く（問9・問50） */
export function prefScale(n: string): number {
  const p = prefByName(n);
  const t = (Math.log10(p.pop) - Math.log10(54)) / (Math.log10(1404) - Math.log10(54));
  return 0.7 + Math.max(0, Math.min(1, t)) * 0.7;
}
/** 市の名前から「市」「区」を取った呼び名 */
export const cityShort = (c: string) => c.replace(/(市|区)$/, '');
