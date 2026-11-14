import { BarChart3, History, Play, Radar, Radio, Sparkles, Tv } from 'lucide-react';
import { dateLabel, hhmm, mdhm } from '../lib/format';

/** 상단 HUD — 브랜드 · 화면 전환 · 수집 상태 · 시계(LIVE/재생/과거) · 모션 토글 */
/** 오늘(현재 시각과 같은 날)이면 시:분만, 전날이면 날짜까지 — 24시간 창은 전날 21시부터다 */
function when(ts: number, nowTs: number) {
  const day = (x: number) => Math.floor((x + 9 * 3600_000) / 86_400_000);
  return day(ts) === day(nowTs) ? hhmm(ts) : mdhm(ts);
}

export function Hud({ ts, nowTs, live, replaying, serverCount, motion, onMotion, onAnalysis, onBroadcast, onLive }: {
  ts: number; nowTs: number; live: boolean; replaying: boolean; serverCount: number;
  motion: 'full' | 'reduced'; onMotion: () => void; onAnalysis: () => void; onBroadcast: () => void; onLive: () => void;
}) {
  return (
    <header className="cc-hud">
      <div className="cc-brand">
        <span className="cc-logo" aria-hidden>
          <svg viewBox="0 0 32 32" width="30" height="30">
            <circle cx="16" cy="16" r="13" className="cc-logo-orbit" />
            <circle cx="16" cy="16" r="4.2" className="cc-logo-core" />
            <circle cx="27.2" cy="9.5" r="2.2" className="cc-logo-sat" />
            <circle cx="5.5" cy="22" r="1.8" className="cc-logo-sat" />
          </svg>
        </span>
        <div className="cc-brand-text">
          <span className="cc-brand-eyebrow">LAG COMMAND · 6 REGIONS</span>
          <h1>렉 커맨드 센터</h1>
        </div>
      </div>

      <nav className="cc-viewswitch" aria-label="화면 전환">
        <button type="button" aria-current="page"><Radar size={14} aria-hidden />커맨드 센터</button>
        <button type="button" onClick={onBroadcast}><Tv size={14} aria-hidden />라이브 중계</button>
        <button type="button" onClick={onAnalysis}><BarChart3 size={14} aria-hidden />분석 보드</button>
      </nav>

      <div className="cc-hud-right">
        <span className="cc-feed-health" title="수집기 자체 상태 — 화면이 '정상'이어도 수집이 멈췄다면 의미가 없다">
          <i aria-hidden />수집 정상 {serverCount}/{serverCount} · 1분 주기
        </span>
        {replaying ? (
          <span className="cc-clock is-replay"><Play size={13} aria-hidden /><b>재생</b><span className="num">{when(ts, nowTs)} KST</span></span>
        ) : live ? (
          <span className="cc-clock is-live"><Radio size={14} aria-hidden /><b>LIVE</b><span className="num"><span className="cc-clock-date">{dateLabel(ts)} </span>{hhmm(ts)} KST</span></span>
        ) : (
          <span className="cc-clock is-past">
            <History size={13} aria-hidden /><span className="num">과거 {when(ts, nowTs)} KST</span>
            <button type="button" className="cc-btn" onClick={onLive}>LIVE로</button>
          </span>
        )}
        <button
          type="button"
          className={`cc-btn icon ${motion === 'full' ? 'is-on' : ''}`}
          onClick={onMotion}
          aria-pressed={motion === 'full'}
          aria-label={motion === 'full' ? '모션 끄기' : '모션 켜기'}
          title={motion === 'full' ? '모션 켜짐 — 눌러서 끄기 (입자 흐름은 정지 화면으로 바뀝니다)' : '모션 꺼짐 — 눌러서 켜기'}
        >
          <Sparkles size={15} />
        </button>
      </div>
    </header>
  );
}
