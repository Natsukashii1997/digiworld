import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {collectionFixture,syntheticNote} from './collection-fixture.mjs';
const browser = await chromium.launch();
const generator = await browser.newPage();
let app;

try {
  // Use a valid synthetic MP4 to exercise the browser decoder and seek path.
  const bytes = Buffer.from(await generator.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 160;
    canvas.height = 120;
    const drawing = canvas.getContext('2d');
    const stream = canvas.captureStream(20);
    const chunks = [];
    const recorder = new MediaRecorder(stream, { mimeType: 'video/mp4;codecs=avc1' });
    const finished = new Promise(resolve => {
      recorder.ondataavailable = event => chunks.push(event.data);
      recorder.onstop = resolve;
    });
    let step = 0;
    const timer = setInterval(() => {
      drawing.fillStyle = step++ % 2 ? '#cc2233' : '#22aa77';
      drawing.fillRect(0, 0, 160, 120);
      drawing.fillStyle = '#ffffff';
      drawing.fillText(String(step), 40, 60);
    }, 50);
    recorder.start();
    await new Promise(resolve => setTimeout(resolve, 3500));
    recorder.stop();
    await finished;
    clearInterval(timer);
    stream.getTracks().forEach(track => track.stop());
    return Array.from(new Uint8Array(await new Blob(chunks, { type: 'video/mp4' }).arrayBuffer()));
  }));
  assert.ok(bytes.length > 1000);
  await generator.close();

  const picture = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/5m8AAAAASUVORK5CYII=', 'base64');
  app = await collectionFixture({
    fetchImpl: async url => {
      assert.ok(String(url).includes('.xhscdn.com/'));
      return String(url).endsWith('.mp4')
        ? new Response(bytes, { headers: { 'content-type': 'video/mp4', 'content-length': String(bytes.length) } })
        : new Response(picture, { headers: { 'content-type': 'image/png' } });
    },
    // This probe validates serving/playback/seek, not native ASR accuracy.
    analyzer: async () => ({ duration: 3.5, transcriptSegments: [
      { start: 0, duration: 2, text: 'Synthetic start' },
      { start: 2.3, duration: 1, text: 'Synthetic seek target' },
    ] }),
  });
  const note = syntheticNote(7, { type: 'video', videoUrl: 'https://sns-video.xhscdn.com/fixture.mp4' });
  assert.equal((await app.importNote(note)).status, 'complete');
  const stored = (await app.api('/notes')).notes.find(item => item.id === note.id);
  assert.equal(stored.videoStatus, 'ready');
  assert.ok(stored.videoUrl.startsWith('/collection-media/'));

  for (const [range, status, expected] of [
    ['bytes=0-3', 206, bytes.subarray(0, 4)],
    ['bytes=8-', 206, bytes.subarray(8)],
    [`bytes=${bytes.length}-`, 416, null],
    ['bytes=4-1', 416, null],
  ]) {
    const response = await fetch(app.url + stored.videoUrl, { headers: { Range: range } });
    assert.equal(response.status, status);
    const body = Buffer.from(await response.arrayBuffer());
    if (expected) {
      assert.deepEqual(body, expected);
      assert.equal(response.headers.get('accept-ranges'), 'bytes');
      assert.ok(response.headers.get('content-range').endsWith('/' + bytes.length));
    }
    console.log('PASS Range', range, status);
  }

  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  await page.route('**/*', route => {
    assert.equal(new URL(route.request().url()).origin, app.url);
    return route.continue();
  });
  await page.goto(app.url + '/#learning');
  await page.locator(`.collection-card-position[data-note-id="${note.id}"]`).click();
  const dialog = page.getByRole('dialog');
  await dialog.waitFor();
  const video = dialog.locator('video');
  await video.waitFor();
  await page.waitForFunction(() => {
    const current = document.querySelector('.collection-reader video');
    return current && current.readyState >= 1 && Number.isFinite(current.duration) && current.duration > 2.3;
  });
  assert.equal(await video.evaluate(current => current.currentTime), 0);
  await dialog.getByRole('button', { name: '0:02', exact: true }).click();
  await page.waitForFunction(() => {
    const current = document.querySelector('.collection-reader video');
    return current && !current.paused && current.currentTime >= 2.3 && current.currentTime < 3.4;
  });
  const playing = await video.evaluate(current => {
    const state = { currentTime: current.currentTime, paused: current.paused, readyState: current.readyState };
    current.pause();
    return state;
  });
  console.log('PASS real synthetic MP4 playback and timestamp seek', JSON.stringify(playing));
  await context.close();
} finally {
  await browser.close();
  if (app) await app.close();
}
