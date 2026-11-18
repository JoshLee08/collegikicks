// Optional browser regression checks. Uses a local server and mocked accounts only.
// Run with Playwright available and PREVIEW_URL set if not using localhost:8000.
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const base = process.env.PREVIEW_URL || 'http://localhost:8000/';
const user = { id: 'test-athlete', email: 'athlete@example.com' };
const profile = {
  displayName: 'Test Athlete',
  school: 'UC Berkeley',
  belt: 'Black',
  dan: '3',
  discipline: 'Sparring',
  priority: 'Balanced',
  sessions: '2',
  duration: '30',
  days: ['Mon', 'Wed', 'Fri'],
  goals: ['Technique'],
  timezone: 'America/Los_Angeles',
  onboardingComplete: true,
  rankLabel: 'Legacy rank',
  years: '5'
};
async function mockAccount(page, savedProfile = profile, signedIn = true) {
  await page.route('**/assets/js/account/account-service.js*', (route) =>
    route.fulfill({
      contentType: 'application/javascript',
      body: `window.testSaves=[];window.testAuth=[];window.KyorugiAccount={
      ready:Promise.resolve(${JSON.stringify(signedIn ? user : null)}),
      user:${JSON.stringify(signedIn ? user : null)},
      record:{profile:${JSON.stringify(savedProfile)},planner:{weeks:{},teams:{},tournaments:[]},revision:1},
      status(){},load:async()=>{},save:async function(p,planner){window.testSaves.push(p);this.record={profile:p,planner,revision:2};},
      client:{auth:{getSession:async()=>({data:{session:${signedIn ? JSON.stringify({ user }) : 'null'}}}),
      signInWithOAuth:async args=>{window.testAuth.push({kind:'google',args});return {};},
      signInWithOtp:async args=>{window.testAuth.push({kind:'email',args});return {};},signOut:async()=>({})}}
    };`
    })
  );
}
async function startPage(context) {
  const page = await context.newPage();
  page.on('pageerror', (error) => {
    page.errors.push(error.message);
  });
  page.errors = [];
  return page;
}
(async () => {
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {})
  });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    reducedMotion: 'reduce'
  });
  // Google belongs to the email card and never submits an empty email field.
  let page = await startPage(context);
  await mockAccount(page, {}, false);
  await page.goto(new URL('profile.html', base).href);
  await page.locator('#email-form #google').waitFor();
  await page.locator('#google').click();
  assert.equal(await page.evaluate(() => window.testAuth[0].kind), 'google');
  await page.locator('#email').fill('athlete@example.com');
  await page.locator('#email-submit').click();
  await page.getByRole('button', { name: 'Resend sign-in link', exact: true }).waitFor();
  assert.equal(await page.locator('#google').textContent(), 'Continue with Google');
  assert.deepEqual(page.errors, []);
  await page.close();
  // Existing profiles retain legacy data while removed controls stay absent.
  page = await startPage(context);
  await mockAccount(page);
  await page.goto(new URL('profile.html', base).href);
  await page.locator('#profile-form').waitFor();
  assert.equal(await page.locator('#years,#rankLabel,input[type=search]').count(), 0);
  assert.equal(await page.getByRole('button', { name: 'Save', exact: true }).count(), 4);
  assert.equal(await page.getByRole('button', { name: 'Save profile', exact: true }).count(), 1);
  assert.deepEqual(await page.locator('#dan option').allTextContents(), [
    'Not specified',
    '1st Dan',
    '2nd Dan',
    '3rd Dan',
    '4th Dan',
    '5th Dan',
    '6th Dan',
    '7th Dan',
    '8th Dan',
    '9th Dan'
  ]);
  await page.locator('#belt').selectOption('Red');
  assert.equal(await page.locator('#dan').isVisible(), false);
  await page.locator('#belt').selectOption('Black');
  assert.equal(await page.locator('#dan').isVisible(), true);
  await page.locator('#dan').selectOption('4');
  await page.getByRole('button', { name: 'Save profile', exact: true }).click();
  await page.getByRole('button', { name: 'Apply profile & plan', exact: true }).click();
  await page.waitForFunction(() => window.testSaves.length === 1);
  const stored = await page.evaluate(() => window.testSaves[0]);
  assert.equal(stored.dan, '4');
  assert.equal(stored.rankLabel, 'Legacy rank');
  assert.equal(stored.years, '5');
  assert.deepEqual(page.errors, []);
  await page.close();
  // Dan stays hidden on unrelated onboarding steps, including a saved Black belt draft.
  page = await startPage(context);
  await mockAccount(page, { ...profile, onboardingComplete: false });
  await page.goto(new URL('signup.html', base).href);
  await page.locator('#displayName').waitFor();
  await page.locator('#displayName').fill('New Athlete');
  assert.equal(await page.locator('#dan').isVisible(), false);
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  assert.equal(await page.locator('#dan').isVisible(), true);
  await page.locator('#belt').selectOption('White');
  assert.equal(await page.locator('#dan').isVisible(), false);
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.locator('#sessions').selectOption('1');
  assert.equal(await page.locator('#dan').isVisible(), false);
  assert.equal(await page.getByRole('button', { name: 'Save profile', exact: true }).count(), 1);
  assert.deepEqual(page.errors, []);
  await page.close();
  // A long selected list scrolls inside its panel without shifting the document.
  const events = Array.from({ length: 32 }, (_, i) => ({
    id: 'fixture-' + i,
    title: `Fixture event ${String(i + 1).padStart(2, '0')}`,
    start: new Date(Date.UTC(2027, 0, i + 1)).toISOString().slice(0, 10),
    end: new Date(Date.UTC(2027, 0, i + 1)).toISOString().slice(0, 10),
    location: 'Berkeley, CA',
    source: 'https://example.com/event',
    checked: '2026-11-17'
  }));
  page = await startPage(context);
  await mockAccount(page, {}, false);
  await page.addInitScript(
    (saved) => localStorage.setItem('kyorugi-planner-v1', JSON.stringify(saved)),
    { tournaments: events.slice(0, 24), club: 'berkeley', weeks: {}, teams: {} }
  );
  await page.route('**/tournament-catalog.json', (route) =>
    route.fulfill({ json: { events: [] } })
  );
  await page.route('https://kyorugi-weekly-planner-api.onrender.com/tournaments*', (route) =>
    route.fulfill({ json: { events, stale: false } })
  );
  await page.goto(new URL('tournaments.html', base).href);
  await page.locator('#tournament-results .tournament-card').first().waitFor();
  assert.equal(await page.locator('#my-tournaments .tournament-card').count(), 24);
  assert.equal(await page.locator('#my-tournaments select').count(), 0);
  assert.equal(await page.locator('#my-tournaments a').count(), 0);
  assert.equal(await page.locator('#my-tournaments .tournament-added').count(), 24);
  const panel = page.locator('.tournament-sidebar');
  const sizes = await panel.evaluate((el) => ({
    height: el.clientHeight,
    scroll: el.scrollHeight,
    bottom: el.getBoundingClientRect().bottom,
    resultsBottom: document.querySelector('.tournament-discovery').getBoundingClientRect().bottom
  }));
  assert.ok(sizes.scroll > sizes.height);
  assert.ok(sizes.bottom <= sizes.resultsBottom + 1);
  const y = await page.evaluate(() => window.scrollY);
  const hit = await panel.boundingBox();
  await page.mouse.move(hit.x + 30, hit.y + 60);
  await page.mouse.wheel(0, 450);
  await page.waitForFunction(() => document.querySelector('.tournament-sidebar').scrollTop > 0);
  assert.equal(await page.evaluate(() => window.scrollY), y);
  await panel.evaluate((el) => {
    el.scrollTop = 0;
  });
  await page.locator('#my-tournaments button').first().click();
  assert.equal(await page.locator('#my-tournaments .tournament-card').count(), 23);
  assert.equal(await page.locator('#my-tournaments select').count(), 0);
  await page.locator('#tournament-search').fill('Fixture event 25');
  await page.getByRole('button', { name: 'Add Fixture event 25 to my plan', exact: true }).click();
  assert.equal(await page.locator('#my-tournaments .tournament-card').count(), 24);
  assert.equal(await page.locator('#my-tournaments .tournament-added').count(), 24);
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false
    );
  }
  assert.deepEqual(page.errors, []);
  await browser.close();
  console.log(
    'Account card, profile fields, ordinal Dan ranks, onboarding, and isolated tournament scrolling passed.'
  );
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
