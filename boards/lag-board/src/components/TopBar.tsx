import { History, Moon, Radio, Sun } from 'lucide-react';
import { dateLabel, hhmm } from '../lib/format';
import { RANGE_LABEL, type RangeKey } from '../lib/view';
import type { ThemeMode } from '../lib/theme';

export function TopBar(props: {
  nowTs: number;
  cursorTs: number | null;
  range: RangeKey;
  onRange: (r: RangeKey) => void;
  onLive: () => void;
  theme: ThemeMode;
  onTheme: () => void;
  serverCount: number;
}) {
  const { nowTs, cursorTs, range, onRange, onLive, theme, onTheme, serverCount } = props;
  const live = cursorTs === null;
  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-mark" aria-hidden>
          <svg viewBox="0 0 20 20" width="20" height="20">
            <rect x="1" y="11" width="3" height="8" rx="1" />
            <rect x="6" y="7" width="3" height="12" rx="1" />
            <rect x="11" y="3" width="3" height="16" rx="1" />
            <rect x="16" y="9" width="3" height="10" rx="1" />
          </svg>
        </span>
        <div className="brand-text">
          <h1>렉 보드</h1>
          <span className="brand-sub">가상 MMORPG · 글로벌 6개 권역 · 라이브 운영</span>
        </div>
      </div>

      <div className="topbar-tools">
        <span className="feed-health" title="수집기 자체 상태 — 대시보드가 '정상'이라도 수집이 멈췄다면 의미가 없다">
          <span className="feed-dot" aria-hidden />
          수집 정상 · {serverCount}/{serverCount} 서버 · 1분 주기
        </span>
        <div className="seg" role="group" aria-label="조회 기간">
          {(Object.keys(RANGE_LABEL) as RangeKey[]).map((r) => (
            <button key={r} type="button" aria-pressed={range === r} onClick={() => onRange(r)}>
              {RANGE_LABEL[r]}
            </button>
          ))}
        </div>
        {live ? (
          <span className="clock live">
            <Radio size={14} strokeWidth={2.2} aria-hidden />
            <b>LIVE</b>
            <span className="num">{dateLabel(nowTs)} {hhmm(nowTs)} KST</span>
          </span>
        ) : (
          <span className="clock past">
            <History size={14} strokeWidth={2.2} aria-hidden />
            <span className="num">과거 시점 {hhmm(cursorTs!)} 보는 중</span>
            <button type="button" className="btn" onClick={onLive}>LIVE로 복귀</button>
          </span>
        )}
        <button type="button" className="icon-btn" onClick={onTheme} aria-label={theme === 'dark' ? '라이트 테마로 전환' : '다크 테마로 전환'}>
          {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        </button>
      </div>
    </header>
  );
}
