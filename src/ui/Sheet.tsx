import { useEffect, useRef, type PointerEvent, type ReactNode } from 'react';
import { HALF, PEEK_PX, type Layout, type SheetState } from '../app/layout';

const NEXT: Record<SheetState, SheetState> = { peek: 'half', half: 'full', full: 'peek' };
/** Pixels travelled before a touch counts as a drag, and the downward speed (px/ms) that counts as a flick. */
const SLOP = 8;
const FLICK = 0.5;
const CLOSE_MS = 180;

/** The full sheet reaches up to just below the top bar (styles.css uses the same --top-space). */
function fullPx(el: HTMLElement) {
  const v = parseFloat(getComputedStyle(el).getPropertyValue('--top-space'));
  return window.innerHeight - (Number.isFinite(v) ? v : 130) - 10;
}

/**
 * The details panel. On desktops it floats on the right; on phones and portrait tablets it is a bottom
 * sheet: tap the handle to step peek → half → full, or drag it (by the handle, by the title row, or by
 * pulling down on the content when it is scrolled to the top) and it follows the finger and snaps to the
 * nearest height. A `dismissible` sheet (a structure's details) closes when it is dragged down past its
 * folded height or flicked down; panels that switch the mode cannot be closed, only folded.
 * Phones on their side get a side sheet that the handle folds to one line.
 */
export function Sheet({ layout, state, onState, dismissible = false, onClose, children }: {
  layout: Layout; state: SheetState; onState: (s: SheetState) => void; dismissible?: boolean; onClose?: () => void; children: ReactNode;
}) {
  const aside = useRef<HTMLElement>(null);
  const drag = useRef<{ y: number; h: number; to: number; moved: boolean; t: number; speed: number } | null>(null);
  const compact = layout !== 'desktop';
  // The latest props, for the touch listeners that are attached once.
  const live = useRef({ layout, state, onState, dismissible, onClose });
  live.current = { layout, state, onState, dismissible, onClose };
  const step = () => {
    const { layout: l, state: st, onState: set } = live.current;
    set(l === 'landscape' ? (st === 'peek' ? 'half' : 'peek') : NEXT[st]);
  };

  const begin = (y: number) => {
    const el = aside.current;
    if (!el) return;
    const h = el.getBoundingClientRect().height;
    drag.current = { y, h, to: h, moved: false, t: performance.now(), speed: 0 };
  };
  /** Follow the finger; false while the movement is still too small to count as a drag. */
  const move = (y: number) => {
    const d = drag.current, el = aside.current;
    if (!d || !el || live.current.layout !== 'sheet') return false;
    const dy = d.y - y;
    if (!d.moved && Math.abs(dy) < SLOP) return false;
    d.moved = true;
    const now = performance.now();
    d.speed = (d.to - Math.min(Math.max(d.h + dy, 0), fullPx(el))) / Math.max(1, now - d.t);
    d.t = now;
    d.to = Math.min(Math.max(d.h + dy, live.current.dismissible ? 0 : PEEK_PX), fullPx(el));
    // Follow the finger without the height animation.
    el.style.transition = 'none';
    el.style.blockSize = `${d.to}px`;
    return true;
  };
  const end = () => {
    const d = drag.current, el = aside.current;
    drag.current = null;
    if (!d || !el) return;
    const { onState: set, dismissible: canClose, onClose: close } = live.current;
    el.style.transition = '';
    if (!d.moved) { el.style.blockSize = ''; return; }
    const h = d.to, vh = window.innerHeight;
    // A flick down from a low sheet, or a sheet let go below its folded height, closes it.
    if (canClose && close && (h < PEEK_PX || (d.speed > FLICK && h < vh * HALF))) {
      el.style.blockSize = '0px';
      window.setTimeout(close, CLOSE_MS);
      return;
    }
    el.style.blockSize = '';
    const snaps: [SheetState, number][] = [['peek', PEEK_PX], ['half', vh * HALF], ['full', fullPx(el)]];
    // A fast flick goes on to the next height in its direction.
    const bias = d.speed > FLICK ? -vh * 0.12 : d.speed < -FLICK ? vh * 0.12 : 0;
    const nearest = snaps.reduce((a, b) => (Math.abs(b[1] - (h + bias)) < Math.abs(a[1] - (h + bias)) ? b : a));
    set(nearest[0]);
  };

  // Touch: the handle and the title row drag at once; the content drags when it is scrolled to the top and pulled down.
  useEffect(() => {
    const el = aside.current;
    if (!el || !compact) return;
    let grab = false, onHandle = false, pending = false;
    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1 || live.current.layout !== 'sheet') return;
      const t = e.touches[0]!;
      grab = !!(e.target as HTMLElement).closest('.sheet-handle, .detail-head');
      onHandle = !!(e.target as HTMLElement).closest('.sheet-handle');
      pending = true;
      begin(t.clientY);
    };
    const onMove = (e: TouchEvent) => {
      const d = drag.current;
      if (!pending || !d) return;
      const t = e.touches[0]!;
      const pullingDown = t.clientY > d.y;
      // Content that can still scroll scrolls; it hands over only when pulled down from its top.
      if (!d.moved && !grab && !(el.scrollTop <= 0 && pullingDown)) { drag.current = null; pending = false; return; }
      if (move(t.clientY)) { if (e.cancelable) e.preventDefault(); }
    };
    const onEnd = () => {
      if (!pending) return;
      pending = false;
      const moved = drag.current?.moved;
      end();
      // A tap on the handle steps through the heights.
      if (!moved && onHandle) step();
    };
    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd);
    el.addEventListener('touchcancel', onEnd);
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onEnd);
    };
    // begin, move and end only read refs and the latest props.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compact]);

  // Mouse and pen on the handle (and the keyboard) do the same; a touch is handled above.
  const onPointerDown = (e: PointerEvent<HTMLButtonElement>) => {
    if (!compact || e.pointerType === 'touch') return;
    e.currentTarget.setPointerCapture(e.pointerId);
    begin(e.clientY);
  };
  const onPointerMove = (e: PointerEvent<HTMLButtonElement>) => { if (e.pointerType !== 'touch') move(e.clientY); };
  const onPointerUp = (e: PointerEvent<HTMLButtonElement>) => {
    if (e.pointerType === 'touch') return;
    const moved = drag.current?.moved;
    end();
    if (!moved) step();
  };

  return (
    <aside ref={aside} className="right glass" aria-label="Details" data-sheet={compact ? state : undefined}>
      {compact && (
        <button
          type="button"
          className="sheet-handle"
          aria-expanded={state !== 'peek'}
          aria-label={state === 'peek' ? 'Show the details' : state === 'half' && layout === 'sheet' ? 'Expand the details' : 'Fold the details away'}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={() => { drag.current = null; if (aside.current) { aside.current.style.blockSize = ''; aside.current.style.transition = ''; } }}
          // Keyboard and assistive tech: Enter or Space steps through the heights (a finger or the mouse is handled above).
          onClick={(e) => { if (e.detail === 0) step(); }}
        >
          <span aria-hidden="true" />
        </button>
      )}
      {children}
    </aside>
  );
}
