import { useCallback, useEffect, useState } from 'react';

export type ThemeMode = 'dark' | 'light';
const KEY = 'lag-board:theme';

function read(): ThemeMode {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'dark' || v === 'light') return v;
  } catch {
    /* 저장소 차단 환경 — 기본값 사용 */
  }
  // 호스트(뷰어)가 명시한 테마가 있으면 따르고, 없으면 관제 화면 기본값인 다크
  const host = document.documentElement.getAttribute('data-theme');
  if (host === 'light' || host === 'dark') return host;
  return 'dark';
}

export function useTheme() {
  const [mode, setMode] = useState<ThemeMode>(read);
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', mode);
    try {
      localStorage.setItem(KEY, mode);
    } catch {
      /* noop */
    }
  }, [mode]);
  const toggle = useCallback(() => setMode((m) => (m === 'dark' ? 'light' : 'dark')), []);
  return { mode, toggle };
}

/** 차트(캔버스)는 CSS 변수를 직접 못 읽으므로, 테마가 바뀔 때마다 계산된 값을 읽어 넘긴다 */
export interface Tokens {
  bg: string; surface1: string; surface2: string; surface3: string; line: string; lineStrong: string;
  ink1: string; ink2: string; ink3: string; select: string;
  causeInfra: string; causeNetwork: string; causeServer: string; causeClient: string; causeBase: string;
  tierSmooth: string; tierGood: string; tierNotice: string; tierWarning: string; tierCritical: string;
  grid: string; axis: string; fontSans: string;
}

const MAP: Record<keyof Tokens, string> = {
  bg: '--bg', surface1: '--surface-1', surface2: '--surface-2', surface3: '--surface-3', line: '--line', lineStrong: '--line-strong',
  ink1: '--ink-1', ink2: '--ink-2', ink3: '--ink-3', select: '--select',
  causeInfra: '--cause-infra', causeNetwork: '--cause-network', causeServer: '--cause-server', causeClient: '--cause-client', causeBase: '--cause-base',
  tierSmooth: '--tier-smooth', tierGood: '--tier-good', tierNotice: '--tier-notice', tierWarning: '--tier-warning', tierCritical: '--tier-critical',
  grid: '--grid', axis: '--axis', fontSans: '--font-sans',
};

export function readTokens(): Tokens {
  const cs = getComputedStyle(document.documentElement);
  const out = {} as Tokens;
  for (const [k, v] of Object.entries(MAP)) out[k as keyof Tokens] = cs.getPropertyValue(v).trim();
  return out;
}

export function useTokens(mode: ThemeMode) {
  const [tokens, setTokens] = useState<Tokens>(() => readTokens());
  useEffect(() => {
    setTokens(readTokens());
  }, [mode]);
  return tokens;
}
