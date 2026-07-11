import { expect, test, type ConsoleMessage, type Page } from '@playwright/test';

/** Phone-context smoke: default auto policy should prefer classic WebGL. */

function isIgnorablePageError(message: string): boolean {
  const text = message.toLowerCase();
  return (
    text.includes('webgl') ||
    text.includes('webgl2') ||
    text.includes('webgpu') ||
    text.includes('getcontext') ||
    text.includes('gpu') ||
    text.includes('swiftshader') ||
    text.includes('context lost') ||
    text.includes('adapter') ||
    text.includes('not supported') ||
    text.includes('compatibility mode')
  );
}

function attachErrorCollectors(page: Page) {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];

  page.on('pageerror', (err) => {
    const msg = err.message || String(err);
    if (!isIgnorablePageError(msg)) pageErrors.push(msg);
  });

  page.on('console', (msg: ConsoleMessage) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    if (!isIgnorablePageError(text)) consoleErrors.push(text);
  });

  return { pageErrors, consoleErrors };
}

test.describe('HELI SUNSET mobile renderer policy', () => {
  test('auto prefers WebGL on phone and never leaves bare LOAD FAILED', async ({ page }) => {
    test.setTimeout(120_000);

    const { pageErrors, consoleErrors } = attachErrorCollectors(page);

    await page.goto('/', { waitUntil: 'domcontentloaded' });

    await expect(page.locator('#app')).toBeVisible();
    await expect(page.getByRole('heading', { name: /HELI\s*SUNSET/i })).toBeVisible();

    await expect(page.locator('#app')).toHaveAttribute('data-renderer-backend', 'webgl', {
      timeout: 60_000,
    });
    await expect(page.locator('#app')).toHaveAttribute(
      'data-renderer-reason',
      /mobile-stability-policy|forced-webgl|webgl/,
    );
    await expect(page.locator('#app')).toHaveAttribute(
      'data-renderer-webgl-attempt',
      /default-no-aa|low-power-no-aa|default-aa|high-performance-aa/,
    );

    // Preference stays auto (policy chose WebGL without forcing query).
    await expect(page.locator('#app')).toHaveAttribute('data-renderer-preference', 'auto');

    const startBtn = page.locator('#start-btn');
    await expect
      .poll(async () => (await startBtn.textContent())?.trim() ?? '', { timeout: 90_000 })
      .not.toMatch(/^LOADING/i);

    const btnText = ((await startBtn.textContent()) ?? '').trim();
    expect(btnText).not.toMatch(/^LOAD FAILED$/i);

    if (/RETRY COMPATIBILITY MODE/i.test(btnText)) {
      await expect(page.locator('#app')).toHaveAttribute('data-renderer-error-stage', /.+/);
      await expect(page.locator('#loading-status')).toContainText(/compatibility mode/i);
    }

    expect(pageErrors, `Unexpected page errors:\n${pageErrors.join('\n')}`).toEqual([]);
    expect(consoleErrors, `Unexpected console errors:\n${consoleErrors.join('\n')}`).toEqual([]);
  });

  test('explicit renderer=webgpu still records webgpu preference on phone', async ({ page }) => {
    test.setTimeout(120_000);

    const { pageErrors, consoleErrors } = attachErrorCollectors(page);

    await page.goto('/?renderer=webgpu', { waitUntil: 'domcontentloaded' });

    await expect(page.locator('#app')).toHaveAttribute('data-renderer-preference', 'webgpu', {
      timeout: 60_000,
    });
    // Backend may still be webgl after fallback; preference must remain explicit.
    await expect(page.locator('#app')).toHaveAttribute('data-renderer-backend', /webgl|webgpu/);

    const startBtn = page.locator('#start-btn');
    await expect
      .poll(async () => (await startBtn.textContent())?.trim() ?? '', { timeout: 90_000 })
      .not.toMatch(/^LOADING/i);
    expect(((await startBtn.textContent()) ?? '').trim()).not.toMatch(/^LOAD FAILED$/i);

    expect(pageErrors, `Unexpected page errors:\n${pageErrors.join('\n')}`).toEqual([]);
    expect(consoleErrors, `Unexpected console errors:\n${consoleErrors.join('\n')}`).toEqual([]);
  });
});
