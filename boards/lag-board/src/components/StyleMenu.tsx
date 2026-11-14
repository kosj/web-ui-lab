import { useEffect, useRef, useState } from 'react';
import { Check, Palette } from 'lucide-react';
import { STYLE_BY_ID, STYLES, type StyleId } from '../lib/style';

/** 스타일 고르기 — 견본 색 3개와 한 줄 설명. Esc·바깥 클릭으로 닫힌다. */
export function StyleMenu({ style, onStyle }: { style: StyleId; onStyle: (s: StyleId) => void }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const cur = STYLE_BY_ID[style];

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    root.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus();
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const move = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const items = Array.from(root.current?.querySelectorAll<HTMLButtonElement>('.style-item') ?? []);
    const i = items.indexOf(document.activeElement as HTMLButtonElement);
    items[(i + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length]?.focus();
  };

  return (
    <div className="style-menu" ref={root}>
      <button type="button" className="btn style-trigger" aria-haspopup="true" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <Palette size={14} aria-hidden />
        <span className="style-trigger-label">스타일</span>
        <b>{cur.name}</b>
      </button>
      {open && (
        <div className="style-pop" role="radiogroup" aria-label="보드 스타일" onKeyDown={move}>
          {STYLES.map((s) => (
            <button
              key={s.id}
              type="button"
              role="radio"
              aria-checked={s.id === style}
              className="style-item"
              onClick={() => { onStyle(s.id); setOpen(false); }}
            >
              <span className="style-swatch" aria-hidden style={{ background: s.swatch[0] }}>
                <i style={{ background: s.swatch[1] }} />
                <i style={{ background: s.swatch[2] }} />
              </span>
              <span className="style-text">
                <b>{s.name}</b>
                <span>{s.hint}{s.themes.length === 1 ? ` · ${s.themes[0] === 'dark' ? '다크' : '라이트'} 전용` : ''}</span>
              </span>
              {s.id === style && <Check size={16} strokeWidth={2.6} aria-hidden className="style-check" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
