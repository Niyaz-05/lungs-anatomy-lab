import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';

const SHOTS = 'docs/screenshots';
fs.mkdirSync(SHOTS, { recursive: true });

async function open(page: Page, query = '') {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`/${query}`);
  return errors;
}
async function ready(page: Page) {
  await expect(page.locator('.viewer[data-ready="true"]')).toBeVisible({ timeout: 45_000 });
  await page.waitForTimeout(1200);
}
const detailTitle = (page: Page) => page.locator('#detail-title');
const listButton = (page: Page, name: string | RegExp) => page.locator('.struct-list button', { hasText: name });

test('loads the lungs without console errors and with a clean main screen', async ({ page }) => {
  const errors = await open(page);
  await ready(page);
  await expect(page.getByRole('heading', { name: 'Human Lungs', level: 1 })).toBeVisible();
  await expect(page.locator('aside.right')).toHaveCount(0);
  await expect(page.getByText('For learning only')).toHaveCount(0);
  await page.screenshot({ path: `${SHOTS}/01-initial.png` });
  expect(errors).toEqual([]);
});

test('clicking the model selects the structure under the pointer', async ({ page }) => {
  await open(page);
  await ready(page);
  // Aim at the right lung (viewer's left), in the free area right of the structures panel.
  const box = (await page.locator('.viewer canvas').boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.55);
  await expect(detailTitle(page)).toHaveText(/./);
  await expect(page.locator('aside.right')).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/02-selected.png` });
});

test('search finds lobes, synonyms and the lingula', async ({ page }) => {
  await open(page);
  await ready(page);
  const search = page.getByLabel('Search structures');
  await search.fill('RUL');
  await search.press('Enter');
  await expect(detailTitle(page)).toHaveText('Right upper lobe');
  await search.fill('lingula');
  // Both lingular segments and both lingular bronchi match.
  await expect(page.locator('.search-results button')).toHaveCount(4);
  await expect(page.locator('.search-results')).toContainText('Left superior lingular segment (S4)');
  await expect(page.locator('.search-results')).toContainText('Left inferior lingular segment (S5)');
  await search.fill('windpipe');
  await expect(page.locator('.search-results button').first()).toContainText('Trachea');
  await search.fill('zzzz');
  await expect(page.getByText('No structure matches')).toBeVisible();
  await search.press('Escape');
  await expect(page.locator('fieldset.layers')).toBeVisible();
});

test('a lobe highlights its segments and links to them', async ({ page }) => {
  await open(page);
  await ready(page);
  await listButton(page, /^Right middle lobe$/).click();
  await expect(detailTitle(page)).toHaveText('Right middle lobe');
  await expect(page.locator('aside.right')).toContainText('2 segments');
  await page.locator('aside.right .chips button', { hasText: 'Right medial segment (S5)' }).click();
  await expect(detailTitle(page)).toHaveText('Right medial segment (S5)');
  await expect(page.locator('aside.right')).toContainText('Segment S5');
  await page.locator('aside.right .chips button', { hasText: 'Right medial bronchus (B5)' }).click();
  await expect(detailTitle(page)).toHaveText('Right medial bronchus (B5)');
});

test('the lungs look real by default; colour by lobe or segment paints them', async ({ page }) => {
  await open(page);
  await ready(page);
  await expect(page.getByRole('radio', { name: 'Real' })).toHaveAttribute('aria-checked', 'true');
  const canvas = page.locator('.viewer canvas');
  const real = await canvas.screenshot();
  await page.getByRole('radio', { name: 'Lobe' }).click();
  await page.waitForTimeout(600);
  const byLobe = await canvas.screenshot();
  expect(Buffer.compare(real, byLobe)).not.toBe(0);
  await page.getByRole('radio', { name: 'Segment' }).click();
  await expect(page.getByRole('radio', { name: 'Segment' })).toHaveAttribute('aria-checked', 'true');
  await page.waitForTimeout(600);
  const bySegment = await canvas.screenshot();
  expect(Buffer.compare(byLobe, bySegment)).not.toBe(0);
  await page.screenshot({ path: `${SHOTS}/03-colour-by-segment.png` });
});

test('layers hide and show structures', async ({ page }) => {
  await open(page);
  await ready(page);
  const rings = listButton(page, 'Tracheal cartilage rings');
  await expect(rings.locator('.tag')).toHaveText('hidden');
  await page.getByLabel('Airway cartilage').check();
  await expect(rings.locator('.tag')).toHaveCount(0);
  await page.getByLabel('Airways').uncheck();
  await expect(listButton(page, /^Trachea(hidden)?$/).locator('.tag')).toHaveText('hidden');
  await page.getByLabel('Pulmonary vessels').check();
  await expect(listButton(page, 'Pulmonary trunk').locator('.tag')).toHaveCount(0);
});

test('isolate, zoom and reset', async ({ page }) => {
  await open(page);
  await ready(page);
  await listButton(page, /^Carina$/).click();
  await page.getByLabel('Isolate').check();
  await expect(listButton(page, /^Trachea(hidden)?$/).locator('.tag')).toHaveText('hidden');
  await page.getByRole('button', { name: 'Zoom to' }).click();
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${SHOTS}/04-isolated-carina.png` });
  await page.getByRole('button', { name: 'Reset' }).click();
  await expect(detailTitle(page)).toHaveCount(0);
  await expect(listButton(page, /^Trachea(hidden)?$/).locator('.tag')).toHaveCount(0);
});

test('camera presets switch views', async ({ page }) => {
  await open(page);
  await ready(page);
  const canvas = page.locator('.viewer canvas');
  const front = await canvas.screenshot();
  await page.getByRole('button', { name: 'Left side', exact: true }).click();
  await page.waitForTimeout(1200);
  expect(Buffer.compare(front, await canvas.screenshot())).not.toBe(0);
});

test('labels mode shows non-overlapping labels', async ({ page }) => {
  await open(page);
  await ready(page);
  await page.getByLabel('Labels').check();
  await page.waitForTimeout(1200);
  const shown = page.locator('.scene-label[data-state="shown"]');
  expect(await shown.count()).toBeGreaterThanOrEqual(3);
  const boxes = await shown.evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).map((r) => [r.left, r.top, r.right, r.bottom]));
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const [a, b] = [boxes[i]!, boxes[j]!];
    expect(!(a[2]! <= b[0]! || b[2]! <= a[0]! || a[3]! <= b[1]! || b[3]! <= a[1]!), `labels ${i} and ${j} overlap`).toBe(false);
  }
  await page.screenshot({ path: `${SHOTS}/05-labels.png` });
});

test('breathing mode cycles between inspiration and expiration and follows the rate', async ({ page }) => {
  const errors = await open(page);
  await ready(page);
  await page.getByRole('button', { name: 'Breathing' }).click();
  const phase = page.locator('.phase');
  await expect(phase).toHaveAttribute('data-phase', /inspiration|expiration/);
  // Fast rate so both phases appear quickly.
  await page.getByLabel('Breathing rate').fill('30');
  await expect(page.locator('.breathing-panel output')).toHaveText('30 / min');
  await expect(phase).toHaveAttribute('data-phase', 'expiration', { timeout: 20_000 });
  await expect(phase).toHaveAttribute('data-phase', 'inspiration', { timeout: 20_000 });
  await page.screenshot({ path: `${SHOTS}/06-breathing.png` });
  await page.getByRole('button', { name: 'Pause' }).click();
  await expect(page.getByRole('button', { name: 'Play' })).toBeVisible();
  await expect(page.locator('.breathing-panel .flow-steps li')).toHaveCount(9);
  expect(errors).toEqual([]);
});

test('guided tour navigates forward, back and finishes', async ({ page }) => {
  await open(page);
  await ready(page);
  await page.getByRole('button', { name: 'Guided tour' }).click();
  await expect(page.getByText(/step 1 of 9/)).toBeVisible();
  await expect(page.locator('#tour-title')).toHaveText('Into the larynx');
  for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'Next →' }).click();
  await expect(page.locator('#tour-title')).toHaveText('Three lobes on the right, two on the left');
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${SHOTS}/07-tour-lobes.png` });
  await page.getByRole('button', { name: '← Back' }).click();
  await expect(page.getByText(/step 4 of 9/)).toBeVisible();
  await page.locator('.tour-index button').last().click();
  await expect(page.getByText(/step 9 of 9/)).toBeVisible();
  await page.getByRole('button', { name: 'Finish' }).click();
  await expect(page.getByRole('button', { name: 'Anatomy' })).toHaveAttribute('aria-pressed', 'true');
});

test('phone layout: structures open from the dock and details follow a pick', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);
  await ready(page);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await expect(page.locator('aside.left')).toBeHidden();
  await page.getByRole('button', { name: 'Structures' }).click();
  await listButton(page, /^Left lower lobe$/).click();
  await expect(page.locator('aside.left')).toBeHidden();
  await expect(detailTitle(page)).toHaveText('Left lower lobe');
  await page.screenshot({ path: `${SHOTS}/08-phone.png` });
});

test('the About sheet holds the HuBMAP credits', async ({ page }) => {
  await open(page);
  await ready(page);
  await page.getByRole('button', { name: /About this lab/ }).click();
  const dialog = page.getByRole('dialog', { name: 'About this lab' });
  await expect(dialog).toContainText('HuBMAP');
  await expect(dialog).toContainText('CC Attribution 4.0');
  await expect(dialog).toContainText('model choice');
  await page.screenshot({ path: `${SHOTS}/09-about.png` });
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
});

test('without WebGL the learning content still works', async ({ page }) => {
  await open(page, '?nowebgl');
  await expect(page.getByRole('heading', { name: '3D view unavailable' })).toBeVisible();
  await listButton(page, /^Carina$/).click();
  await expect(detailTitle(page)).toHaveText('Carina');
});

test('a missing model shows an error with a working retry', async ({ page }) => {
  let fail = true;
  await page.route('**/models/lungs.glb', (route) => (fail ? route.fulfill({ status: 404, body: 'not found' }) : route.continue()));
  await page.goto('/');
  await expect(page.getByRole('alert')).toContainText('The 3D model could not be loaded');
  fail = false;
  await page.getByRole('button', { name: 'Try again' }).click();
  await ready(page);
});

test('reduced motion: breathing mode works without errors', async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1366, height: 820 } });
  const page = await context.newPage();
  const errors = await open(page);
  await ready(page);
  await page.getByRole('button', { name: 'Breathing' }).click();
  await page.waitForTimeout(800);
  expect(errors).toEqual([]);
  await context.close();
});
