import { useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { ArrowUpRight, Pause, Play, Radio, Square, Clapperboard } from 'lucide-react';
import type { BoardModel } from '../analytics/model';
import type { Incident } from '../analytics/incidents';
import { CAUSE_LABEL, tierOf, TIER_LABEL, type RegionId } from '../data/config';
import { CAUSE_ICON } from '../components/Badges';
import { fmtDuration, fmtInt, hhmm, mdhm } from '../lib/format';
import { REPLAY_SPEEDS, type ReplaySpeed } from '../lib/useReplay';
import { BC_CAUSE, BC_TIER } from './palette';
import { useWidth } from './useWidth';

export interface SessionReplay {
  playing: boolean;
  active: boolean;
  speed: ReplaySpeed;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  changeSpeed: (s: ReplaySpeed) => void;
}

const H = 66;
const AREA_H = 34;
const LANE_Y = 42;
const LANE_H = 9;

/**
 * 세션 바 + 하이라이트 릴 — 하루(24시간)를 한 줄 진행 막대로, 아래에 오늘의 장애를 하이라이트 카드로.
 * "하이라이트 재생"은 장애를 시작 순으로 이어서 재생한다(중계의 하이라이트 패키지). 사용자가 시작할 때만 움직인다.
 * 막대는 끌기 · ←→ 5분 · Shift 30분 · Home · End(LIVE).
 */
export function SessionBar({ m, t, live, region, replay, hls, playing, onPlayAll, onPlayOne, onCursor, onAnalysis }: {
  m: BoardModel; t: number; live: boolean; region: RegionId | null; replay: SessionReplay;
  hls: { inc: Incident; from: number; to: number }[]; playing: number | null;
  onPlayAll: () => void; onPlayOne: (i: number) => void; onCursor: (idx: number | null) => void; onAnalysis: (id: string) => void;
}) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const drag = useRef(false);
  const from = m.viewFrom;
  const to = m.last;
  const x = (i: number) => ((i - from) / (to - from)) * w;
  const idxAt = (px: number) => Math.round(from + Math.min(1, Math.max(0, px / Math.max(1, w))) * (to - from));

  const track = useMemo(() => {
    if (w < 20) return null;
    const g = region ? m.regions[region] : m.global;
    let vmax = 300;
    for (let i = from; i <= to; i++) vmax = Math.max(vmax, g.p95[i]);
    const cols = Math.floor(w / 2);
    const mpp = (to - from) / cols;
    const bars: { x: number; h: number; c: string }[] = [];
    for (let c = 0; c < cols; c++) {
      const a = Math.floor(from + c * mpp);
      const b = Math.max(a, Math.floor(from + (c + 1) * mpp) - 1);
      let v = 0;
      for (let i = a; i <= b; i++) v = Math.max(v, g.p95[i]);
      bars.push({ x: c * 2, h: Math.max(1, (v / vmax) * AREA_H), c: BC_TIER[tierOf(v)] });
    }
    const hours: { x: number; label: string }[] = [];
    for (let i = from; i <= to; i++) {
      const d = new Date(m.ds.times[i] + 9 * 3600_000);
      if (d.getUTCMinutes() === 0 && d.getUTCHours() % 3 === 0) hours.push({ x: x(i), label: hhmm(m.ds.times[i]) });
    }
    return { bars, hours };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [m, w, region]);

  const set = (e: PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const idx = idxAt(e.clientX - r.left);
    onCursor(idx >= to ? null : idx);
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 30 : 5;
    let next: number | null | undefined;
    if (e.key === 'ArrowLeft') next = Math.max(from, t - step);
    else if (e.key === 'ArrowRight') next = t + step >= to ? null : t + step;
    else if (e.key === 'Home') next = from;
    else if (e.key === 'End') next = null;
    if (next !== undefined) { e.preventDefault(); onCursor(next); }
  };

  return (
    <section className="bc-panel bc-session" aria-labelledby="bc-session-title">
      <header className="bc-tab bc-session-head">
        <h2 id="bc-session-title">세션 · 하이라이트</h2>
        <span>전날 21:00 → 오늘 21:00 KST · {region ? `${region} p95` : '전체 p95'}</span>
        <div className="bc-ctrl" role="group" aria-label="재생">
          {!replay.active ? (
            <button type="button" className="bc-btn primary" onClick={onPlayAll}><Clapperboard size={14} aria-hidden />하이라이트 재생</button>
          ) : (
            <>
              <button type="button" className="bc-btn icon" onClick={replay.playing ? replay.pause : replay.resume} aria-label={replay.playing ? '일시정지' : '이어서 재생'}>
                {replay.playing ? <Pause size={14} /> : <Play size={14} />}
              </button>
              <button type="button" className="bc-btn icon" onClick={replay.stop} aria-label="재생 끝내기"><Square size={12} /></button>
              <span className="bc-seg" role="group" aria-label="재생 속도 (1초당 분)">
                {REPLAY_SPEEDS.map((s) => (
                  <button key={s} type="button" aria-pressed={replay.speed === s} onClick={() => replay.changeSpeed(s)}>{s}분/초</button>
                ))}
              </span>
            </>
          )}
          {!live && <button type="button" className="bc-btn" onClick={() => onCursor(null)}><Radio size={13} aria-hidden />LIVE</button>}
        </div>
      </header>

      <div className="bc-track" ref={ref} style={{ height: H }}>
        {track && (
          <svg width={w} height={H} aria-hidden>
            {track.hours.map((h) => (
              <g key={h.label} className="bc-track-hour">
                <line x1={h.x} x2={h.x} y1={0} y2={LANE_Y + LANE_H} />
                {h.x > 16 && h.x < w - 24 && <text x={h.x} y={H - 2} textAnchor="middle">{h.label}</text>}
              </g>
            ))}
            {track.bars.map((b) => <rect key={b.x} x={b.x} y={AREA_H - b.h} width={1.6} height={b.h} fill={b.c} />)}
            {hls.map(({ inc }, i) => (
              <rect key={inc.id} x={x(inc.onsetIdx)} y={LANE_Y} width={Math.max(3, x(inc.endIdx ?? to) - x(inc.onsetIdx))} height={LANE_H}
                fill={BC_CAUSE[inc.cause]} className={playing === i ? 'is-playing' : ''} rx={1} />
            ))}
          </svg>
        )}
        {replay.active && <span className="bc-track-future" style={{ left: x(t), width: Math.max(0, w - x(t)) }} aria-hidden />}
        {hover !== null && <span className="bc-track-ghost" style={{ transform: `translateX(${x(hover)}px)` }} aria-hidden><em>{hhmm(m.ds.times[hover])}</em></span>}
        <span className={`bc-track-cursor ${live ? 'is-live' : ''}`} style={{ transform: `translateX(${x(t)}px)` }} aria-hidden><em>{live ? 'LIVE' : hhmm(m.ds.times[t])}</em></span>
        <div
          className="bc-track-hit"
          role="slider"
          tabIndex={0}
          aria-label="시점 선택"
          aria-valuemin={from}
          aria-valuemax={to}
          aria-valuenow={t}
          aria-valuetext={live ? `LIVE ${mdhm(m.ds.times[to])} KST` : `${mdhm(m.ds.times[t])} KST`}
          onKeyDown={onKey}
          onPointerDown={(e) => { drag.current = true; e.currentTarget.setPointerCapture(e.pointerId); set(e); }}
          onPointerMove={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            setHover(idxAt(e.clientX - r.left));
            if (drag.current) set(e);
          }}
          onPointerUp={() => { drag.current = false; }}
          onPointerCancel={() => { drag.current = false; }}
          onPointerLeave={() => setHover(null)}
        />
      </div>

      <ol className="bc-reel" aria-label="오늘의 장애 하이라이트">
        {hls.map(({ inc }, i) => {
          const Icon = CAUSE_ICON[inc.cause];
          const ongoing = inc.endIdx === null;
          return (
            <li key={inc.id} className={`bc-hl bc-c-${inc.cause} ${playing === i ? 'is-playing' : ''}`}>
              <span className="bc-hl-no num">H{i + 1}</span>
              <span className="bc-hl-top">
                <span className={`bc-cause mini bc-c-${inc.cause}`}><Icon size={11} aria-hidden />{CAUSE_LABEL[inc.cause]}</span>
                <span className="bc-hl-time num">{hhmm(m.ds.times[inc.onsetIdx])}–{ongoing ? '진행 중' : hhmm(m.ds.times[inc.endIdx!])}</span>
              </span>
              <b className="bc-hl-title">{inc.title}</b>
              <span className="bc-hl-meta">
                {ongoing ? `${fmtDuration(to - inc.onsetIdx)}째` : fmtDuration(inc.endIdx! - inc.onsetIdx)} · 최고 <b className="num">{fmtInt(inc.peakEl)}</b>ms {TIER_LABEL[tierOf(inc.peakEl)]}
              </span>
              <span className="bc-hl-actions">
                <button type="button" className="bc-btn" onClick={() => onPlayOne(i)} aria-label={`${inc.title} 재생`}><Play size={12} aria-hidden />재생</button>
                <button type="button" className="bc-btn ghost" onClick={() => onAnalysis(inc.id)} aria-label={`${inc.title} 분석 보드에서 보기`}>분석<ArrowUpRight size={12} aria-hidden /></button>
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
