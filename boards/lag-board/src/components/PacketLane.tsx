import { useEffect, useRef } from 'react';
import { useMotionOn } from '../lib/motion';

/**
 * 패킷 흐름 레인 — 통신사 경로(유저 → 게임 DC)를 입자 흐름으로 그린다.
 * 장식이 아니라 세 지표를 동시에 인코딩한다.
 *   - 속도: 입자가 레인을 건너는 시간 ∝ RTT p50 (0.25s + RTT/80ms초, 최대 4s) → 느린 경로는 눈에 띄게 느리다
 *   - 흔들림: 입자별 이동 시간이 지터/RTT 비율만큼 흩어져 뭉치고 벌어진다
 *   - 손실: 입자가 경로 중간에서 사라진다. 실제 손실률의 5배로 강조 (범례에 명시)
 * 모션이 꺼져 있으면 같은 인코딩의 정지 화면(균등 간격 + 손실 지점 빈 원)을 그린다.
 * 화면 밖이거나 탭이 숨겨지면 멈춘다.
 */
export const LOSS_EMPHASIS = 5;

interface Particle { born: number; dur: number; dropAt: number | null }

export function PacketLane({ rtt, jitter, loss, color, track, label }: {
  rtt: number; jitter: number; loss: number; color: string; track: string; label: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const motion = useMotionOn();
  const params = useRef({ rtt, jitter, loss, color, track });
  params.current = { rtt, jitter, loss, color, track };

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = cv.clientWidth || 120;
    const H = cv.clientHeight || 16;
    cv.width = Math.round(W * dpr);
    cv.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const pad = 4;
    const y = H / 2;
    const travel = () => Math.min(4, 0.25 + params.current.rtt / 80) * 1000;
    const spread = () => Math.min(0.6, params.current.jitter / Math.max(5, params.current.rtt));
    const dropP = () => Math.min(0.6, (params.current.loss * LOSS_EMPHASIS) / 100);
    let rnd = 0x2f6e2b1;
    const rand = () => ((rnd = (rnd * 1664525 + 1013904223) >>> 0) / 4294967296);
    const gauss = () => Math.sqrt(-2 * Math.log(rand() || 1e-9)) * Math.cos(2 * Math.PI * rand());

    const drawTrack = () => {
      ctx.clearRect(0, 0, W, H);
      ctx.strokeStyle = params.current.track;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(pad, y);
      ctx.lineTo(W - pad, y);
      ctx.stroke();
      // DC 끝점
      ctx.fillStyle = params.current.track;
      ctx.fillRect(W - pad, y - 4, 1.5, 8);
    };

    if (!motion) {
      // 정지 화면: 10개 입자를 균등 배치, 손실 비율만큼 빈 원
      drawTrack();
      const n = 10;
      const drops = Math.round(n * dropP());
      const dropped = new Set(Array.from({ length: drops }, (_, j) => Math.floor(((j + 0.5) * n) / drops)));
      for (let i = 0; i < n; i++) {
        const x = pad + ((i + 0.5) / n) * (W - pad * 2);
        ctx.beginPath();
        ctx.arc(x, y, 2.2, 0, Math.PI * 2);
        if (dropped.has(i)) {
          ctx.strokeStyle = params.current.color;
          ctx.stroke();
        } else {
          ctx.fillStyle = params.current.color;
          ctx.fill();
        }
      }
      return;
    }

    const parts: Particle[] = [];
    let raf = 0;
    let visible = true;
    let nextEmit = 0;
    const frame = (now: number) => {
      if (!visible || document.hidden) { raf = 0; return; }
      if (now >= nextEmit) {
        const base = travel();
        const dur = Math.max(150, base * (1 + gauss() * spread()));
        parts.push({ born: now, dur, dropAt: rand() < dropP() ? 0.2 + rand() * 0.65 : null });
        nextEmit = now + 90 * (0.7 + rand() * 0.6);
      }
      drawTrack();
      ctx.fillStyle = params.current.color;
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i];
        const u = (now - p.born) / p.dur;
        if (u >= 1) { parts.splice(i, 1); continue; }
        const x = pad + u * (W - pad * 2);
        let alpha = 1;
        let dy = 0;
        if (p.dropAt !== null && u > p.dropAt) {
          // 손실: 그 지점에서 아래로 떨어지며 사라진다
          const k = Math.min(1, (u - p.dropAt) / 0.12);
          alpha = 1 - k;
          dy = k * 5;
          if (k >= 1) { parts.splice(i, 1); continue; }
        }
        ctx.globalAlpha = alpha;
        ctx.beginPath();
        ctx.arc(p.dropAt !== null && u > p.dropAt ? pad + p.dropAt * (W - pad * 2) : x, y + dy, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(frame);
    };
    const start = () => { if (!raf) raf = requestAnimationFrame(frame); };
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      if (visible) start();
    });
    io.observe(cv);
    const onVis = () => { if (!document.hidden) start(); };
    document.addEventListener('visibilitychange', onVis);
    start();
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [motion, color, track]);

  return <canvas ref={ref} className="packet-lane" role="img" aria-label={label} />;
}
