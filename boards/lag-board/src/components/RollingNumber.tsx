/**
 * 롤링 숫자 — 값이 바뀌면 자릿수 열이 굴러가며 새 숫자로 맞춰진다 (NumberFlow 방식).
 *
 * - 자릿수는 오른쪽 기준 위치로 식별해, 자릿수가 늘거나 줄어도 일의 자리는 일의 자리끼리 이어진다.
 * - 보이지 않는 고스트 숫자가 기준선(baseline)·폭을 잡고, 굴러가는 열은 그 위에 절대 위치로 얹는다.
 *   → 주변 단위(ms, 명)와 기준선이 어긋나지 않는다.
 * - 롤링 중 폭이 흔들리지 않도록 tabular-nums를 쓴다 (정적인 큰 숫자는 비례폭이 원칙이지만, 움직이는 숫자는 예외).
 * - 스크린리더에는 완성된 문자열만 읽힌다.
 */
const DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

export function RollingNumber({ text, className = '' }: { text: string; className?: string }) {
  const chars = Array.from(text);
  const n = chars.length;
  return (
    <span className={`rn ${className}`}>
      <span className="sr-only">{text}</span>
      <span className="rn-track" aria-hidden>
        {chars.map((ch, i) => {
          const pos = n - i; // 오른쪽에서 몇 번째
          if (ch >= '0' && ch <= '9') {
            const d = +ch;
            return (
              <span key={`d${pos}`} className="rn-digit">
                <span className="rn-ghost">{ch}</span>
                <span className="rn-col" style={{ transform: `translateY(${-d * 10}%)` }}>
                  {DIGITS.map((x) => <span key={x}>{x}</span>)}
                </span>
              </span>
            );
          }
          return <span key={`c${pos}${ch}`} className="rn-sym">{ch}</span>;
        })}
      </span>
    </span>
  );
}
