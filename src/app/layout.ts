import { useEffect, useState, type RefObject } from 'react';
import type { ViewInsets } from '../viewer/CameraRig';

/**
 * Screen layouts. CSS keys on `.app[data-layout]`, so the camera framing and the styles cannot disagree.
 * - desktop: panels float either side of the model (wide screens and landscape tablets);
 * - sheet: phones and portrait tablets; details rise from the bottom in a sheet, structures open from the dock;
 * - landscape: phones on their side; the sheet sits on the right.
 */
export type Layout = 'desktop' | 'sheet' | 'landscape';
/** How far the sheet is open: one line, about half the screen, or nearly all of it. */
export type SheetState = 'peek' | 'half' | 'full';

export const PEEK_PX = 72;
export const HALF = 0.38;

export function layoutFor(w: number, h: number): Layout {
  if (h <= 560 && w > h) return 'landscape';
  if (w < 1024) return 'sheet';
  return 'desktop';
}

/** Whether the main pointer is a finger. */
export const isTouch = () => typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches === true;

/** Window size and layout, updated on resize and rotation. */
export function useLayout() {
  const [size, setSize] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }));
  useEffect(() => {
    const onResize = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => { window.removeEventListener('resize', onResize); window.removeEventListener('orientationchange', onResize); };
  }, []);
  return { ...size, layout: layoutFor(size.w, size.h) };
}

/** Where the top bar ends and the dock begins, measured from the page so the camera frames the free space. */
export function useChrome(root: RefObject<HTMLElement | null>) {
  const [chrome, setChrome] = useState({ top: 0, dock: 0 });
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const measure = () => {
      const h = el.clientHeight;
      const bottomOf = (sel: string) => el.querySelector(sel)?.getBoundingClientRect().bottom ?? 0;
      const top = Math.max(bottomOf('.identity h1'), bottomOf('.top-actions'));
      const dockTop = el.querySelector('.dock')?.getBoundingClientRect().top ?? h;
      const next = { top: Math.round(top), dock: Math.round(h - dockTop) };
      setChrome((c) => (c.top === next.top && c.dock === next.dock ? c : next));
      el.style.setProperty('--dock-space', `${next.dock}px`);
      el.style.setProperty('--top-space', `${next.top}px`);
    };
    measure();
    const ro = new ResizeObserver(measure);
    for (const sel of ['.identity', '.top-actions', '.dock']) { const n = el.querySelector(sel); if (n) ro.observe(n); }
    ro.observe(el);
    return () => ro.disconnect();
  }, [root]);
  return chrome;
}

/** Space the panels take, so the camera centres the model in what is left. */
export function panelInsets(layout: Layout, w: number, h: number, o: { hasSheet: boolean; sheet: SheetState; top: number; dock: number }): ViewInsets {
  if (layout === 'sheet') {
    const top = o.top + 8;
    if (!o.hasSheet) return { left: 0, right: 0, top, bottom: o.dock + 8 };
    // The full sheet covers the model; keep the half-open framing behind it.
    const bottom = o.sheet === 'peek' ? o.dock + PEEK_PX + 16 : Math.round(h * HALF) + 16;
    return { left: 0, right: 0, top, bottom };
  }
  if (layout === 'landscape') {
    const right = o.hasSheet && o.sheet !== 'peek' ? Math.min(w * 0.46, 380) + 16 : 0;
    return { left: 0, right, top: o.top + 4, bottom: o.dock + 4 };
  }
  const compact = w <= 1100;
  return { left: compact ? 266 : 318, right: o.hasSheet ? (compact ? 336 : 388) : 0, top: 70, bottom: 80 };
}
