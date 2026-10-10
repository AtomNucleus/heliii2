import { expect, test } from '@playwright/test';

test('coastal run launches, responds to flight input, pauses safely, and restarts', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('#app')).toHaveAttribute('data-phase', 'home');
  await expect(page.getByRole('heading', { name: /Find your altitude/ })).toBeVisible();
  await page.getByRole('button', { name: 'Take flight' }).click();
  await expect(page.locator('#app')).toHaveAttribute('data-phase', 'flying');
  await page.keyboard.down('KeyW');
  await expect
    .poll(async () => Number(await page.locator('#app').getAttribute('data-speed')), {
      timeout: 30000,
    })
    .toBeGreaterThan(5);
  await expect(page.locator('#app')).toHaveAttribute('data-checkpoint', '1', { timeout: 60000 });
  await page.keyboard.up('KeyW');
  await page.keyboard.press('Escape');
  await expect(page.locator('#pause-dialog')).toBeVisible();
  const altitude = await page.locator('#app').getAttribute('data-altitude');
  await page.waitForTimeout(500);
  expect(await page.locator('#app').getAttribute('data-altitude')).toBe(altitude);
  await page.getByRole('button', { name: 'Back to flight' }).click();
  await expect(page.locator('#app')).toHaveAttribute('data-phase', 'flying');
  await page.keyboard.press('KeyC');
  await expect(page.locator('#toast')).toHaveText('Cockpit view');
  await page.keyboard.press('KeyR');
  await expect(page.locator('#app')).toHaveAttribute('data-checkpoint', '0');
  await expect(page.locator('#app')).toHaveAttribute('data-audio', 'ready');
  expect(errors).toEqual([]);
});

test('flight mode, manual, and device settings work and persist', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#app')).toHaveAttribute('data-phase', 'home');
  await page.getByRole('button', { name: /Flight manual/ }).click();
  await expect(page.locator('#guide-dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Close flight manual' }).click();
  await page.getByRole('button', { name: 'Open settings' }).click();
  await page.locator('#quality').selectOption('low');
  await page.locator('#reduced-motion').check();
  await page.getByRole('button', { name: 'Close settings' }).click();
  await page.getByRole('button', { name: 'Mute sound' }).click();
  await page.reload();
  await expect(page.locator('#app')).toHaveAttribute('data-phase', 'home');
  await expect(page.getByRole('button', { name: 'Unmute sound' })).toBeVisible();
  await expect(page.locator('body')).toHaveClass('reduced-motion');
  await page.locator('[data-mode="free"]').click();
  await page.getByRole('button', { name: 'Take flight' }).click();
  await expect(page.locator('#mode-label')).toHaveText('FREE FLIGHT');
  await page.getByRole('button', { name: 'Open settings' }).click();
  await expect(page.locator('#app')).toHaveAttribute('data-phase', 'paused');
  await expect(page.locator('#quality')).toHaveValue('low');
  await page.keyboard.press('Escape');
  await expect(page.locator('#pause-dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Return to hangar' }).click();
  await expect(page.locator('#app')).toHaveAttribute('data-phase', 'home');
});
