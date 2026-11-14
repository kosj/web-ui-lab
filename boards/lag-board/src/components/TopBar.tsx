import { History, Moon, Pause, Play, Radio, Sparkles, Square, Sun } from 'lucide-react';
import { dateLabel, hhmm } from '../lib/format';
import { RANGE_LABEL, type RangeKey } from '../lib/view';
import type { ThemeMode } from '../lib/theme';
import { REPLAY_SPEEDS, type ReplaySpeed } from '../lib/useReplay';
import type { StyleId } from '../lib/style';
import { StyleMenu } from './StyleMenu';

export interface ReplayControls {
  playing: boolean;
  active: boolean;
  speed: ReplaySpeed;
  progress: number;
  posTs: number | null;
  onPlay: () => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  changeSpeed: (s: ReplaySpeed) => void;
}

export function TopBar(props: {
  nowTs: number;
  cursorTs: number | null;
  range: RangeKey;
  onRange: (r: RangeKey) => void;
  onLive: () => void;
  theme: ThemeMode;
  onTheme: () => void;
  serverCount: number;
  motion: 'full' | 'reduced';
  onMotion: () => void;
  replay: ReplayControls;
  style: StyleId;
  onStyle: (s: StyleId) => void;
  themeLocked: boolean;
}) {
  const { nowTs, cursorTs, range, onRange, onLive, theme, onTheme, serverCount, motion, onMotion, replay, style, onStyle, themeLocked } = props;
  const live = cursorTs === null && !replay.active;
  return (
    <header className={`topbar ${replay.active ? 'is-replaying' : ''}`}>
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

        {/* 장애 재생 — 시간 커서를 자동으로 진행시켜 렉이 번지는 순서를 보여준다 */}
        <div className="replay" role="group" aria-label="재생">
          {!replay.active ? (
            <button type="button" className="btn" onClick={replay.onPlay} title="선택한 기간을 처음부터(또는 선택 시점부터) 재생">
              <Play size={14} aria-hidden />
              재생
            </button>
          ) : (
            <>
              <button type="button" className="icon-btn" onClick={replay.playing ? replay.pause : replay.resume} aria-label={replay.playing ? '일시정지' : '이어서 재생'}>
                {replay.playing ? <Pause size={15} /> : <Play size={15} />}
              </button>
              <button type="button" className="icon-btn" onClick={replay.stop} aria-label="재생 끝내기">
                <Square size={13} />
              </button>
              <div className="seg seg-tight" role="group" aria-label="재생 속도 (1초당 분)">
                {REPLAY_SPEEDS.map((s) => (
                  <button key={s} type="button" aria-pressed={replay.speed === s} onClick={() => replay.changeSpeed(s)}>
                    {s}분/초
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {replay.active ? (
          <span className="clock replaying" aria-live="off">
            <Play size={13} strokeWidth={2.4} aria-hidden />
            <span className="num">재생 {replay.posTs !== null ? hhmm(replay.posTs) : ''} KST</span>
          </span>
        ) : live ? (
          <span className="clock live">
            <Radio size={14} strokeWidth={2.2} aria-hidden />
            <b>LIVE</b>
            <span className="num"><span className="clock-date">{dateLabel(nowTs)} </span>{hhmm(nowTs)} KST</span>
          </span>
        ) : (
          <span className="clock past">
            <History size={14} strokeWidth={2.2} aria-hidden />
            <span className="num">과거 시점 {hhmm(cursorTs!)} 보는 중</span>
            <button type="button" className="btn" onClick={onLive}>LIVE로 복귀</button>
          </span>
        )}
        <button
          type="button"
          className={`icon-btn motion-toggle ${motion === 'full' ? 'is-on' : ''}`}
          onClick={onMotion}
          aria-pressed={motion === 'full'}
          aria-label={motion === 'full' ? '모션 끄기' : '모션 켜기'}
          title={motion === 'full' ? '모션 켜짐 — 눌러서 끄기' : '모션 꺼짐 — 눌러서 켜기'}
        >
          <Sparkles size={16} />
        </button>
        <StyleMenu style={style} onStyle={onStyle} />
        <button
          type="button"
          className="icon-btn"
          onClick={onTheme}
          disabled={themeLocked}
          aria-label={themeLocked ? `이 스타일은 ${theme === 'dark' ? '다크' : '라이트'} 전용` : theme === 'dark' ? '라이트 테마로 전환' : '다크 테마로 전환'}
          title={themeLocked ? `이 스타일은 ${theme === 'dark' ? '다크' : '라이트'} 전용입니다` : undefined}
        >
          {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        </button>
      </div>
      {replay.active && (
        <div
          className="replay-progress"
          role="progressbar"
          aria-label="재생 진행"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(replay.progress * 100)}
        >
          <i style={{ transform: `scaleX(${replay.progress})` }} />
        </div>
      )}
    </header>
  );
}
