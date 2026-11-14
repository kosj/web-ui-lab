import { useLayoutEffect, useRef } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { CAUSE_LABEL, TIER_LABEL, type RegionId } from '../data/config';
import { fmtInt, signed } from '../lib/format';
import { useMotionOn } from '../lib/motion';
import type { RankRow } from './race';
import { CAUSE_GLYPH } from './palette';

const SHOW = 16;

/**
 * 타이밍 타워 — 체감 지연이 나쁜 서버 순위 (F1 중계의 왼쪽 순위표).
 * 순위가 바뀌면 줄이 실제로 자리를 옮긴다 (FLIP: 이전 위치 → 새 위치를 transform으로 보간).
 * 순위를 올린(= 나빠진) 줄은 잠깐 노랗게 번쩍인다. 화면 중앙(ON AIR)에 나온 서버는 반전 표시.
 */
export function TimingTower({ rows, region, onAir, pinned, onPick }: {
  rows: RankRow[]; region: RegionId | null; onAir: string | null; pinned: boolean; onPick: (id: string) => void;
}) {
  const motion = useMotionOn();
  const nodes = useRef(new Map<string, HTMLLIElement>());
  const prevTop = useRef(new Map<string, number>());
  const shown = rows.slice(0, SHOW);
  const key = shown.map((r) => r.id).join('|');

  useLayoutEffect(() => {
    const next = new Map<string, number>();
    nodes.current.forEach((el, id) => next.set(id, el.offsetTop));
    if (motion && prevTop.current.size) {
      const replaying = document.documentElement.getAttribute('data-replay') === 'on';
      nodes.current.forEach((el, id) => {
        const before = prevTop.current.get(id);
        const after = next.get(id)!;
        if (before === undefined) {
          el.animate([{ opacity: 0, transform: 'translateX(-14px)' }, { opacity: 1, transform: 'none' }], { duration: 260, easing: 'cubic-bezier(0, 0, 0.38, 0.9)' });
          return;
        }
        const dy = before - after;
        if (!dy) return;
        el.animate([{ transform: `translateY(${dy}px)` }, { transform: 'translateY(0)' }], {
          duration: replaying ? 300 : 560, easing: 'cubic-bezier(0.2, 0, 0.2, 1)',
        });
        if (dy > 0) {
          el.animate([{ boxShadow: 'inset 0 0 0 999px rgba(255, 212, 0, 0.22)' }, { boxShadow: 'inset 0 0 0 999px rgba(255, 212, 0, 0)' }], { duration: 900, easing: 'ease-out' });
        }
      });
    }
    prevTop.current = next;
  }, [key, motion]);

  return (
    <section className="bc-panel bc-tower" aria-labelledby="bc-tower-title">
      <header className="bc-tab">
        <h2 id="bc-tower-title">타이밍 타워</h2>
        <span>{region ? `${region} 권역` : '전 서버'} · 5분 평균 체감 지연이 나쁜 순</span>
      </header>
      <div className="bc-tower-cols" aria-hidden>
        <span>순위</span><span>서버</span><span>원인</span><span>p95</span><span>기준 대비</span>
      </div>
      <ol className="bc-tower-list">
        {shown.map((r) => {
          const air = r.id === onAir;
          return (
            <li
              key={r.id}
              ref={(el) => { if (el) nodes.current.set(r.id, el); else nodes.current.delete(r.id); }}
              className={`bc-row bc-t-${r.tier} ${air ? 'is-onair' : ''} ${r.rank <= 3 ? 'is-top' : ''}`}
            >
              <button type="button" onClick={() => onPick(r.id)} aria-pressed={air && pinned}
                aria-label={`${r.rank}위 ${r.id} ${r.name}, 5분 평균 ${fmtInt(r.avg)}ms ${TIER_LABEL[r.tier]}, 기준 대비 ${signed(r.excess, 'ms')}${r.cause ? `, 원인 ${CAUSE_LABEL[r.cause]}` : ''}${r.change ? `, 10분 사이 ${Math.abs(r.change)}계단 ${r.change > 0 ? '상승' : '하락'}` : ''}`}>
                <span className="bc-pos num">{r.rank}</span>
                <span className="bc-chg" aria-hidden>
                  {r.change > 0 && <span className="up"><ChevronUp size={12} strokeWidth={3} />{r.change}</span>}
                  {r.change < 0 && <span className="down"><ChevronDown size={12} strokeWidth={3} />{-r.change}</span>}
                </span>
                <span className="bc-strip" aria-hidden />
                <span className="bc-name"><b className="num">{r.id}</b><small>{r.name}</small></span>
                <span className="bc-tyre" aria-hidden>
                  {r.cause ? <i className={`bc-c-${r.cause}`} title={CAUSE_LABEL[r.cause]}>{CAUSE_GLYPH[r.cause]}</i> : <i className="none">–</i>}
                </span>
                <span className="bc-val num">{fmtInt(r.avg)}</span>
                <span className="bc-gap num">{signed(r.excess)}</span>
              </button>
            </li>
          );
        })}
      </ol>
      <p className="bc-tower-foot">
        {rows.length > SHOW ? `외 ${rows.length - SHOW}개 서버` : `${rows.length}개 서버`} · 줄을 누르면 ON AIR 고정 · 화살표 = 10분 사이 순위 변동(위 = 악화)
      </p>
    </section>
  );
}
