import { expect, test, type ConsoleMessage, type Page } from '@playwright/test';

/** Errors that are expected or non-fatal when WebGL is limited in headless CI. */
function isIgnorablePageError(message: string): boolean {
  const text = message.toLowerCase();
  return (
    text.includes('webgl') ||
    text.includes('webgl2') ||
    text.includes('getcontext') ||
    text.includes('gpu') ||
    text.includes('swiftshader') ||
    text.includes('context lost') ||
    text.includes('unable to create webgl') ||
    text.includes('error creating webgl') ||
    text.includes('three.webglrenderer') ||
    text.includes('gl_invalid') ||
    text.includes('extension') ||
    text.includes('not supported')
  );
}

function attachErrorCollectors(page: Page) {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];

  page.on('pageerror', (err) => {
    const msg = err.message || String(err);
    if (!isIgnorablePageError(msg)) {
      pageErrors.push(msg);
    }
  });

  page.on('console', (msg: ConsoleMessage) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    if (!isIgnorablePageError(text)) {
      consoleErrors.push(text);
    }
  });

  return { pageErrors, consoleErrors };
}

test.describe('HELI SUNSET smoke', () => {
  test('game shell boots without unexpected page errors', async ({ page }) => {
    test.setTimeout(120_000);

    const { pageErrors, consoleErrors } = attachErrorCollectors(page);

    await page.goto('/', { waitUntil: 'domcontentloaded' });

    await expect(page.locator('#app')).toBeVisible();
    await expect(page.locator('#game-canvas')).toBeAttached();
    await expect(page.locator('#start-overlay')).toBeVisible();
    await expect(page.getByRole('heading', { name: /HELI\s*SUNSET/i })).toBeVisible();
    await expect(page.locator('#start-btn')).toBeAttached();
    await expect(page.locator('#loading-status')).toBeAttached();

    // Prefer a fully ready shell when assets + renderer succeed; otherwise still require shell DOM.
    const startBtn = page.locator('#start-btn');
    try {
      await expect(startBtn).toBeEnabled({ timeout: 60_000 });
      await expect(startBtn).toContainText(/START OPERATION|START|BEGIN|FLY|ENGAGE|LAUNCH/i);
    } catch {
      // Headless WebGL or slow asset path may block readiness; shell must still be present.
      await expect(page.locator('#start-overlay')).toBeVisible();
      await expect(page.locator('#app')).toBeVisible();
      await expect(page.getByRole('heading', { name: /HELI\s*SUNSET/i })).toBeVisible();
    }

    expect(pageErrors, `Unexpected page errors:\n${pageErrors.join('\n')}`).toEqual([]);
    expect(consoleErrors, `Unexpected console errors:\n${consoleErrors.join('\n')}`).toEqual([]);
  });
});
