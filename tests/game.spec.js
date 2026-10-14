const { test, expect } = require('@playwright/test');

// Перед каждым тестом: чистое сохранение + слушаем ошибки JavaScript
test.beforeEach(async ({ page }) => {
  page.pageErrors = [];
  page.on('pageerror', (err) => page.pageErrors.push(err.message));
  page.on('console', (msg) => {
    // Недоступность картинок/CDN не считаем ошибкой игры
    if (msg.type() === 'error' && !msg.text().includes('Failed to load resource')) {
      page.pageErrors.push(msg.text());
    }
  });

  await page.goto('/index.html');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.locator('#city-main h1')).toBeVisible();
});

// После каждого теста: на странице не должно быть ошибок JavaScript
test.afterEach(async ({ page }) => {
  expect(page.pageErrors, 'Ошибки JavaScript на странице').toEqual([]);
});

const closeModal = (page) => page.locator('#modal-actions button').click();
const shopItem = (page, name) =>
  page.locator('#ui-shop-grid > div').filter({ hasText: name }).getByRole('button');

async function startSlumsFight(page) {
  await page.locator('#tab-btn-arena').click();
  await page.getByRole('button', { name: 'Искать противника' }).first().click();
  await expect(page.locator('#arena-combat')).toBeVisible();
}

test('игра загружается с начальными значениями', async ({ page }) => {
  await expect(page).toHaveTitle('Территория: Возрождение');
  await expect(page.locator('#city-main h1')).toContainText(/Химер-Сити/i);
  await expect(page.locator('#ui-player-level')).toHaveText('1');
  await expect(page.locator('#ui-player-money')).toHaveText('50');
  // здоровье в начале полное, например 65/65
  await expect(page.locator('#ui-player-hp-text')).toHaveText(/^(\d+)\/\1$/);
});

test('вкладки Рюкзак, Арена и Город переключаются', async ({ page }) => {
  await page.locator('#tab-btn-inventory').click();
  await expect(page.locator('#tab-inventory')).toBeVisible();
  await expect(page.locator('#tab-city')).toBeHidden();
  await expect(page.locator('#ui-inventory-grid')).toContainText('Ржавая труба');

  await page.locator('#tab-btn-arena').click();
  await expect(page.locator('#arena-lobby')).toBeVisible();
  await expect(page.locator('#ui-locations-grid')).toContainText('Трущобы');
  await expect(page.locator('#ui-locations-grid')).toContainText('Доступно с 3 уровня');

  await page.locator('#tab-btn-city').click();
  await expect(page.locator('#tab-city')).toBeVisible();
});

test('магазин: покупка списывает Терры и кладёт предмет в рюкзак', async ({ page }) => {
  await page.getByRole('button', { name: 'Войти' }).click();
  await expect(page.locator('#city-shop')).toBeVisible();
  await expect(page.locator('#ui-shop-money')).toHaveText('50');

  await shopItem(page, 'Боевой нож').click();
  await expect(page.locator('#modal-text')).toHaveText('Вы приобрели: Боевой нож.');
  await closeModal(page);

  await expect(page.locator('#ui-player-money')).toHaveText('30');
  expect(await page.evaluate(() => player.inventory)).toContain('wep_knife');
});

test('магазин: дорогой предмет нельзя купить без денег', async ({ page }) => {
  await page.getByRole('button', { name: 'Войти' }).click();
  await expect(shopItem(page, 'Самодельный пистолет')).toBeDisabled();
});

test('рюкзак: предмет можно надеть и снять', async ({ page }) => {
  await page.locator('#tab-btn-inventory').click();
  await page.getByRole('button', { name: 'Надеть' }).click();

  await expect(page.locator('#ui-inventory-empty')).toBeVisible();
  await expect(page.locator('#ui-equipped-container')).toContainText('Ржавая труба');
  await expect(page.locator('#ui-stats-container')).toContainText('(+2)');

  await page.locator('#ui-equipped-container > div').filter({ hasText: 'Ржавая труба' }).click();
  await expect(page.locator('#ui-inventory-grid')).toContainText('Ржавая труба');
});

test('госпиталь восстанавливает здоровье за 10 Терр', async ({ page }) => {
  await page.evaluate(() => { player.hp = 10; updateUI(); });
  await expect(page.locator('#ui-player-hp-text')).toHaveText(/^10\/\d+$/);

  await page.getByRole('button', { name: /Вылечиться/ }).click();

  await expect(page.locator('#ui-player-hp-text')).toHaveText(/^(\d+)\/\1$/);
  await expect(page.locator('#ui-player-money')).toHaveText('40');
});

test('бой: ходы работают, бой доводится до победы с наградой', async ({ page }) => {
  await startSlumsFight(page);
  await expect(page.locator('#combat-controls')).toBeVisible();
  expect(await page.evaluate(() => combat.active)).toBe(true);

  // Ослабляем врага, чтобы результат не зависел от случайности
  await page.evaluate(() => { combat.enemy.hp = 1; });

  const turn = page.getByRole('button', { name: 'ХОД', exact: true });
  for (let i = 0; i < 30; i++) {
    if (await page.locator('#combat-result').isVisible()) break;
    await turn.click();
  }

  await expect(page.locator('#combat-result')).toBeVisible();
  await expect(page.locator('#combat-result-title')).toHaveText('ПОБЕДА');
  await expect(page.locator('#ui-player-exp-text')).not.toHaveText(/^0\//);
  expect(await page.evaluate(() => combat.active)).toBe(false);

  await page.getByRole('button', { name: 'Вернуться в город' }).click();
  await expect(page.locator('#arena-lobby')).toBeVisible();
});

test('во время боя нельзя уйти с арены', async ({ page }) => {
  await startSlumsFight(page);
  await page.locator('#tab-btn-city').click();

  await expect(page.locator('#modal-text')).toHaveText(
    'Вы не можете покинуть вкладку Арены во время боя!'
  );
  await closeModal(page);
  await expect(page.locator('#arena-combat')).toBeVisible();
});

test('прогресс сохраняется после перезагрузки страницы', async ({ page }) => {
  await page.getByRole('button', { name: 'Войти' }).click();
  await shopItem(page, 'Боевой нож').click();
  await closeModal(page);

  await page.reload();

  await expect(page.locator('#ui-player-money')).toHaveText('30');
  expect(await page.evaluate(() => player.inventory)).toContain('wep_knife');
});
