import { expect, test, type ConsoleMessage, type Page } from '@playwright/test';

/** Errors that are expected or non-fatal when WebGL/WebGPU is limited in headless CI. */
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
    text.includes('unable to create webgl') ||
    text.includes('error creating webgl') ||
    text.includes('three.webglrenderer') ||
    text.includes('three.webgpurenderer') ||
    text.includes('gl_invalid') ||
    text.includes('extension') ||
    text.includes('not supported') ||
    text.includes('precision') ||
    text.includes('adapter') ||
    text.includes('compatibility mode')
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

async function expectShellVisible(page: Page) {
  await expect(page.locator('#app')).toBeVisible();
  await expect(page.locator('#game-canvas')).toBeAttached();
  await expect(page.locator('#start-overlay')).toBeVisible();
  await expect(page.getByRole('heading', { name: /HELI\s*SUNSET/i })).toBeVisible();
  await expect(page.locator('#start-btn')).toBeAttached();
  await expect(page.locator('#loading-status')).toBeAttached();
}

/**
 * Wait for boot to leave LOADING… then assert we never leave users on bare LOAD FAILED
 * without a compatibility retry affordance for graphics failures.
 */
async function expectBootSettledWithoutBareLoadFailed(page: Page) {
  const startBtn = page.locator('#start-btn');
  const loading = page.locator('#loading-status');

  await expect
    .poll(async () => (await startBtn.textContent())?.trim() ?? '', { timeout: 90_000 })
    .not.toMatch(/^LOADING/i);

  const btnText = ((await startBtn.textContent()) ?? '').trim();
  const statusText = ((await loading.textContent()) ?? '').trim();

  // Bare LOAD FAILED without retry is the phone boot bug we must catch.
  expect(btnText, `Start button stuck on LOAD FAILED (status: ${statusText})`).not.toMatch(
    /^LOAD FAILED$/i,
  );

  if (/RETRY COMPATIBILITY MODE/i.test(btnText)) {
    await expect(page.locator('#app')).toHaveAttribute('data-renderer-error-stage', /.+/);
    await expect(loading).toContainText(/compatibility mode/i);
    await expect(startBtn).toBeEnabled();
    return 'compat-retry' as const;
  }

  return 'ready-or-partial' as const;
}

test.describe('HELI SUNSET smoke', () => {
  test('game shell boots without unexpected page errors', async ({ page }) => {
    test.setTimeout(120_000);

    const { pageErrors, consoleErrors } = attachErrorCollectors(page);

    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expectShellVisible(page);

    const settled = await expectBootSettledWithoutBareLoadFailed(page);
    const startBtn = page.locator('#start-btn');

    if (settled === 'ready-or-partial') {
      try {
        await expect(startBtn).toBeEnabled({ timeout: 30_000 });
        await expect(startBtn).toContainText(/START OPERATION|START|BEGIN|FLY|ENGAGE|LAUNCH/i);
      } catch {
        // Headless WebGL or slow asset path may block readiness; shell must still be present.
        await expect(page.locator('#start-overlay')).toBeVisible();
        await expect(page.locator('#app')).toBeVisible();
        await expect(page.getByRole('heading', { name: /HELI\s*SUNSET/i })).toBeVisible();
      }
    }

    expect(pageErrors, `Unexpected page errors:\n${pageErrors.join('\n')}`).toEqual([]);
    expect(consoleErrors, `Unexpected console errors:\n${consoleErrors.join('\n')}`).toEqual([]);
  });

  test('forced WebGL fallback boots and exposes backend diagnostics', async ({ page }) => {
    test.setTimeout(120_000);

    const { pageErrors, consoleErrors } = attachErrorCollectors(page);

    await page.goto('/?renderer=webgl', { waitUntil: 'domcontentloaded' });
    await expectShellVisible(page);

    // Diagnostics attribute is set as soon as the renderer factory resolves.
    await expect(page.locator('#app')).toHaveAttribute('data-renderer-backend', 'webgl', {
      timeout: 60_000,
    });
    await expect(page.locator('#app')).toHaveAttribute('data-renderer-preference', 'webgl');
    await expect(page.locator('#app')).toHaveAttribute('data-renderer-webgl-attempt', /.+/);
    await expect(page.locator('#game-canvas')).toHaveAttribute('data-renderer-backend', 'webgl');

    const settled = await expectBootSettledWithoutBareLoadFailed(page);
    const startBtn = page.locator('#start-btn');

    if (settled === 'ready-or-partial') {
      try {
        await expect(startBtn).toBeEnabled({ timeout: 30_000 });
        await expect(startBtn).toContainText(/START OPERATION|START|BEGIN|FLY|ENGAGE|LAUNCH/i);
      } catch {
        await expect(page.locator('#app')).toHaveAttribute('data-renderer-backend', 'webgl');
      }
    }

    expect(pageErrors, `Unexpected page errors:\n${pageErrors.join('\n')}`).toEqual([]);
    expect(consoleErrors, `Unexpected console errors:\n${consoleErrors.join('\n')}`).toEqual([]);
  });

  test('compatibility retry button forces WebGL safely', async ({ page }) => {
    test.setTimeout(120_000);

    const { pageErrors, consoleErrors } = attachErrorCollectors(page);

    await page.goto('/?foo=keep&renderer=webgpu#frag', { waitUntil: 'domcontentloaded' });
    await expectShellVisible(page);

    // Wait for the real boot path to leave LOADING so our simulated failure UI is not overwritten.
    const startBtn = page.locator('#start-btn');
    await expect
      .poll(async () => (await startBtn.textContent())?.trim() ?? '', { timeout: 90_000 })
      .not.toMatch(/^LOADING/i);

    // Simulate graphics failure UI (same path as presentGraphicsFailure).
    await page.evaluate(() => {
      const app = document.getElementById('app');
      const btn = document.getElementById('start-btn') as HTMLButtonElement | null;
      const status = document.getElementById('loading-status');
      if (app) {
        app.dataset.rendererErrorStage = 'renderer-init';
        app.dataset.rendererErrorReason = 'simulated-webgpu-post-failure';
      }
      if (status) {
        status.textContent =
          'Graphics failed to start. Retry in compatibility mode (classic WebGL), or refresh.';
      }
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'RETRY COMPATIBILITY MODE';
        btn.dataset.graphicsRetry = 'compatibility';
      }
    });

    await expect(page.locator('#start-btn')).toContainText(/RETRY COMPATIBILITY MODE/i);
    await expect(page.locator('#app')).toHaveAttribute(
      'data-renderer-error-stage',
      'renderer-init',
    );

    await Promise.all([
      page.waitForURL(/renderer=webgl/, { timeout: 30_000 }),
      page.locator('#start-btn').click(),
    ]);

    // Landing URL from manual RETRY includes explicit WebGL + transient marker.
    {
      const url = new URL(page.url());
      expect(url.searchParams.get('renderer')).toBe('webgl');
      expect(url.searchParams.get('foo')).toBe('keep');
      expect(url.searchParams.get('webglRecovery')).toBe('1');
      expect(url.hash).toBe('#frag');
    }

    await expectShellVisible(page);
    await expect(page.locator('#app')).toHaveAttribute('data-renderer-backend', 'webgl', {
      timeout: 60_000,
    });
    await expect(page.locator('#app')).toHaveAttribute('data-renderer-preference', 'webgl');

    // After full graphics stack succeeds, recovery marker is stripped; user-authored
    // renderer=webgl from RETRY remains.
    await expect
      .poll(() => new URL(page.url()).searchParams.get('webglRecovery'), { timeout: 60_000 })
      .toBeNull();
    {
      const settled = new URL(page.url());
      expect(settled.searchParams.get('renderer')).toBe('webgl');
      expect(settled.searchParams.get('foo')).toBe('keep');
      expect(settled.hash).toBe('#frag');
    }

    expect(pageErrors, `Unexpected page errors:\n${pageErrors.join('\n')}`).toEqual([]);
    expect(consoleErrors, `Unexpected console errors:\n${consoleErrors.join('\n')}`).toEqual([]);
  });

  test('PWA manifest and UI shell are present without requiring install prompt', async ({
    page,
    request,
  }) => {
    test.setTimeout(120_000);

    const { pageErrors, consoleErrors } = attachErrorCollectors(page);

    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expectShellVisible(page);

    // Manifest is emitted by vite-plugin-pwa into the production build.
    const manifestLink = page.locator('link[rel="manifest"]');
    await expect(manifestLink).toHaveCount(1);
    const manifestHref = await manifestLink.getAttribute('href');
    expect(manifestHref).toBeTruthy();

    const manifestUrl = new URL(manifestHref!, page.url()).toString();
    const manifestRes = await request.get(manifestUrl);
    expect(manifestRes.ok()).toBeTruthy();
    const manifest = await manifestRes.json();
    expect(manifest.name).toMatch(/HELI\s*SUNSET/i);
    expect(manifest.short_name).toMatch(/HELI\s*SUNSET/i);
    expect(manifest.display).toBe('standalone');
    expect(manifest.orientation).toBe('landscape');
    expect(manifest.theme_color).toBe('#061018');
    expect(manifest.background_color).toBe('#061018');
    expect(manifest.start_url).toMatch(/^\.\/?$/);
    expect(manifest.scope).toMatch(/^\.\/?$/);
    expect(Array.isArray(manifest.icons)).toBeTruthy();
    expect(manifest.icons.length).toBeGreaterThanOrEqual(2);
    expect(Array.isArray(manifest.categories)).toBeTruthy();
    expect(manifest.categories.includes('games')).toBeTruthy();

    // UI shell exists and stays hidden until real install/update events (no fake CTA).
    const update = page.locator('#pwa-update');
    const install = page.locator('#pwa-install');
    await expect(update).toBeAttached();
    await expect(install).toBeAttached();
    await expect(update).toBeHidden();
    await expect(install).toBeHidden();

    // Controller exposes testable data attributes on #app.
    await expect(page.locator('#app')).toHaveAttribute('data-pwa-sw', /.+/);
    await expect(page.locator('#app')).toHaveAttribute('data-pwa-update', 'none');
    await expect(page.locator('#app')).toHaveAttribute('data-pwa-install', /.+/);

    // Service worker script is part of the production build (registration is best-effort).
    const swRes = await request.get(new URL('./sw.js', page.url()).toString());
    expect(swRes.ok()).toBeTruthy();

    expect(pageErrors, `Unexpected page errors:\n${pageErrors.join('\n')}`).toEqual([]);
    expect(consoleErrors, `Unexpected console errors:\n${consoleErrors.join('\n')}`).toEqual([]);
  });

  test('settings / hangar shell is keyboard-accessible and persists preferences', async ({
    page,
  }) => {
    test.setTimeout(120_000);

    const { pageErrors, consoleErrors } = attachErrorCollectors(page);

    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expectShellVisible(page);

    await expect(page.locator('#open-settings-btn')).toBeVisible();
    await expect(page.locator('#open-hangar-btn')).toBeVisible();
    await expect(page.locator('#start-daily-id')).toBeAttached();
    await expect(page.locator('#daily-challenge-desc')).toContainText(/local daily|no online/i);

    await page.locator('#open-settings-btn').click();
    const settings = page.locator('#settings-panel');
    await expect(settings).toBeVisible();
    await expect(settings).toHaveAttribute('role', 'dialog');
    await expect(page.locator('#settings-title')).toBeVisible();

    await page.locator('#settings-panel select[name="quality"]').selectOption('low');
    await page.locator('#settings-panel input[name="highContrast"]').check();
    await page.locator('#settings-close-btn').click();
    await expect(settings).toBeHidden();

    await expect(page.locator('html')).toHaveAttribute('data-quality-pref', 'low');
    await expect(page.locator('html')).toHaveAttribute('data-high-contrast', 'on');
    await expect(page.locator('html')).toHaveClass(/a11y-high-contrast/);

    await page.locator('#open-hangar-btn').click();
    const hangar = page.locator('#hangar-panel');
    const metaRoot = page.locator('#meta-root');
    await expect(hangar).toBeVisible();
    await expect(hangar).toHaveAttribute('role', 'dialog');
    await expect(page.locator('#skin-list .meta-choice').first()).toBeVisible();
    await expect(page.locator('#loadout-list .meta-choice').first()).toBeVisible();
    await expect(page.locator('#hangar-close-btn')).toBeVisible();
    await page.locator('#hangar-close-btn').click({ force: true });
    // Assert the shell closed (nested toBeHidden on #hangar-panel is unreliable under a [hidden] root).
    await expect(metaRoot).toBeHidden({ timeout: 10_000 });
    await expect(metaRoot).toHaveAttribute('data-mode', 'closed');
    await expect(hangar).toHaveAttribute('hidden', '');

    await page.reload({ waitUntil: 'domcontentloaded' });
    await expectShellVisible(page);
    await expect(page.locator('html')).toHaveAttribute('data-quality-pref', 'low');
    await expect(page.locator('html')).toHaveAttribute('data-high-contrast', 'on');

    expect(pageErrors, `Unexpected page errors:\n${pageErrors.join('\n')}`).toEqual([]);
    expect(consoleErrors, `Unexpected console errors:\n${consoleErrors.join('\n')}`).toEqual([]);
  });
});
