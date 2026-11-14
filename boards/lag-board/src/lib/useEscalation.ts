import { useRef } from 'react';

/**
 * 등급이 "올라갔을 때만" 증가하는 펄스 키.
 * <span className="pulse-ring" key={pulse} />처럼 key로 쓰면 그 요소만 다시 마운트되어 링 애니메이션이 한 번 재생된다.
 * 내려갈 때나 같을 때는 조용하다 — 경보 모션은 악화에만 쓴다.
 */
export function useEscalation(rank: number) {
  const prev = useRef(rank);
  const pulse = useRef(0);
  if (rank > prev.current) pulse.current += 1;
  prev.current = rank;
  return pulse.current;
}
