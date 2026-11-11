/* 1年の流れ（企画書 6）。1年は48週（1か月4週）。
   1月 オフ → 2月はじめ 春の昇格会議 → 2月なかば〜下旬 キャンプ → 3月開幕〜11月 → 12月 表彰・契約更新・冬の移籍期間 */
export const WEEKS = 48;
export const SEASON_START = 8; // 3月第1週
export const SEASON_END = 43; // 11月第4週
export const PROMO_WEEK = 4; // 2月第1週：春の昇格会議
export const CAMP_WEEKS = [5, 6, 7];
export const AWARD_WEEK = 44; // 12月第1週：年末の表彰
export const RENEW_WEEK = 45; // 12月第2週：契約更新
export const COACH_WEEK = 46; // 12月第3週：コーチの見直し
export const monthOf = (w: number) => Math.floor(w / 4) + 1;
export const weekOfMonth = (w: number) => (w % 4) + 1;
export const isOff = (w: number) => w < 4;
export const isCamp = (w: number) => CAMP_WEEKS.includes(w);
/** 移籍の期間：夏（7〜8月）と冬（12月） */
export const isWindow = (w: number) => (w >= 24 && w <= 31) || w >= 44;
/** 夏の中断期間（問117）：7月第3週〜8月第1週の3週はリーグ戦を休む */
export const BREAK_WEEKS = [26, 27, 28];
export const isSummerWindow = (w: number) => w >= 24 && w <= 31;
export const CUP_ROUND_NAMES = ['1回戦', '2回戦', '3回戦', '準々決勝', '準決勝', '決勝'];
/** シーズンの週（3月〜11月の36週）のうち、大会を入れる週 */
const CUP_OFFSETS = [5, 10, 15, 21, 27, 35];
export function seasonSchedule(): { league: number[]; cup: number[] } {
  const cup = CUP_OFFSETS.map((o) => SEASON_START + o);
  const rest: number[] = [];
  for (let w = SEASON_START; w <= SEASON_END; w++) if (!cup.includes(w) && !BREAK_WEEKS.includes(w)) rest.push(w);
  /* のこり27週（中断期間をのぞく）から22週を、なるべく均等に選ぶ（あいた週は休み） */
  const league: number[] = [];
  for (let i = 0; i < 22; i++) league.push(rest[Math.round((i * (rest.length - 1)) / 21)]);
  return { league, cup };
}
