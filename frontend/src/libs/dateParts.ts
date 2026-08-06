// DatePicker / TimeInput が使う純粋関数群。
//
// 日付は必ず「ローカル時刻の年月日」として扱い、Date.toISOString()(UTC 変換)は使わない。
// JST のブラウザで toISOString() を使うと 09:00 未満が前日にずれるため。
// ワイヤー上の日付表現(サーバとの受け渡し)は 'YYYY-MM-DD' 文字列で統一する。

const pad2 = (n: number) => String(n).padStart(2, '0');

/** Date → 'YYYY-MM-DD'(ローカル時刻の年月日) */
export const formatDate = (date: Date): string =>
  `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;

/**
 * 'YYYY-MM-DD' → Date(ローカル 0 時)。
 * 形式違い・存在しない日付(2026-02-30 等)は null を返す。
 */
export const parseDate = (value: string): Date | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(year, month - 1, day);
  // new Date(2026, 1, 30) は 3/2 に繰り上がるので、往復で一致するかを見る
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date;
};

export const isSameDate = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

/**
 * 指定月のカレンダー行列(日曜始まり)。前後の月の日でマスを埋める。
 * 返る Date はすべてローカル 0 時。
 */
export const buildMonthMatrix = (year: number, month0: number): Date[][] => {
  const first = new Date(year, month0, 1);
  const start = new Date(year, month0, 1 - first.getDay());
  const weeks: Date[][] = [];
  const cursor = new Date(start);
  while (weeks.length < 6) {
    const week: Date[] = [];
    for (let i = 0; i < 7; i += 1) {
      week.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    weeks.push(week);
    // 次週が翌月に完全に入ったら打ち切る(月末が埋まった時点で終了)
    if (cursor.getMonth() !== month0 && cursor.getDate() > 7) break;
  }
  return weeks;
};

/**
 * 時刻入力の正規化。'930' / '9:5' / '0930' → '09:30' / '09:05'。
 * 空文字は空文字のまま(未入力を許す)、解釈できない場合は null。
 */
export const normalizeTime = (value: string): string | null => {
  const trimmed = value.trim();
  if (trimmed === '') return '';

  const colon = /^(\d{1,2}):(\d{1,2})$/.exec(trimmed);
  const digits = /^(\d{3,4})$/.exec(trimmed);
  let hour: number;
  let minute: number;
  if (colon) {
    [hour, minute] = [Number(colon[1]), Number(colon[2])];
  } else if (digits) {
    const d = digits[1].padStart(4, '0');
    [hour, minute] = [Number(d.slice(0, 2)), Number(d.slice(2))];
  } else {
    return null;
  }

  if (hour > 23 || minute > 59) return null;
  return `${pad2(hour)}:${pad2(minute)}`;
};
