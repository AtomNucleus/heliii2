import { expect, test } from '@playwright/test';

test.describe('deterministic visual harnesses', () => {
  test.use({ viewport: { width: 1280, height: 720 } });

  for (const scenario of [
    'wall-block',
    'thin-wall-tunnel',
    'lag-through-wall',
    'rim-perimeter',
    'corner-yaw',
    'clear-arm',
  ]) {
    test(`camera collision: ${scenario}`, async ({ page }) => {
      await page.goto(`/camera-harness.html?scenario=${scenario}&frames=60`);
      const app = page.locator('#app');
      await expect(app).toHaveAttribute('data-harness-ready', '1');
      await expect(app).toHaveAttribute('data-harness-pass', '1');
      await expect(app).toHaveAttribute('data-cam-inside-solid', '0');
      await expect(app).toHaveAttribute('data-cam-past-rim', '0');
      await expect(app).toHaveAttribute('data-frame-violations', '0');

      const expectedOccluded = scenario === 'clear-arm' ? '0' : '1';
      await expect(app).toHaveAttribute('data-cam-occluded', expectedOccluded);
    });
  }

  test('camera anti-tunnel scene matches visual baseline', async ({ page }) => {
    await page.goto('/camera-harness.html?scenario=thin-wall-tunnel&frames=60');
    await expect(page.locator('#app')).toHaveAttribute('data-harness-pass', '1');
    await expect(page.locator('#game-canvas')).toHaveScreenshot('camera-thin-wall.png', {
      animations: 'disabled',
      maxDiffPixelRatio: 0.02,
    });
  });

  test('camera perimeter scene matches visual baseline', async ({ page }) => {
    await page.goto('/camera-harness.html?scenario=rim-perimeter&frames=60');
    const app = page.locator('#app');
    await expect(app).toHaveAttribute('data-harness-pass', '1');
    await expect(app).toHaveAttribute('data-perimeter-count', '4');
    await expect(page.locator('#game-canvas')).toHaveScreenshot('camera-perimeter.png', {
      animations: 'disabled',
      maxDiffPixelRatio: 0.02,
    });
  });

  test('camera POV thin-wall chase view matches visual baseline', async ({ page }) => {
    await page.goto('/camera-harness.html?scenario=thin-wall-tunnel&frames=60&view=chase');
    const app = page.locator('#app');
    await expect(app).toHaveAttribute('data-harness-pass', '1');
    await expect(app).toHaveAttribute('data-frame-violations', '0');
    await expect(page.locator('#game-canvas')).toHaveScreenshot('camera-pov-thin-wall.png', {
      animations: 'disabled',
      maxDiffPixelRatio: 0.02,
    });
  });

  test('camera POV perimeter chase view matches visual baseline', async ({ page }) => {
    await page.goto('/camera-harness.html?scenario=rim-perimeter&frames=60&view=chase');
    const app = page.locator('#app');
    await expect(app).toHaveAttribute('data-harness-pass', '1');
    await expect(app).toHaveAttribute('data-frame-violations', '0');
    await expect(page.locator('#game-canvas')).toHaveScreenshot('camera-pov-perimeter.png', {
      animations: 'disabled',
      maxDiffPixelRatio: 0.02,
    });
  });

  for (const scenario of ['explosion', 'tracers', 'heli-hero', 'quality-low']) {
    test(`graphics and VFX: ${scenario}`, async ({ page }) => {
      await page.goto(`/vfx-harness.html?scenario=${scenario}&seed=334462&steps=7`);
      const app = page.locator('#app');
      await expect(app).toHaveAttribute('data-harness-ready', '1');
      await expect(app).toHaveAttribute('data-harness-pass', '1');
      const visible = Number(await app.getAttribute('data-visible-fx-count'));
      expect(visible).toBeGreaterThan(0);
    });
  }

  test('explosion scene matches visual baseline', async ({ page }) => {
    await page.goto('/vfx-harness.html?scenario=explosion&seed=334462&steps=7');
    const app = page.locator('#app');
    await expect(app).toHaveAttribute('data-harness-pass', '1');
    expect(Number(await app.getAttribute('data-burst-count'))).toBeGreaterThan(0);
    expect(Number(await app.getAttribute('data-smoke-count'))).toBeGreaterThan(0);
    await expect(page.locator('#game-canvas')).toHaveScreenshot('vfx-explosion.png', {
      animations: 'disabled',
      maxDiffPixelRatio: 0.03,
    });
  });

  test('tracer scene matches visual baseline', async ({ page }) => {
    await page.goto('/vfx-harness.html?scenario=tracers&seed=334462&steps=2');
    const app = page.locator('#app');
    await expect(app).toHaveAttribute('data-harness-pass', '1');
    expect(Number(await app.getAttribute('data-tracer-count'))).toBeGreaterThan(0);
    await expect(page.locator('#game-canvas')).toHaveScreenshot('vfx-tracers.png', {
      animations: 'disabled',
      maxDiffPixelRatio: 0.03,
    });
  });
});
