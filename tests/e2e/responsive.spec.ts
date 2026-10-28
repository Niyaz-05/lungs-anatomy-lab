import { test, expect, type Page, type Locator } from '@playwright/test';
import fs from 'node:fs';

/**
 * Phone, tablet and desktop layouts. The same file runs in every lab: it relies only on the shared
 * layout (`.app[data-layout]`, `.identity`, `.top-actions`, `.modes`, `.dock`, `aside.left`, `aside.right`).
 */
const SHOTS = 'docs/screenshots/responsive';
fs.mkdirSync(SHOTS, { recursive: true });

const SIZES = [
  { name: 'phone', width: 390, height: 844, touch: true, layout: 'sheet' },
  { name: 'phone-landscape', width: 844, height: 390, touch: true, layout: 'landscape' },
  { name: 'tablet-portrait', width: 768, height: 1024, touch: true, layout: 'sheet' },
  { name: 'tablet-portrait-large', width: 820, height: 1180, touch: true, layout: 'sheet' },
  { name: 'tablet-landscape', width: 1024, height: 768, touch: true, layout: 'desktop' },
  { name: 'desktop', width: 1366, height: 820, touch: false, layout: 'desktop' },
] as const;

type Box = { x: number; y: number; width: number; height: number };
const overlap = (a: Box, b: Box) => Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));

async function ready(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('/');
  await expect(page.locator('.viewer[data-ready="true"]')).toBeVisible({ timeout: 60_000 });
  await page.waitForTimeout(900);
  return errors;
}
async function box(l: Locator) { return (await l.boundingBox())!; }
async function inside(page: Page, l: Locator) {
  const b = await box(l);
  const vp = page.viewportSize()!;
  expect(b.x, 'left edge').toBeGreaterThanOrEqual(-1);
  expect(b.y, 'top edge').toBeGreaterThanOrEqual(-1);
  expect(b.x + b.width, 'right edge').toBeLessThanOrEqual(vp.width + 1);
  expect(b.y + b.height, 'bottom edge').toBeLessThanOrEqual(vp.height + 1);
}
const vpHeight = (page: Page) => page.viewportSize()!.height;
/** A one-finger swipe straight down (or up), sent as real touch events. */
async function swipe(page: Page, x: number, y0: number, y1: number, pauseMs = 16) {
  const cdp = await page.context().newCDPSession(page);
  const send = (type: 'touchStart' | 'touchMove' | 'touchEnd', y?: number) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: y === undefined ? [] : [{ x, y }] });
  await send('touchStart', y0);
  const steps = 12;
  for (let i = 1; i <= steps; i++) { await send('touchMove', y0 + ((y1 - y0) * i) / steps); await page.waitForTimeout(pauseMs); }
  await send('touchEnd');
  await page.waitForTimeout(450);
  await cdp.detach();
}
async function noHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}
/** Pick the first structure in the list, opening the drawer first where there is one. */
async function pickFirst(page: Page, layout: string) {
  if (layout !== 'desktop') await page.getByRole('button', { name: 'Structures', exact: true }).click();
  await expect(page.locator('aside.left')).toBeVisible();
  // Some labs fold their lists into sections: open the first one if no entry is showing.
  const entries = page.locator('aside.left .struct-list button:visible');
  if (!(await entries.count())) await page.locator('aside.left details summary').first().click();
  await entries.first().click();
  await expect(page.locator('aside.right')).toBeVisible();
  if (layout !== 'desktop') await expect(page.locator('aside.left')).toBeHidden();
}

for (const size of SIZES) {
  test.describe(`${size.name} ${size.width}×${size.height}`, () => {
    test.use({ viewport: { width: size.width, height: size.height }, hasTouch: size.touch, isMobile: size.touch && size.width < 1024 });

    test(`layout fits the screen @smoke`, async ({ page }) => {
      const errors = await ready(page);
      await expect(page.locator('.app')).toHaveAttribute('data-layout', size.layout);
      await noHorizontalScroll(page);
      const top = page.locator('.top-actions');
      const dock = page.locator('.dock');
      for (const l of [page.locator('.identity h1'), top, dock]) await inside(page, l);
      expect(overlap(await box(top), await box(dock)), 'top bar and dock').toBe(0);
      expect(overlap(await box(page.locator('.identity h1')), await box(top)), 'title and modes').toBe(0);
      if (size.touch) {
        // Finger-sized controls in the top bar and the dock.
        const heights = await page.locator('.modes button:visible, .dock button:visible, .icon-button:visible').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height));
        expect(Math.min(...heights)).toBeGreaterThanOrEqual(43.5);
      }
      await page.screenshot({ path: `${SHOTS}/${size.name}-1-start.png` });

      await pickFirst(page, size.layout);
      const sheet = page.locator('aside.right');
      await inside(page, sheet);
      // On phones and tablets the title and the mode buttons make way for the details.
      if (size.layout !== 'desktop') { await expect(top).toBeHidden(); await expect(page.locator('.identity')).toBeHidden(); }
      else await expect(top).toBeVisible();
      // At least a third of the screen is left for the model beside or above the details.
      const vp = page.viewportSize()!;
      const s = await box(sheet);
      const free = size.layout === 'sheet' ? vp.width * s.y : (s.x - (size.layout === 'desktop' ? (await box(page.locator('aside.left'))).x + (await box(page.locator('aside.left'))).width : 0)) * vp.height;
      expect(free / (vp.width * vp.height)).toBeGreaterThan(size.layout === 'landscape' ? 0.4 : 0.3);
      await noHorizontalScroll(page);
      await page.screenshot({ path: `${SHOTS}/${size.name}-2-details.png` });
      expect(errors).toEqual([]);
    });

    if (size.layout !== 'desktop') {
      test(`the sheet folds, opens and expands`, async ({ page }) => {
        await ready(page);
        await pickFirst(page, size.layout);
        const app = page.locator('.app');
        const sheet = page.locator('aside.right');
        const handle = page.locator('.sheet-handle');
        await expect(app).toHaveAttribute('data-sheet', 'half');
        const half = (await box(sheet)).height;
        if (size.layout === 'sheet') {
          await handle.click();
          await expect(app).toHaveAttribute('data-sheet', 'full');
          await page.waitForTimeout(300);
          expect((await box(sheet)).height).toBeGreaterThan(half);
          await inside(page, sheet);
        }
        await handle.click();
        await expect(app).toHaveAttribute('data-sheet', 'peek');
        await page.waitForTimeout(300);
        const peek = await box(sheet);
        expect(peek.height).toBeLessThan(80);
        // Folded, the details leave the dock free.
        expect(overlap(peek, await box(page.locator('.dock'))), 'peek and dock').toBe(0);
        await page.screenshot({ path: `${SHOTS}/${size.name}-3-peek.png` });
        await handle.click();
        await expect(app).toHaveAttribute('data-sheet', 'half');
        // Keyboard users step through the heights too.
        await handle.focus();
        await page.keyboard.press('Enter');
        await expect(app).not.toHaveAttribute('data-sheet', 'half');
        if (size.layout === 'sheet') {
          // Dragging the handle up snaps the sheet to full.
          await handle.click();
          await handle.click();
          await expect(app).toHaveAttribute('data-sheet', 'half');
          await page.waitForTimeout(400); // let the height animation finish before measuring
          const h = await box(handle);
          await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
          await page.mouse.down();
          await page.mouse.move(h.x + h.width / 2, 40, { steps: 8 });
          await page.mouse.up();
          await expect(app).toHaveAttribute('data-sheet', 'full');
        }
      });
    }

    if (size.layout !== 'desktop') {
      test(`the picked part stays in view, the top bar returns when the details close`, async ({ page }) => {
        await ready(page);
        await pickFirst(page, size.layout);
        await expect(page.locator('.top-actions')).toBeHidden();
        const label = page.locator('.scene-label.is-focus');
        await expect(label).toBeVisible({ timeout: 15_000 });
        await page.waitForTimeout(1200); // the camera flight
        const l = await box(label), s = await box(page.locator('aside.right'));
        const vp = page.viewportSize()!;
        expect(l.x).toBeGreaterThanOrEqual(0);
        expect(l.x + l.width).toBeLessThanOrEqual(vp.width);
        if (size.layout === 'sheet') expect(l.y + l.height, 'label above the sheet').toBeLessThanOrEqual(s.y + 1);
        else expect(l.x + l.width, 'label left of the sheet').toBeLessThanOrEqual(s.x + 1);
        await page.screenshot({ path: `${SHOTS}/${size.name}-4-picked.png` });
        await page.getByRole('button', { name: 'Clear selection' }).click();
        await expect(page.locator('aside.right')).toHaveCount(0);
        await expect(page.locator('.top-actions')).toBeVisible();
        await expect(page.locator('.identity h1')).toBeVisible();
      });

      test(`a tap on empty space closes the details`, async ({ page }) => {
        await ready(page);
        await pickFirst(page, size.layout);
        await page.waitForTimeout(1200);
        const vp = page.viewportSize()!;
        // Tap the corners of the model area until one is empty (a model can fill any corner; a tap on it selects it instead).
        const spots = size.layout === 'sheet'
          ? [[12, 16], [vp.width - 12, 16], [12, vp.height * 0.3], [vp.width - 12, vp.height * 0.3], [vp.width / 2, 8]]
          : [[12, vp.height / 2], [12, 12], [12, vp.height - 12], [vp.width * 0.3, 8]];
        const first = await page.locator('aside.right .panel-title, aside.right h2').first().textContent();
        let hitModel = false;
        for (const [x, y] of spots) {
          await page.touchscreen.tap(x!, y!);
          await page.waitForTimeout(500);
          if (!(await page.locator('aside.right').count())) break;
          if ((await page.locator('aside.right .panel-title, aside.right h2').first().textContent()) !== first) hitModel = true;
        }
        // A model that fills the screen (the kidney's spine) leaves no empty spot: every tap picked a structure instead.
        if (hitModel && (await page.locator('aside.right').count())) { test.info().annotations.push({ type: 'note', description: 'the model fills the screen: no empty spot to tap' }); return; }
        await expect(page.locator('aside.right')).toHaveCount(0);
        await expect(page.locator('.top-actions')).toBeVisible();
      });

      test(`a mode's own panel keeps the top bar and cannot be dismissed`, async ({ page }) => {
        await ready(page);
        await page.locator('.modes button').nth(1).click();
        await expect(page.locator('aside.right')).toBeVisible();
        await expect(page.locator('.top-actions')).toBeVisible();
        if (size.layout === 'sheet') {
          const h = await box(page.locator('.sheet-handle'));
          await swipe(page, h.x + h.width / 2, h.y + 10, vpHeight(page) - 4);
          await expect(page.locator('aside.right')).toBeVisible();
          await expect(page.locator('.app')).toHaveAttribute('data-sheet', 'peek');
        }
      });
    }

    if (size.layout === 'sheet') {
      test(`dragging the details down closes them: by the handle, the title, or by pulling the content`, async ({ page }) => {
        await ready(page);
        const vh = page.viewportSize()!.height;
        const open = async () => { await pickFirst(page, size.layout); await page.waitForTimeout(500); };
        // 1. Down the handle, all the way.
        await open();
        let h = await box(page.locator('.sheet-handle'));
        await swipe(page, h.x + h.width / 2, h.y + 10, vh - 4);
        await expect(page.locator('aside.right')).toHaveCount(0);
        await expect(page.locator('.top-actions')).toBeVisible();
        // 2. By the title row.
        await open();
        const head = await box(page.locator('.detail-head'));
        await swipe(page, head.x + head.width / 2 - 30, head.y + head.height / 2, vh - 4);
        await expect(page.locator('aside.right')).toHaveCount(0);
        // 3. Pulling down on the content (scrolled to its top).
        await open();
        const body = await box(page.locator('.detail-panel .lead, .detail-panel p').first());
        await swipe(page, body.x + 20, body.y + 4, vh - 4);
        await expect(page.locator('aside.right')).toHaveCount(0);
        // 4. A short, slow drag only folds it to its one-line height (a quick one is a flick and closes it).
        await open();
        h = await box(page.locator('.sheet-handle'));
        await swipe(page, h.x + h.width / 2, h.y + 10, h.y + 10 + vh * 0.2, 90);
        await expect(page.locator('aside.right')).toBeVisible();
        await expect(page.locator('.app')).toHaveAttribute('data-sheet', 'peek');
      });
    }

    test(`every mode fits`, async ({ page }) => {
      const errors = await ready(page);
      const modes = page.locator('.modes button');
      const n = await modes.count();
      for (let i = 0; i < n; i++) {
        await modes.nth(i).click();
        await page.waitForTimeout(500);
        await noHorizontalScroll(page);
        const sheet = page.locator('aside.right');
        if (await sheet.count()) {
          await inside(page, sheet);
          // The panel scrolls to its end inside the screen.
          await sheet.evaluate((el) => { el.scrollTop = el.scrollHeight; });
          const last = await sheet.evaluate((el) => {
            // The last element that takes part in the layout and can be seen (not absolutely placed, hidden or empty).
            const kids = [...el.querySelectorAll('*')].filter((k) => {
              const cs = getComputedStyle(k), r = k.getBoundingClientRect();
              // Content inside a list that scrolls on its own is not part of the sheet's own length.
              for (let a = k.parentElement; a && a !== el; a = a.parentElement) if (['auto', 'scroll', 'hidden'].includes(getComputedStyle(a).overflowY)) return false;
              return r.height > 0 && r.width > 0 && cs.position !== 'absolute' && cs.position !== 'fixed' && cs.visibility !== 'hidden' && !k.closest('.sr-only, svg, [hidden]') && !(k.closest('details:not([open])') && !k.closest('summary'));
            });
            const lastEl = kids[kids.length - 1]!;
            return { bottom: lastEl.getBoundingClientRect().bottom, sheet: el.getBoundingClientRect().bottom };
          });
          expect(last.bottom).toBeLessThanOrEqual(last.sheet + 1);
        }
        await page.screenshot({ path: `${SHOTS}/${size.name}-mode-${i + 1}.png` });
      }
      expect(errors).toEqual([]);
    });
  });
}
