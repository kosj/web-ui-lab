import { BarChart3, History, Play, Radar, Radio, Sparkles, Tv } from 'lucide-react';
import { dateLabel, hhmm, mdhm } from '../lib/format';
import type { ViewId } from '../lib/route';

const day = (x: number) => Math.floor((x + 9 * 3600_000) / 86_400_000);

/** 중계 상단 — 기울인 로고 블록 · 화면 전환 · 세션 시계 · 모션 */
export function BcTop({ ts, nowTs, live, replaying, highlight, motion, onMotion, onView, onLive }: {
  ts: number; nowTs: number; live: boolean; replaying: boolean; highlight: string | null;
  motion: 'full' | 'reduced'; onMotion: () => void; onView: (v: ViewId) => void; onLive: () => void;
}) {
  const when = day(ts) === day(nowTs) ? hhmm(ts) : mdhm(ts);
  return (
    <header className="bc-top">
      <div className="bc-brand">
        <span className="bc-logo" aria-hidden><b>LAG</b><i>LIVE</i></span>
        <h1>렉 라이브 중계</h1>
      </div>
      <nav className="bc-views" aria-label="화면 전환">
        <button type="button" onClick={() => onView('command')}><Radar size={14} aria-hidden />커맨드 센터</button>
        <button type="button" aria-current="page"><Tv size={14} aria-hidden />라이브 중계</button>
        <button type="button" onClick={() => onView('analysis')}><BarChart3 size={14} aria-hidden />분석 보드</button>
      </nav>
      <div className="bc-top-right">
        {replaying ? (
          <span className="bc-clock is-replay"><Play size={13} aria-hidden /><b>{highlight ? `하이라이트 ${highlight}` : '재생'}</b><span className="num">{when}</span></span>
        ) : live ? (
          <span className="bc-clock is-live"><span className="bc-live-dot" aria-hidden /><b>LIVE</b><span className="num"><span className="bc-clock-date">{dateLabel(ts)} </span>{hhmm(ts)} KST</span></span>
        ) : (
          <span className="bc-clock is-past"><History size={13} aria-hidden /><span className="num">과거 {when}</span>
            <button type="button" className="bc-btn" onClick={onLive}><Radio size={12} aria-hidden />LIVE</button>
          </span>
        )}
        <button type="button" className={`bc-btn icon ${motion === 'full' ? 'is-on' : ''}`} onClick={onMotion} aria-pressed={motion === 'full'}
          aria-label={motion === 'full' ? '모션 끄기' : '모션 켜기'} title={motion === 'full' ? '모션 켜짐 — 눌러서 끄기' : '모션 꺼짐 — 눌러서 켜기'}>
          <Sparkles size={15} />
        </button>
      </div>
    </header>
  );
}
