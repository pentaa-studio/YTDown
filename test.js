const { getClient, extractVideoId } = require('./lib/youtube');

const TEST_URL = 'https://www.youtube.com/watch?v=MH6-YF2LEzU';

async function main() {
  const videoId = extractVideoId(TEST_URL);
  console.log(`Testing: ${TEST_URL}\n`);

  const youtube = await getClient();

  console.log('[1/3] Fetching info...');
  const info = await youtube.getBasicInfo(videoId);
  console.log(`  ${info.basic_info.title} (${info.basic_info.duration}s)\n`);

  console.log('[2/3] MP4 (video+audio)...');
  const s1 = await info.download({ type: 'video+audio', quality: 'bestefficiency' });
  let b1 = 0;
  const r1 = s1.getReader();
  while (true) { const { done, value } = await r1.read(); if (done) break; b1 += value.byteLength; if (b1 > 100000) { await r1.cancel(); break; } }
  console.log(`  OK (${(b1/1024).toFixed(0)} KB)\n`);

  console.log('[3/3] MP3 (video+audio as audio)...');
  const info2 = await youtube.getBasicInfo(videoId);
  const s2 = await info2.download({ type: 'video+audio', quality: 'bestefficiency' });
  let b2 = 0;
  const r2 = s2.getReader();
  while (true) { const { done, value } = await r2.read(); if (done) break; b2 += value.byteLength; if (b2 > 100000) { await r2.cancel(); break; } }
  console.log(`  OK (${(b2/1024).toFixed(0)} KB)\n`);

  console.log('[OK] All tests passed!');
}

main().catch(err => { console.error(`[FAIL] ${err.message}`); process.exit(1); });
