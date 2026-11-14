import { useRef } from 'react';

/** 이벤트 핸들러가 항상 최신 props를 보도록 ref로 보관 */
export function useLatest<T>(v: T) {
  const r = useRef(v);
  r.current = v;
  return r;
}
