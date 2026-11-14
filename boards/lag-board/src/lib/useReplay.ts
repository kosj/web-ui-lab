import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * 장애 재생 엔진 — 시간 커서를 일정 속도로 앞으로 보낸다.
 * speed: 1초에 진행할 분(分). requestAnimationFrame으로 흐르되 React 갱신은 ~8fps로 묶어
 * 보드 전체 재계산 비용을 제한한다(커서 이동은 CSS 전환이 사이를 메운다).
 */
export const REPLAY_SPEEDS = [10, 30, 60] as const;
export type ReplaySpeed = (typeof REPLAY_SPEEDS)[number];
export const FRAME_MS = 120;

export interface ReplayWindow { from: number; to: number }

/** 순수 함수: 경과 시간(ms) → 커서 인덱스 */
export function replayIndex(win: ReplayWindow, elapsedMs: number, speed: number) {
  return Math.min(win.to, win.from + Math.floor((elapsedMs / 1000) * speed));
}

/** liveIdx: 이 위치까지 재생하면 재생 상태를 완전히 끝내고(LIVE 복귀) 컨트롤을 닫는다 */
export function useReplay(onFrame: (idx: number) => void, onEnd: () => void, liveIdx = Infinity) {
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<ReplaySpeed>(30);
  const [win, setWin] = useState<ReplayWindow | null>(null);
  const [pos, setPos] = useState<number | null>(null);
  const raf = useRef(0);
  const state = useRef({ elapsed: 0, last: 0, lastEmit: 0, speed: 30 as number, win: null as ReplayWindow | null });
  const cb = useRef({ onFrame, onEnd, liveIdx });
  cb.current = { onFrame, onEnd, liveIdx };

  const loop = useCallback((now: number) => {
    const s = state.current;
    if (!s.win) return;
    if (s.last) s.elapsed += now - s.last;
    s.last = now;
    if (now - s.lastEmit >= FRAME_MS) {
      s.lastEmit = now;
      const idx = replayIndex(s.win, s.elapsed, s.speed);
      setPos(idx);
      cb.current.onFrame(idx);
      if (idx >= s.win.to) {
        setPlaying(false);
        if (s.win.to >= cb.current.liveIdx) {
          // 현재 시각까지 재생 → 재생 모드를 닫고 LIVE로
          s.win = null;
          setWin(null);
          setPos(null);
        }
        cb.current.onEnd();
        return;
      }
    }
    raf.current = requestAnimationFrame(loop);
  }, []);

  const start = useCallback((w: ReplayWindow, sp?: ReplaySpeed) => {
    cancelAnimationFrame(raf.current);
    const s = state.current;
    s.win = w;
    s.elapsed = 0;
    s.last = 0;
    s.lastEmit = 0;
    if (sp) { s.speed = sp; setSpeed(sp); }
    setWin(w);
    setPos(w.from);
    setPlaying(true);
    cb.current.onFrame(w.from);
    raf.current = requestAnimationFrame(loop);
  }, [loop]);

  const pause = useCallback(() => {
    cancelAnimationFrame(raf.current);
    state.current.last = 0;
    setPlaying(false);
  }, []);

  const resume = useCallback(() => {
    if (!state.current.win) return;
    state.current.last = 0;
    setPlaying(true);
    raf.current = requestAnimationFrame(loop);
  }, [loop]);

  const stop = useCallback(() => {
    cancelAnimationFrame(raf.current);
    state.current.win = null;
    setWin(null);
    setPos(null);
    setPlaying(false);
  }, []);

  const changeSpeed = useCallback((sp: ReplaySpeed) => {
    const s = state.current;
    // 현재 위치를 유지한 채 속도만 바꾼다
    if (s.win) s.elapsed = (s.elapsed * s.speed) / sp;
    s.speed = sp;
    setSpeed(sp);
  }, []);

  // 탭이 숨겨지면 멈춤 (보이지 않는 애니메이션 금지)
  useEffect(() => {
    const onVis = () => { if (document.hidden) pause(); };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      cancelAnimationFrame(raf.current);
    };
  }, [pause]);

  return { playing, speed, win, pos, active: win !== null, start, pause, resume, stop, changeSpeed };
}
