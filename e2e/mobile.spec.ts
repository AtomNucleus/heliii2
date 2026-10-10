import { expect, test } from '@playwright/test';

test('phone layout fits and touch pads produce flight input', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#app')).toHaveAttribute('data-phase', 'home');
  await expect(page.getByRole('button', { name: 'Take flight' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Take flight' }).click();
  await expect(page.locator('#touch-controls')).toBeVisible();
  const pad = page.locator('#steer-pad');
  const bounds = (await pad.boundingBox())!;
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: bounds.x + bounds.width / 2, y: bounds.y + 15 }],
  });
  await expect
    .poll(async () => Number(await page.locator('#app').getAttribute('data-speed')), {
      timeout: 30000,
    })
    .toBeGreaterThan(3);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.getByRole('button', { name: 'Pause flight' }).click();
  await expect(page.locator('#app')).toHaveAttribute('data-phase', 'paused');
  await page.getByRole('button', { name: 'Back to flight' }).click();
  await expect(page.locator('#app')).toHaveAttribute('data-phase', 'flying');
});
