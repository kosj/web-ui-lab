import { useEffect, useMemo, useRef, useState } from 'react';
import { isActiveAt, type BoardModel } from '../analytics/model';
import { CAUSE_LABEL, REGION_ISPS, REGIONS, TIER_LABEL, tierOf, type Cause, type RegionId, type Tier } from '../data/config';
import { ispRows } from '../components/IspDrilldown';
import { LOSS_EMPHASIS } from '../components/PacketLane';
import { RollingNumber } from '../components/RollingNumber';
import { TIER_ICON } from '../components/Badges';
import { fmtInt, fmtCompact } from '../lib/format';
import { useMotionOn } from '../lib/motion';
import { useEscalation } from '../lib/useEscalation';
import { TIER_RANK } from '../lib/view';
import { cardSize, DC_LONLAT, landDots, makeGeometry, nodeLayout, placeCards, type CardRect, type MapGeometry, type NodeLayout } from './geo';
import { CC, CC_CAUSE, CC_TIER, alpha } from './palette';

/**
 * 세계 트래픽 흐름 지도 — 커맨드 센터의 주인공.
 *
 * 모션은 "살아 있다는 증거"여야 한다 (GitHub 지구본: 실제 데이터가 움직임을 만든다).
 * 입자 하나하나가 통신사 경로 → 권역 DC로 가는 트래픽이며, 분석 보드의 패킷 레인과 같은 인코딩을 쓴다.
 *   - 속도: 경로를 건너는 시간 = 0.25s + RTT p50/80 (최대 4s) → 느린 경로는 눈에 띄게 느리다
 *   - 흩어짐: 입자별 이동 시간·옆 흔들림이 지터/RTT 비율만큼 벌어진다
 *   - 사라짐: 손실률 × 5배 확률로 경로 중간에서 빨간 불꽃을 남기고 사라진다
 *   - 색: 그 통신사 유저의 체감 지연 추정치(통신사 네트워크 성분 + 권역 서버·클라 성분) 등급
 *   - 양: 동시에 흐르는 입자 수 ∝ 통신사 유저 비중
 * 대륙 점은 DC 주변이 권역 등급색으로 물든다 (등급이 나쁠수록 진하고 넓게).
 * 진행 중 장애는 원인색 소나 링으로, 통신사 경로 장애는 그 통신사 위성에서 울린다.
 * 모션이 꺼져 있으면 같은 인코딩의 정지 화면(경로선 + 화살표, 손실 경로는 점선)을 그린다.
 */

type Scope = 'ALL' | RegionId;

interface PathState {
  color: string;
  tier: Tier;
  /** 경로 통과 시간(초) */
  dur: number;
  spread: number;
  drop: number;
  /** 동시에 떠 있는 입자 수 */
  count: number;
  anomaly: boolean;
  name: string;
  delta: number;
}

interface RegionState {
  id: RegionId;
  name: string;
  dc: string;
  p95: number;
  tier: Tier;
  ccu: number;
  paths: PathState[];
  /** 진행 중 장애 (클라·전역 제외) */
  causes: Cause[];
  pings: { cause: Cause; isp: number | null }[];
}

const TIER_LEVEL: Record<Tier, number> = { smooth: 0.38, good: 0.5, notice: 0.75, warning: 0.9, critical: 1 };

export function snapshot(m: BoardModel, t: number): { regions: RegionState[]; global: { cause: Cause; title: string }[] } {
  const act = m.incidents.filter((i) => isActiveAt(i, t) && i.detectIdx <= t);
  const regions = REGIONS.map((r) => {
    const rows = ispRows(m, r.id, t);
    const paths = rows.map((row) => {
      const ratio = row.jitter / Math.max(1, row.rttP50);
      return {
        color: CC_TIER[row.tier],
        tier: row.tier,
        dur: Math.min(4, 0.25 + row.rttP50 / 80),
        spread: Math.min(0.8, ratio),
        drop: Math.min(0.6, (row.loss / 100) * LOSS_EMPHASIS),
        count: Math.max(2, Math.min(9, Math.round(row.share * 18))),
        anomaly: row.anomaly,
        name: row.def.name,
        delta: row.delta,
      };
    });
    const mine = act.filter((i) => i.region === r.id && i.scopeType !== 'global');
    const p95 = m.regions[r.id].p95[t];
    return {
      id: r.id, name: r.name, dc: r.dc, p95, tier: tierOf(p95), ccu: m.regions[r.id].ccu[t], paths,
      causes: [...new Set(mine.map((i) => i.cause))],
      pings: mine.map((i) => ({
        cause: i.cause,
        isp: i.scopeType === 'isp' && i.isps?.[0] ? REGION_ISPS[r.id].findIndex((d) => d.id === i.isps![0].id) : null,
      })),
    };
  });
  const global = act.filter((i) => i.scopeType === 'global').map((i) => ({ cause: i.cause, title: i.title }));
  return { regions, global };
}

const FONT = (px: number, w = 600) => `${w} ${px}px 'Chakra Petch', 'Pretendard Variable', sans-serif`;

/** 경로 곡선: 위성 → 노드, 2차 베지어 (통신사마다 휘는 방향을 번갈아) */
function curve(s: [number, number], n: [number, number], i: number) {
  const mx = (s[0] + n[0]) / 2;
  const my = (s[1] + n[1]) / 2;
  const dx = n[0] - s[0];
  const dy = n[1] - s[1];
  const len = Math.hypot(dx, dy) || 1;
  const bend = (i % 2 ? 1 : -1) * 0.22 * len;
  return { s, c: [mx - (dy / len) * bend, my + (dx / len) * bend] as [number, number], n, len };
}
type Curve = ReturnType<typeof curve>;
function at(cv: Curve, p: number, lateral = 0): [number, number] {
  const q = 1 - p;
  let x = q * q * cv.s[0] + 2 * q * p * cv.c[0] + p * p * cv.n[0];
  let y = q * q * cv.s[1] + 2 * q * p * cv.c[1] + p * p * cv.n[1];
  if (lateral) {
    // 접선의 법선 방향으로 흔들림 (양 끝에서는 0)
    const tx = 2 * q * (cv.c[0] - cv.s[0]) + 2 * p * (cv.n[0] - cv.c[0]);
    const ty = 2 * q * (cv.c[1] - cv.s[1]) + 2 * p * (cv.n[1] - cv.c[1]);
    const tl = Math.hypot(tx, ty) || 1;
    const k = lateral * Math.sin(p * Math.PI);
    x += (-ty / tl) * k;
    y += (tx / tl) * k;
  }
  return [x, y];
}

type Snapshot = ReturnType<typeof snapshot>;
interface Geo { g: MapGeometry; lay: Record<RegionId, NodeLayout>; curves: Record<RegionId, Curve[]> }

/** 모션이 꺼졌을 때: 같은 인코딩의 정지 화면 — 경로선 + 흐름 방향 화살촉, 손실 경로는 점선, 장애는 정지 링 두 겹 */
function drawStatic(ctx: CanvasRenderingContext2D, geo: Geo, s: Snapshot, sc: Scope) {
  const { g, lay, curves } = geo;
  ctx.clearRect(0, 0, g.w, g.h);
  for (const r of s.regions) {
    ctx.globalAlpha = sc === 'ALL' || sc === r.id ? 1 : 0.35;
    r.paths.forEach((ps, i) => {
      const c = curves[r.id][i];
      ctx.strokeStyle = alpha(ps.color, 0.85);
      ctx.lineWidth = 1.6;
      ctx.setLineDash(ps.drop > 0.03 ? [3, 3] : []);
      ctx.beginPath();
      ctx.moveTo(c.s[0], c.s[1]);
      ctx.quadraticCurveTo(c.c[0], c.c[1], c.n[0], c.n[1]);
      ctx.stroke();
      ctx.setLineDash([]);
      // 화살촉 — 흐름 방향
      const [ax, ay] = at(c, 0.72);
      const [bx, by] = at(c, 0.78);
      const ang = Math.atan2(by - ay, bx - ax);
      const hs = Math.max(3, 4.5 * g.u);
      ctx.fillStyle = ps.color;
      ctx.beginPath();
      ctx.moveTo(bx + Math.cos(ang) * hs, by + Math.sin(ang) * hs);
      ctx.lineTo(bx + Math.cos(ang + 2.5) * hs, by + Math.sin(ang + 2.5) * hs);
      ctx.lineTo(bx + Math.cos(ang - 2.5) * hs, by + Math.sin(ang - 2.5) * hs);
      ctx.fill();
    });
    // 진행 중 장애: 정지 링 두 겹
    r.pings.forEach((pg) => {
      const L = lay[r.id];
      const [x, y] = pg.isp !== null && pg.isp >= 0 ? L.sats[pg.isp] : L.node;
      const base = pg.isp !== null ? 7 * g.u : 20 * g.u;
      ctx.strokeStyle = CC_CAUSE[pg.cause];
      ctx.lineWidth = 2;
      [1, 1.55].forEach((k) => {
        ctx.globalAlpha = k === 1 ? 0.95 : 0.5;
        ctx.beginPath();
        ctx.arc(x, y, Math.max(6, base * k), 0, Math.PI * 2);
        ctx.stroke();
      });
      ctx.globalAlpha = 1;
    });
  }
  ctx.globalAlpha = 1;
}

interface Particle { p: number; dur: number; lat: number; dropAt: number | null }
interface Spark { x: number; y: number; age: number }

export function WorldFlowMap({ m, t, scope, onScope }: {
  m: BoardModel; t: number; scope: Scope; onScope: (s: Scope) => void;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const baseRef = useRef<HTMLCanvasElement>(null);
  const fxRef = useRef<HTMLCanvasElement>(null);
  const motion = useMotionOn();
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [fontTick, setFontTick] = useState(0);

  // 크기 추적 — 스테이지 상자에 지도를 맞춘다
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      const w = Math.round(e.contentRect.width);
      const h = Math.round(e.contentRect.height);
      setSize((s) => (s && s.w === w && s.h === h ? s : { w, h }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // 캔버스 글자는 웹폰트가 늦게 오면 대체 서체로 남는다 → 로딩이 끝나면 다시 그린다
  useEffect(() => {
    const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
    const on = () => setFontTick((x) => x + 1);
    fonts?.ready.then(on);
    fonts?.addEventListener?.('loadingdone', on);
    return () => fonts?.removeEventListener?.('loadingdone', on);
  }, []);

  const geo = useMemo(() => {
    if (!size || size.w < 50) return null;
    const g = makeGeometry(size.w, size.h > 60 ? size.h : undefined);
    const lay = nodeLayout(g);
    const dots = landDots(g, Math.max(3.4, 5.6 * g.u));
    // 점마다 가장 가까운 DC와 거리 비율 — 등급색 물들임에 쓴다
    const ids = REGIONS.map((r) => r.id);
    const owner = new Int8Array(dots.length / 2).fill(-1);
    const fall = new Float32Array(dots.length / 2);
    const rho = 130 * g.u;
    for (let i = 0; i < dots.length / 2; i++) {
      let best = Infinity;
      let bi = -1;
      ids.forEach((id, k) => {
        const d = Math.hypot(dots[i * 2] - lay[id].geo[0], dots[i * 2 + 1] - lay[id].geo[1]);
        if (d < best) { best = d; bi = k; }
      });
      if (best < rho) { owner[i] = bi; fall[i] = (1 - best / rho) ** 1.6; }
    }
    const curves = Object.fromEntries(ids.map((id) => [id, lay[id].sats.map((s, i) => curve(s, lay[id].node, i))])) as Record<RegionId, Curve[]>;
    return { g, lay, dots, owner, fall, curves };
  }, [size]);

  const snap = useMemo(() => snapshot(m, t), [m, t]);
  const live = useRef({ snap, scope, motion });
  live.current = { snap, scope, motion };
  const maxCcu = Math.max(...snap.regions.map((r) => r.ccu));

  // ── 정적 층: 점묘 대륙 · 등급 물들임 · 지시선 · 궤도 · 위성 · 노드 (시점·범위가 바뀔 때만 다시 그림)
  useEffect(() => {
    const cv = baseRef.current;
    if (!cv || !geo) return;
    const { g, lay, dots, owner, fall, curves } = geo;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.round(g.w * dpr);
    cv.height = Math.round(g.h * dpr);
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, g.w, g.h);
    const regs = snap.regions;
    const dim = (id: RegionId) => (scope === 'ALL' || scope === id ? 1 : 0.35);

    // 권역 후광
    ctx.globalCompositeOperation = 'lighter';
    regs.forEach((r) => {
      const [x, y] = lay[r.id].geo;
      const rad = 150 * g.u * (0.7 + TIER_LEVEL[r.tier] * 0.5);
      const grd = ctx.createRadialGradient(x, y, 0, x, y, rad);
      grd.addColorStop(0, alpha(CC_TIER[r.tier], 0.2 * TIER_LEVEL[r.tier] * dim(r.id)));
      grd.addColorStop(1, alpha(CC_TIER[r.tier], 0));
      ctx.fillStyle = grd;
      ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    });
    ctx.globalCompositeOperation = 'source-over';

    // 대륙 점 — 기본색은 한 번에, 물든 점은 권역·농도 단계별로 묶어 그린다
    const dr = Math.max(0.7, 1.15 * g.u);
    ctx.fillStyle = CC.dot;
    ctx.beginPath();
    for (let i = 0; i < dots.length / 2; i++) {
      if (owner[i] >= 0 && fall[i] > 0.08) continue;
      ctx.moveTo(dots[i * 2] + dr, dots[i * 2 + 1]);
      ctx.arc(dots[i * 2], dots[i * 2 + 1], dr, 0, Math.PI * 2);
    }
    ctx.fill();
    const BUCKETS = 5;
    regs.forEach((r, k) => {
      for (let b = 0; b < BUCKETS; b++) {
        const lo = 0.08 + (b / BUCKETS) * 0.92;
        const hi = 0.08 + ((b + 1) / BUCKETS) * 0.92;
        const a = (0.22 + 0.78 * ((lo + hi) / 2)) * TIER_LEVEL[r.tier] * dim(r.id);
        ctx.fillStyle = alpha(CC_TIER[r.tier], Math.max(0.18, a));
        ctx.beginPath();
        for (let i = 0; i < dots.length / 2; i++) {
          if (owner[i] !== k || fall[i] <= lo || fall[i] > hi) continue;
          ctx.moveTo(dots[i * 2] + dr * 1.15, dots[i * 2 + 1]);
          ctx.arc(dots[i * 2], dots[i * 2 + 1], dr * 1.15, 0, Math.PI * 2);
        }
        ctx.fill();
      }
    });

    regs.forEach((r) => {
      const L = lay[r.id];
      const d = dim(r.id);
      ctx.globalAlpha = d;
      // 실제 위치 표식 + 지시선
      const moved = Math.hypot(L.node[0] - L.geo[0], L.node[1] - L.geo[1]) > 12;
      if (moved) {
        // 지시선은 실제 위치 표식에서 노드 궤도 바깥까지만 (궤도 안은 입자 공간)
        const dx = L.geo[0] - L.node[0];
        const dy = L.geo[1] - L.node[1];
        const dl = Math.hypot(dx, dy);
        const ex = L.node[0] + (dx / dl) * (L.ring + 4);
        const ey = L.node[1] + (dy / dl) * (L.ring + 4);
        ctx.strokeStyle = alpha(CC_TIER[r.tier], 0.7);
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(L.geo[0], L.geo[1]);
        ctx.lineTo(ex, ey);
        ctx.stroke();
        const gr = Math.max(2.4, 3.4 * g.u);
        ctx.shadowColor = CC_TIER[r.tier];
        ctx.shadowBlur = 10;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(L.geo[0], L.geo[1], gr * 0.55, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = CC_TIER[r.tier];
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(L.geo[0], L.geo[1], gr * 1.6, 0, Math.PI * 2);
        ctx.stroke();
      }
      // 궤도
      ctx.strokeStyle = alpha(CC.cyan, 0.13);
      ctx.setLineDash([1.5, 4]);
      ctx.beginPath();
      ctx.arc(L.node[0], L.node[1], L.ring, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      // 경로 바탕선 (입자가 지나갈 길)
      curves[r.id].forEach((c, i) => {
        const p = r.paths[i];
        ctx.strokeStyle = alpha(p.color, p.anomaly ? 0.32 : 0.12);
        ctx.lineWidth = p.anomaly ? 1.4 : 1;
        ctx.beginPath();
        ctx.moveTo(c.s[0], c.s[1]);
        ctx.quadraticCurveTo(c.c[0], c.c[1], c.n[0], c.n[1]);
        ctx.stroke();
      });
      // 위성 (통신사)
      L.sats.forEach((s, i) => {
        const p = r.paths[i];
        const rad = Math.max(2.2, (p.anomaly ? 4.2 : 3) * g.u);
        ctx.shadowColor = p.color;
        ctx.shadowBlur = p.anomaly ? 12 : 6;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(s[0], s[1], rad, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        // 이상 경로이거나 선택한 권역이면 통신사 이름을 단다
        const showName = g.u > 0.55 && (p.anomaly || scope === r.id);
        if (showName) {
          const dx = s[0] - L.node[0];
          const dy = s[1] - L.node[1];
          const dl = Math.hypot(dx, dy) || 1;
          const lx = s[0] + (dx / dl) * (rad + 6);
          const ly = s[1] + (dy / dl) * (rad + 6);
          ctx.textAlign = dx > 4 ? 'left' : dx < -4 ? 'right' : 'center';
          ctx.textBaseline = dy > 4 ? 'top' : dy < -4 ? 'bottom' : 'middle';
          ctx.font = FONT(p.anomaly ? 11.5 : 10.5, p.anomaly ? 700 : 500);
          ctx.fillStyle = p.anomaly ? p.color : alpha(CC.ink2, 0.9);
          const txt = p.anomaly ? `${p.name} +${Math.round(p.delta)}ms` : p.name;
          ctx.fillText(txt, lx, ly);
        }
      });
      // 노드 코어 — 크기 ∝ √동접
      const core = Math.max(4.5, (7 + 7 * Math.sqrt(r.ccu / maxCcu)) * g.u);
      const [x, y] = L.node;
      const grd = ctx.createRadialGradient(x, y, 0, x, y, core * 2.6);
      grd.addColorStop(0, alpha(CC_TIER[r.tier], 0.55));
      grd.addColorStop(1, alpha(CC_TIER[r.tier], 0));
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.arc(x, y, core * 2.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#04070f';
      ctx.strokeStyle = CC_TIER[r.tier];
      ctx.lineWidth = 2;
      ctx.shadowColor = CC_TIER[r.tier];
      ctx.shadowBlur = 16;
      ctx.beginPath();
      ctx.arc(x, y, core, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.fillStyle = CC_TIER[r.tier];
      ctx.beginPath();
      ctx.arc(x, y, core * 0.42, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    });
  }, [geo, snap, scope, maxCcu, fontTick]);

  // ── 움직이는 층: 입자 · 손실 불꽃 · 장애 소나 (requestAnimationFrame, 화면 밖·숨은 탭에서는 멈춤)
  useEffect(() => {
    const cv = fxRef.current;
    if (!cv || !geo || !motion) return;
    const { g, lay, curves } = geo;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.round(g.w * dpr);
    cv.height = Math.round(g.h * dpr);
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const parts: Record<string, Particle[]> = {};
    const acc: Record<string, number> = {};
    const sparks: Spark[] = [];
    const key = (id: RegionId, i: number) => `${id}:${i}`;
    const spawn = (ps: PathState): Particle => ({
      p: 0,
      dur: ps.dur * (1 + (Math.random() - 0.5) * 2 * ps.spread * 0.6),
      lat: (Math.random() - 0.5) * 2,
      dropAt: Math.random() < ps.drop ? 0.25 + Math.random() * 0.6 : null,
    });
    // 처음부터 경로가 차 있도록 미리 뿌려 둔다
    for (const r of live.current.snap.regions) {
      r.paths.forEach((ps, i) => {
        parts[key(r.id, i)] = Array.from({ length: ps.count }, (_, k) => ({ ...spawn(ps), p: k / ps.count }));
        acc[key(r.id, i)] = 0;
      });
    }


    let raf = 0;
    let last = 0;
    let visible = true;
    let clock = 0;
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      if (visible && !document.hidden) { cancelAnimationFrame(raf); last = 0; raf = requestAnimationFrame(frame); }
    });
    io.observe(cv);
    const onVis = () => {
      if (!document.hidden && visible) { cancelAnimationFrame(raf); last = 0; raf = requestAnimationFrame(frame); }
    };
    document.addEventListener('visibilitychange', onVis);

    function frame(now: number) {
      if (!visible || document.hidden) return;
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 0.016;
      last = now;
      clock += dt;
      const { snap: s, scope: sc } = live.current;
      ctx!.clearRect(0, 0, g.w, g.h);
      ctx!.globalCompositeOperation = 'lighter';
      const head = Math.max(1.3, 1.9 * g.u);
      for (const r of s.regions) {
        const dimA = sc === 'ALL' || sc === r.id ? 1 : 0.3;
        r.paths.forEach((ps, i) => {
          const k = key(r.id, i);
          const list = parts[k] ?? (parts[k] = []);
          const c = curves[r.id][i];
          // 생성: 경로에 평균 count개가 떠 있도록 (간격 = 통과 시간 / count)
          acc[k] = (acc[k] ?? 0) + dt;
          const interval = ps.dur / ps.count;
          while (acc[k] > interval) {
            acc[k] -= interval;
            if (list.length < ps.count * 2) list.push(spawn(ps));
          }
          ctx!.fillStyle = ps.color;
          ctx!.strokeStyle = ps.color;
          for (let j = list.length - 1; j >= 0; j--) {
            const pt = list[j];
            pt.p += dt / pt.dur;
            const lat = pt.lat * ps.spread * 9 * g.u;
            if (pt.dropAt !== null && pt.p >= pt.dropAt) {
              const [x, y] = at(c, pt.dropAt, lat);
              sparks.push({ x, y, age: 0 });
              list.splice(j, 1);
              continue;
            }
            if (pt.p >= 1) { list.splice(j, 1); continue; }
            const [x, y] = at(c, pt.p, lat);
            const [tx, ty] = at(c, Math.max(0, pt.p - 0.16), lat);
            ctx!.globalAlpha = 0.35 * dimA;
            ctx!.lineWidth = head * 0.9;
            ctx!.beginPath();
            ctx!.moveTo(tx, ty);
            ctx!.lineTo(x, y);
            ctx!.stroke();
            ctx!.globalAlpha = dimA;
            ctx!.beginPath();
            ctx!.arc(x, y, head, 0, Math.PI * 2);
            ctx!.fill();
          }
        });
        // 장애 소나 — 2.4초 주기로 두 겹이 엇갈려 퍼진다 (진행 중 경보)
        r.pings.forEach((pg, n) => {
          const L = lay[r.id];
          const [x, y] = pg.isp !== null && pg.isp >= 0 ? L.sats[pg.isp] : L.node;
          const from = pg.isp !== null ? 4 * g.u : 10 * g.u;
          const to = pg.isp !== null ? 26 * g.u : L.ring * 1.25;
          for (const off of [0, 0.5]) {
            const ph = ((clock / 2.4 + off + n * 0.17) % 1 + 1) % 1;
            ctx!.globalAlpha = (1 - ph) ** 1.6 * dimA;
            ctx!.strokeStyle = CC_CAUSE[pg.cause];
            ctx!.lineWidth = 2.2 * (1 - ph) + 0.6;
            ctx!.beginPath();
            ctx!.arc(x, y, Math.max(4, from + (to - from) * ph), 0, Math.PI * 2);
            ctx!.stroke();
          }
        });
      }
      // 손실 불꽃
      for (let j = sparks.length - 1; j >= 0; j--) {
        const sp = sparks[j];
        sp.age += dt;
        if (sp.age > 0.5) { sparks.splice(j, 1); continue; }
        const q = sp.age / 0.5;
        ctx!.globalAlpha = 1 - q;
        ctx!.strokeStyle = CC_TIER.critical;
        ctx!.lineWidth = 1.2;
        ctx!.beginPath();
        ctx!.arc(sp.x, sp.y, 1.5 + q * 6 * Math.max(0.6, g.u), 0, Math.PI * 2);
        ctx!.stroke();
      }
      ctx!.globalAlpha = 1;
      ctx!.globalCompositeOperation = 'source-over';
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [geo, motion]);

  // 모션이 꺼진 상태: 시점·범위가 바뀔 때마다 정지 화면을 다시 그린다
  useEffect(() => {
    const cv = fxRef.current;
    if (motion || !geo || !cv) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.round(geo.g.w * dpr);
    cv.height = Math.round(geo.g.h * dpr);
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawStatic(ctx, geo, snap, scope);
  }, [motion, geo, snap, scope]);

  const worst = [...snap.regions].sort((a, b) => b.p95 - a.p95);
  const bad = worst.filter((r) => TIER_RANK[r.tier] >= TIER_RANK.notice);
  const summary = `세계 트래픽 흐름 지도. 6개 권역 중 주의 이상 ${bad.length}곳${bad.length ? ': ' + bad.map((r) => `${r.name} ${fmtInt(r.p95)}ms ${TIER_LABEL[r.tier]}`).join(', ') : ''}. ` +
    snap.regions.flatMap((r) => r.paths.filter((p) => p.anomaly).map((p) => `${r.name} ${p.name} 경로 +${Math.round(p.delta)}ms`)).join(', ');

  const cs = cardSize(geo ? geo.g.u : 0);
  const cards = useMemo(() => {
    if (!geo) return null;
    const c = cardSize(geo.g.u);
    return placeCards(geo.lay, geo.g, c, geo.lay.KR.ring + c.gapExtra);
  }, [geo]);
  return (
    <div className={`cc-map-stage is-${cs.size}`} ref={stageRef}>
      <canvas ref={baseRef} className="cc-map-base" style={geo ? { width: geo.g.w, height: geo.g.h } : undefined} aria-hidden />
      <canvas ref={fxRef} className="cc-map-fx" style={geo ? { width: geo.g.w, height: geo.g.h } : undefined} role="img" aria-label={summary} />
      {geo && cards && snap.regions.map((r) => (
        <NodeCard key={r.id} r={r} rect={cards[r.id]} selected={scope === r.id} dimmed={scope !== 'ALL' && scope !== r.id}
          onClick={() => onScope(scope === r.id ? 'ALL' : r.id)} />
      ))}
      <span className="cc-map-scan" aria-hidden />
    </div>
  );
}

function NodeCard({ r, rect, selected, dimmed, onClick }: {
  r: RegionState; rect: CardRect; selected: boolean; dimmed: boolean; onClick: () => void;
}) {
  const pulse = useEscalation(TIER_RANK[r.tier]);
  const Icon = TIER_ICON[r.tier];
  return (
    <button
      type="button"
      className={`cc-node-card cc-t-${r.tier} ${selected ? 'is-selected' : ''} ${dimmed ? 'is-dimmed' : ''}`}
      style={{ left: rect.x, top: rect.y, width: rect.w, minHeight: rect.h }}
      onClick={onClick}
      aria-pressed={selected}
      aria-label={`${r.name} ${r.dc}, 유저 p95 ${fmtInt(r.p95)}ms ${TIER_LABEL[r.tier]}, 동접 ${fmtCompact(r.ccu)}명. 눌러서 이 권역만 보기`}
      title={`${r.name} · ${DC_LONLAT[r.id][1].toFixed(1)}°, ${DC_LONLAT[r.id][0].toFixed(1)}° · 동접 ${fmtCompact(r.ccu)}`}
    >
      <span className="cc-nc-head">
        <b>{r.name}</b>
        <span className="cc-nc-dc">{r.dc}</span>
      </span>
      <span className="cc-nc-val">
        <RollingNumber text={fmtInt(r.p95)} />
        <small>ms</small>
        <Icon className="cc-nc-icon" size={11} strokeWidth={2.6} aria-hidden />
      </span>
      <span className="cc-nc-tier">
        <Icon size={11} strokeWidth={2.6} aria-hidden />
        {TIER_LABEL[r.tier]}
        {r.causes.map((c) => <i key={c} className={`cc-dotc cc-c-${c}`} title={CAUSE_LABEL[c]} />)}
      </span>
      {pulse > 0 && <span key={pulse} className={`cc-nc-pulse cc-t-${r.tier}`} aria-hidden />}
    </button>
  );
}
