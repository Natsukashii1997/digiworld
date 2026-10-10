import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {collectionFixture,syntheticNote} from './collection-fixture.mjs';
const app = await collectionFixture();
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
const page = await context.newPage();
page.setDefaultTimeout(7000);
const until = async (check) => {
  for (let i = 0; i < 100; i++) {
    if (await check()) return;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error('State did not converge');
};
const ids = [1, 2, 3].map(index => syntheticNote(index).id);
const groups = ['A', 'B', 'C'].map(name => ({ id: `group-${name}`, name: `${name} test`, kind: 'custom', sourceCategory: '' }));

try {
  for (let index = 1; index <= 3; index++) await app.importNote(syntheticNote(index));
  const desk = await app.api('/desk-workspace');
  await app.api('/desk-workspace', {
    workspace: { ...desk, groups, noteGroupMap: { [ids[0]]: 'group-A', [ids[1]]: 'group-A', [ids[2]]: 'group-B' } },
    expectedRevision: desk.revision,
  }, 'PUT');
  await page.route('**/*', route => {
    assert.equal(new URL(route.request().url()).origin, app.url);
    return route.continue();
  });
  await page.goto(app.url + '/#learning');
  await page.locator('.collection-canvas').waitFor();
  const group = id => page.locator(`.collection-group[data-group-id="${id}"]`);
  const card = id => page.locator(`.collection-card-position[data-note-id="${id}"]`);

  await group('group-A').click();
  for (const id of ids.slice(0, 2)) {
    await card(id).click({ modifiers: ['Alt'] });
    assert.equal(await card(id).getAttribute('aria-pressed'), 'true');
  }
  assert.equal(await page.getByRole('dialog').count(), 0);
  console.log('PASS Alt multiselect without reader');

  await card(ids[0]).locator('.desk-native-drag').dragTo(group('group-B'));
  await until(async () => {
    const current = await app.api('/desk-workspace');
    return current.noteGroupMap[ids[0]] === 'group-B' && current.noteGroupMap[ids[1]] === 'group-B';
  });
  assert.equal(await card(ids[0]).getAttribute('aria-pressed'), 'false');
  console.log('PASS native drag moved both selected notes');

  await group('group-C').dragTo(group('group-A'));
  await until(async () => JSON.stringify((await app.api('/desk-workspace')).groups.filter(item => item.kind === 'custom').map(item => item.id)) === JSON.stringify(['group-C', 'group-A', 'group-B']));
  console.log('PASS native group reorder persisted');

  const note = syntheticNote(9);
  const payload = 'KANKAN_NOTE:' + JSON.stringify(note);
  const data = await page.evaluateHandle(value => {
    const transfer = new DataTransfer();
    transfer.setData('application/x-kankan-note', value);
    transfer.setData('text/plain', value);
    return transfer;
  }, payload);
  await page.locator('.collection-desk').dispatchEvent('dragenter', { dataTransfer: data });
  await page.locator('.collection-import-feedback').waitFor();
  await page.locator('.collection-import-feedback').dispatchEvent('drop', { dataTransfer: data });
  await until(async () => (await app.api('/notes')).notes.some(item => item.id === note.id));
  await until(async () => await card(note.id).count() === 1);
  await until(async () => await page.locator('.collection-import-feedback').count() === 0);
  console.log('PASS external DataTransfer drop imported and rendered');

  await group('group-B').click();
  await card(ids[0]).focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog');
  await dialog.waitFor();
  const controls = dialog.locator('button:visible,a[href]:visible,input:visible,[tabindex="0"]:visible');
  assert.ok(await controls.first().evaluate(node => node === document.activeElement));
  await controls.first().focus();
  await page.keyboard.press('Shift+Tab');
  assert.ok(await controls.last().evaluate(node => node === document.activeElement));
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'hidden' });
  assert.ok(await card(ids[0]).evaluate(node => node === document.activeElement));
  console.log('PASS reader initial focus, trap, and restoration');
} finally {
  await browser.close();
  await app.close();
}
