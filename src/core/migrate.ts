/* セーブの版の変換。MIGRATIONS[n] は、版 n のセーブを 版 n+1 に変える */
export const MIGRATIONS: Record<number, (s: any) => any> = {};
