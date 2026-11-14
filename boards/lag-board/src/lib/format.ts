const KST = 9 * 3600_000;
const pad = (n: number) => String(n).padStart(2, '0');

export function hhmm(ts: number) {
  const d = new Date(ts + KST);
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

const WEEK = ['일', '월', '화', '수', '목', '금', '토'];
export function dateLabel(ts: number) {
  const d = new Date(ts + KST);
  return `${d.getUTCFullYear()}.${pad(d.getUTCMonth() + 1)}.${pad(d.getUTCDate())} (${WEEK[d.getUTCDay()]})`;
}

export function mdhm(ts: number) {
  const d = new Date(ts + KST);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()} ${hhmm(ts)}`;
}

export const fmtInt = (v: number) => Math.round(v).toLocaleString('ko-KR');
export const fmtFixed = (v: number, d = 1) =>
  v.toLocaleString('ko-KR', { minimumFractionDigits: d, maximumFractionDigits: d });

const compact = new Intl.NumberFormat('ko-KR', { notation: 'compact', maximumFractionDigits: 1 });
export const fmtCompact = (v: number) => compact.format(Math.round(v));

export function fmtDuration(min: number) {
  const m = Math.max(0, Math.round(min));
  if (m < 60) return `${m}분`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h}시간 ${r}분` : `${h}시간`;
}

export function signed(v: number, unit = '') {
  const r = Math.round(v);
  return `${r > 0 ? '+' : r < 0 ? '−' : '±'}${Math.abs(r).toLocaleString('ko-KR')}${unit}`;
}
