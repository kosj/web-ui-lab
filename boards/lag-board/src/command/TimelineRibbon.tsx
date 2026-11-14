import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { Pause, Play, Radio, Square } from 'lucide-react';
import type { BoardModel } from '../analytics/model';
import { CAUSES, REGIONS, THRESHOLDS, tierOf, type RegionId, type Tier } from '../data/config';
import { hhmm, mdhm } from '../lib/format';
import { REPLAY_SPEEDS, type ReplaySpeed } from '../lib/useReplay';
import { CC, CC_CAUSE, CC_TIER, alpha } from './palette';

type Scope = 'ALL' | RegionId;

export interface RibbonReplay {
  playing: boolean;
  active: boolean;
  speed: ReplaySpeed;
  onPlay: () => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  changeSpeed: (s: ReplaySpeed) => void;
}

/**
 * 24시간 타임라인 리본 — 하루 전체를 한 줄에. 위에서부터
 *   전체 p95(등급색 면) · 권역 6줄 히트 띠 · 원인 4줄 + 제보 사각지대 장애 막대.
 * 리본은 데이터가 같으면 다시 그리지 않고, 시간 커서·미래 가림막만 HTML로 옮긴다 (재생 중 비용 최소).
 * 끌어서 시점 이동 · ←→ 5분 · Shift+←→ 30분 · Home 처음 · End LIVE.
 */
const GUTTER = 64;
const PAD_R = 10;
const TOP = 18;
const AREA_H = 44;
const ROW_H = 10;
const ROW_GAP = 3;
const LANE_H = 8;
const LANE_GAP = 3;
const REG_Y = TOP + AREA_H + 8;
const LANE_Y = REG_Y + REGIONS.length * (ROW_H + ROW_GAP) + 6;
const LANES = [...CAUSES.map((c) => ({ id: c.id as string, label: c.label })), { id: 'voc', label: '사각지대' }];
export const RIBBON_H = LANE_Y + LANES.length * (LANE_H + LANE_GAP) + 2;

const RANK: Record<Tier, number> = { smooth: 0, good: 1, notice: 2, warning: 3, critical: 4 };
const FONT = (px: number, w = 500) => `${w} ${px}px 'Chakra Petch', 'Pretendard Variable', sans-serif`;

export function TimelineRibbon({ m, t, live, scope, replay, onCursor }: {
  m: BoardModel; t: number; live: boolean; scope: Scope; replay: RibbonReplay;
  onCursor: (idx: number | null) => void;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const cvRef = useRef<HTMLCanvasElement>(null);
  const [w, setW] = useState(0);
  const [hover, setHover] = useState<number | null>(null);
  const [fontTick, setFontTick] = useState(0);
  const drag = useRef(false);
  const from = m.viewFrom;
  const to = m.last;
  const plotW = Math.max(10, w - GUTTER - PAD_R);
  const x = (idx: number) => GUTTER + ((idx - from) / (to - from)) * plotW;
  const idxAt = (px: number) => Math.round(from + Math.min(1, Math.max(0, (px - GUTTER) / plotW)) * (to - from));

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)));
    ro.observe(el);
    const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
    const on = () => setFontTick((k) => k + 1);
    fonts?.ready.then(on);
    fonts?.addEventListener?.('loadingdone', on);
    return () => { ro.disconnect(); fonts?.removeEventListener?.('loadingdone', on); };
  }, []);

  useEffect(() => {
    const cv = cvRef.current;
    if (!cv || w < 50) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(RIBBON_H * dpr);
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, RIBBON_H);
    const cols = Math.floor(plotW);
    const mpp = (to - from) / cols;
    const colRange = (c: number) => [Math.floor(from + c * mpp), Math.max(Math.floor(from + c * mpp), Math.floor(from + (c + 1) * mpp) - 1)];

    // 시간 눈금 (3시간마다)
    ctx.font = FONT(10);
    ctx.textBaseline = 'alphabetic';
    for (let i = from; i <= to; i++) {
      const d = new Date(m.ds.times[i] + 9 * 3600_000);
      if (d.getUTCMinutes() !== 0 || d.getUTCHours() % 3 !== 0) continue;
      const xx = Math.round(x(i)) + 0.5;
      ctx.strokeStyle = alpha(CC.cyan, 0.08);
      ctx.beginPath();
      ctx.moveTo(xx, TOP - 2);
      ctx.lineTo(xx, RIBBON_H);
      ctx.stroke();
      ctx.fillStyle = CC.ink3;
      ctx.textAlign = 'center';
      if (xx > GUTTER + 14 && xx < w - 20) ctx.fillText(hhmm(m.ds.times[i]), xx, 11);
    }

    // 왼쪽 라벨
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.font = FONT(10.5, 600);
    ctx.fillStyle = CC.ink2;
    ctx.fillText('전체 p95', GUTTER - 10, TOP + AREA_H / 2);
    REGIONS.forEach((r, k) => {
      ctx.fillStyle = scope === r.id ? CC.cyan : scope === 'ALL' ? CC.ink2 : CC.ink3;
      ctx.fillText(r.name, GUTTER - 10, REG_Y + k * (ROW_H + ROW_GAP) + ROW_H / 2);
    });
    ctx.font = FONT(10, 500);
    LANES.forEach((l, k) => {
      ctx.fillStyle = CC.ink3;
      ctx.fillText(l.label, GUTTER - 10, LANE_Y + k * (LANE_H + LANE_GAP) + LANE_H / 2);
    });

    // 전체 p95 — 등급색 면 + 선
    const g = scope === 'ALL' ? m.global : m.regions[scope];
    let vmax = 300;
    for (let i = from; i <= to; i++) vmax = Math.max(vmax, g.p95[i]);
    vmax *= 1.08;
    const y = (v: number) => TOP + AREA_H - (Math.min(v, vmax) / vmax) * AREA_H;
    [THRESHOLDS.notice, THRESHOLDS.warning].forEach((th) => {
      ctx.strokeStyle = alpha(th === THRESHOLDS.notice ? CC_TIER.notice : CC_TIER.warning, 0.35);
      ctx.setLineDash([2, 3]);
      ctx.beginPath();
      ctx.moveTo(GUTTER, Math.round(y(th)) + 0.5);
      ctx.lineTo(GUTTER + plotW, Math.round(y(th)) + 0.5);
      ctx.stroke();
    });
    ctx.setLineDash([]);
    const colV = new Float32Array(cols);
    for (let c = 0; c < cols; c++) {
      const [a, b] = colRange(c);
      let v = 0;
      for (let i = a; i <= b; i++) v = Math.max(v, g.p95[i]);
      colV[c] = v;
      const tier = tierOf(v);
      ctx.fillStyle = alpha(CC_TIER[tier], tier === 'smooth' || tier === 'good' ? 0.16 : 0.34);
      ctx.fillRect(GUTTER + c, y(v), 1, TOP + AREA_H - y(v));
    }
    ctx.lineWidth = 1.4;
    ctx.shadowBlur = 6;
    let c0 = 0;
    while (c0 < cols) {
      const tier = tierOf(colV[c0]);
      let c1 = c0;
      while (c1 + 1 < cols && tierOf(colV[c1 + 1]) === tier) c1++;
      ctx.strokeStyle = CC_TIER[tier];
      ctx.shadowColor = CC_TIER[tier];
      ctx.beginPath();
      for (let c = Math.max(0, c0 - 1); c <= c1; c++) {
        const yy = y(colV[c]);
        if (c === Math.max(0, c0 - 1)) ctx.moveTo(GUTTER + c + 0.5, yy);
        else ctx.lineTo(GUTTER + c + 0.5, yy);
      }
      ctx.stroke();
      c0 = c1 + 1;
    }
    ctx.shadowBlur = 0;

    // 권역 히트 띠 — 픽셀 열마다 그 구간 최악 등급
    REGIONS.forEach((r, k) => {
      const p = m.regions[r.id].p95;
      const yy = REG_Y + k * (ROW_H + ROW_GAP);
      const dimK = scope === 'ALL' || scope === r.id ? 1 : 0.4;
      for (let c = 0; c < cols; c++) {
        const [a, b] = colRange(c);
        let v = 0;
        for (let i = a; i <= b; i++) v = Math.max(v, p[i]);
        // 150ms 미만은 등급색 대신 옅은 시안 농도로만 (쾌적/양호 경계에서 바코드처럼 깜빡이지 않게)
        const tier = tierOf(v);
        ctx.fillStyle = RANK[tier] >= RANK.notice
          ? alpha(CC_TIER[tier], 0.92 * dimK)
          : alpha(CC.cyan, (0.05 + 0.2 * Math.min(1, v / THRESHOLDS.notice) ** 2) * dimK);
        ctx.fillRect(GUTTER + c, yy, 1, ROW_H);
      }
    });

    // 장애 막대 (원인 레인) + 측정 사각지대
    const bar = (lane: number, a: number, b: number, color: string, dashed = false) => {
      const yy = LANE_Y + lane * (LANE_H + LANE_GAP);
      const x0 = x(a);
      const x1 = Math.max(x0 + 2, x(b));
      if (dashed) {
        ctx.strokeStyle = color;
        ctx.setLineDash([2, 2]);
        ctx.strokeRect(x0 + 0.5, yy + 0.5, x1 - x0 - 1, LANE_H - 1);
        ctx.setLineDash([]);
        return;
      }
      ctx.fillStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = 8;
      ctx.fillRect(x0, yy, x1 - x0, LANE_H);
      ctx.shadowBlur = 0;
    };
    m.incidents.forEach((inc) => {
      const lane = CAUSES.findIndex((c) => c.id === inc.cause);
      const dimK = scope === 'ALL' || inc.region === scope || inc.scopeType === 'global' ? 1 : 0.35;
      bar(lane, inc.onsetIdx, inc.endIdx ?? to, alpha(CC_CAUSE[inc.cause], 0.9 * dimK));
    });
    m.blindSpots.forEach((b) => bar(4, b.onsetIdx, b.endIdx ?? to, alpha(CC.ink2, 0.8), true));
  }, [m, w, plotW, scope, fontTick, from, to]);

  const setFromPointer = (e: PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.parentElement!.getBoundingClientRect();
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

  const cx = x(t);
  return (
    <section className="cc-panel cc-ribbon" aria-labelledby="cc-ribbon-title">
      <header className="cc-panel-head">
        <h2 id="cc-ribbon-title">24시간 타임라인</h2>
        <p className="cc-ribbon-hint">끌거나 ←→로 시점 이동 · 지도·게이지·피드가 그 시점으로 바뀝니다</p>
        <div className="cc-ribbon-ctrl" role="group" aria-label="재생">
          {!replay.active ? (
            <button type="button" className="cc-btn primary" onClick={replay.onPlay}><Play size={13} aria-hidden />최근 3시간 재생</button>
          ) : (
            <>
              <button type="button" className="cc-btn icon" onClick={replay.playing ? replay.pause : replay.resume} aria-label={replay.playing ? '일시정지' : '이어서 재생'}>
                {replay.playing ? <Pause size={14} /> : <Play size={14} />}
              </button>
              <button type="button" className="cc-btn icon" onClick={replay.stop} aria-label="재생 끝내기"><Square size={12} /></button>
              <span className="cc-seg" role="group" aria-label="재생 속도 (1초당 분)">
                {REPLAY_SPEEDS.map((s) => (
                  <button key={s} type="button" aria-pressed={replay.speed === s} onClick={() => replay.changeSpeed(s)}>{s}분/초</button>
                ))}
              </span>
            </>
          )}
          {!live && (
            <button type="button" className="cc-btn" onClick={() => { replay.stop(); onCursor(null); }}><Radio size={13} aria-hidden />LIVE</button>
          )}
        </div>
      </header>
      <div className="cc-ribbon-body" ref={wrap} style={{ height: RIBBON_H }}>
        <canvas ref={cvRef} style={{ width: w, height: RIBBON_H }} aria-hidden />
        {replay.active && <span className="cc-ribbon-future" style={{ left: cx, width: Math.max(0, x(to) - cx) }} aria-hidden />}
        {hover !== null && !drag.current && (
          <span className="cc-ribbon-ghost" style={{ transform: `translateX(${x(hover)}px)` }} aria-hidden>
            <em>{hhmm(m.ds.times[hover])}</em>
          </span>
        )}
        <span className={`cc-ribbon-cursor ${live ? 'is-live' : ''}`} style={{ transform: `translateX(${cx}px)` }} aria-hidden>
          <em>{live ? 'LIVE' : hhmm(m.ds.times[t])}</em>
        </span>
        <div
          className="cc-ribbon-hit"
          style={{ left: GUTTER, width: plotW }}
          role="slider"
          tabIndex={0}
          aria-label="시점 선택"
          aria-valuemin={from}
          aria-valuemax={to}
          aria-valuenow={t}
          aria-valuetext={live ? `LIVE ${mdhm(m.ds.times[to])} KST` : `${mdhm(m.ds.times[t])} KST`}
          onKeyDown={onKey}
          onPointerDown={(e) => { drag.current = true; e.currentTarget.setPointerCapture(e.pointerId); setFromPointer(e); }}
          onPointerMove={(e) => {
            const r = e.currentTarget.parentElement!.getBoundingClientRect();
            setHover(idxAt(e.clientX - r.left));
            if (drag.current) setFromPointer(e);
          }}
          onPointerUp={() => { drag.current = false; }}
          onPointerCancel={() => { drag.current = false; }}
          onPointerLeave={() => setHover(null)}
        />
      </div>
    </section>
  );
}
