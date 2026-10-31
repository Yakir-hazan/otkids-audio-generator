
// otkids-compare.js: the same clips (words + real game sentences) in several Gemini voices, to compare them.
// Node 16+, no dependencies. Existing files are skipped, so it is safe to run again after a failure.
'use strict';
const https = require('https');
const fs = require('fs');
const path = require('path');

// Usage (key comes from the environment, never from the file):
//   export GEMINI_API_KEY='...'            (several keys: separate with commas)
//   node otkids-compare.js --test          (2 clips x all voices, quick check)
//   node otkids-compare.js                 (all clips x all voices)
// Options: --out <folder> (default audio-compare)  --delay <seconds> (default 10)
//          --voices Kore,Sulafat,...  --style "text"  --model <name>
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };
const KEYS = (process.env.GEMINI_API_KEY || '').split(/[\s,]+/).filter(Boolean);
const MODEL = arg('model', 'gemini-3.1-flash-tts-preview');
const DELAY_MS = Math.max(0, Math.round(Number(arg('delay', '10')) * 1000));
const OUT_DIR = arg('out', 'audio-compare');
if (!/^[A-Za-z0-9_.\/-]+$/.test(OUT_DIR) || OUT_DIR.includes('..')) { console.error('Bad --out folder name'); process.exit(2); }
const STYLE = arg('style', 'Say warmly and cheerfully, clearly and not too fast, like a kind kindergarten teacher talking to a 5-year-old child:');
const VOICES = arg('voices', 'Kore,Sulafat,Leda,Aoede,Despina').split(',').map((s) => s.trim()).filter((s) => /^[A-Za-z]+$/.test(s));
const VARIANTS = [{ id: 'kore', voice: 'Kore', style: '' }];
VOICES.forEach((v) => { const id = v.toLowerCase() + (STYLE ? '-warm' : ''); if (!VARIANTS.some((x) => x.id === id)) VARIANTS.push({ id, voice: v, style: STYLE }); });
const ALL_CLIPS = [{"name": "w-motos", "text": "מטוס", "send": "מטוס", "note": "word, as in bank.js"}, {"name": "w-melafefon", "text": "מלפפון", "send": "מלפפון", "note": "word, as in bank.js"}, {"name": "w-shokolad", "text": "שוקולד", "send": "שוקולד", "note": "word, as in bank.js"}, {"name": "w-banana", "text": "בננה", "send": "בננה", "note": "word, as in bank.js"}, {"name": "s-hello", "text": "שלום חברים! בואו נלמד לספור מאחת עד עשר", "send": "שלום חברים! בואו נלמד לספור מאחת עד עשר", "note": "numbers game, mascot greeting (no nikud, as in code)"}, {"name": "s-correct", "text": "נכון! יש כאן חמש", "send": "נכון! יֵשׁ כָּאן חָמֵשׁ", "note": "numbers game, after a correct answer"}, {"name": "s-almost", "text": "כמעט! סופרים לאט, פריט אחר פריט, ולא שוכחים אף אחד", "send": "כמעט! סוֹפְרִים לְאַט, פְּרִיט אַחַר פְּרִיט, וְלֹא שׁוֹכְחִים אַף אֶחָד", "note": "numbers game, hint after a wrong answer"}, {"name": "s-waiting", "text": "אני מחכה לתשובה! כמה יש כאן?", "send": "אני מחכה לתשובה! כַּמָּה יֵשׁ כָּאן?", "note": "numbers game, idle nudge"}, {"name": "s-add", "text": "כמה זה שלוש ועוד ארבע?", "send": "כַּמָּה זֶה שָׁלוֹשׁ וְעוֹד אַרְבַּע?", "note": "numbers game, addition question"}, {"name": "s-days", "text": "יום שישי. היום השישי בשבוע. מתכוננים לשבת המתוקה עם חלה ונרות!", "send": "יוֹם שִׁשִּׁי. הַיּוֹם הַשִּׁשִּׁי בַּשָּׁבוּעַ. מִתְכּוֹנְנִים לְשַׁבָּת הַמְּתוּקָה עִם חַלָּה וְנֵרוֹת!", "note": "days game, long sentence"}, {"name": "s-shape", "text": "משולש. יש לו שלוש צלעות ושלוש פינות", "send": "מְשֻׁלָּשׁ. יֵשׁ לוֹ שָׁלוֹשׁ צְלָעוֹת וְשָׁלוֹשׁ פִּנּוֹת", "note": "shapes game, shape fact"}, {"name": "s-door", "text": "מה הצורה של הדלת?", "send": "מָה הַצּוּרָה שֶׁל הַדֶּלֶת?", "note": "shapes game, question"}, {"name": "s-great", "text": "כל הכבוד! עכשיו נשחק במי מתחרז!", "send": "כל הכבוד! עכשיו נשחק במי מתחרז!", "note": "rhyme game (no nikud, as in code)"}];
const CLIPS = argv.includes('--test') ? ALL_CLIPS.filter((c) => ['w-motos', 's-correct'].includes(c.name)) : ALL_CLIPS;

let keyIdx = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function request(text, voice, style) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      contents: [{ parts: [{ text: style ? style + ' ' + text : text }] }],
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } }
      }
    });
    const req = https.request({
      hostname: 'generativelanguage.googleapis.com',
      path: '/v1beta/models/' + encodeURIComponent(MODEL) + ':generateContent',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'x-goog-api-key': KEYS[keyIdx]
      }
    }, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { data += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.setTimeout(60000, () => req.destroy(new Error('timeout')));
    req.write(body);
    req.end();
  });
}

function retryDelay(body, attempt) {
  const m = /"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/.exec(body || '');
  return m ? Math.ceil(Number(m[1]) * 1000) + 1000 : 15000 * attempt;
}

async function synth(text, voice, style) {
  let last = 'unknown error';
  let switches = 0;
  for (let attempt = 1; attempt <= 4; attempt++) {
    let wait = 0;
    try {
      const r = await request(text, voice, style);
      if (r.status === 200) {
        const j = JSON.parse(r.body);
        const parts = (j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts) || [];
        const p = parts.find((x) => x.inlineData && x.inlineData.data);
        if (p) {
          const m = /rate=(\d+)/.exec(p.inlineData.mimeType || '');
          return { pcm: Buffer.from(p.inlineData.data, 'base64'), rate: m ? Number(m[1]) : 24000 };
        }
        last = 'no audio in response';
        wait = 5000 * attempt;
      } else {
        let msg = r.body.slice(0, 200);
        try { msg = JSON.parse(r.body).error.message || msg; } catch (e) { /* keep raw */ }
        last = 'HTTP ' + r.status + ': ' + msg;
        const more = KEYS.length > 1 && switches < KEYS.length - 1;
        if ((r.status === 429 || r.status === 401 || r.status === 403) && more) {
          switches++;
          keyIdx = (keyIdx + 1) % KEYS.length;
          attempt--;
          console.log('    switching to key ' + (keyIdx + 1) + ' of ' + KEYS.length + ' (' + last.slice(0, 70) + ')');
          continue;
        }
        if (r.status === 429 || r.status >= 500) wait = retryDelay(r.body, attempt);
        else return { error: last, fatal: r.status !== 400 };
      }
    } catch (e) {
      last = 'network: ' + e.message;
      wait = 5000 * attempt;
    }
    if (attempt < 4) {
      console.log('    attempt ' + attempt + ' failed (' + last.slice(0, 80) + '), retrying in ' + Math.round(wait / 1000) + 's');
      await sleep(wait);
    }
  }
  return { error: last, fatal: false };
}

function wav(pcm, rate) {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(pcm.length + 36, 4); h.write('WAVE', 8); h.write('fmt ', 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

async function main() {
  if (!KEYS.length) { console.error('No API key'); return 2; }
  fs.mkdirSync(OUT_DIR, { recursive: true });
  VARIANTS.forEach((v) => fs.mkdirSync(path.join(OUT_DIR, v.id), { recursive: true }));
  fs.writeFileSync(path.join(OUT_DIR, 'variants.json'), JSON.stringify({ model: MODEL, variants: VARIANTS, clips: CLIPS }, null, 2));
  const total = CLIPS.length * VARIANTS.length;
  console.log('clips: ' + CLIPS.length + ' | variants: ' + VARIANTS.length + ' | total files: ' + total + ' | model: ' + MODEL + ' | keys: ' + KEYS.length);
  console.log('output: ' + path.resolve(OUT_DIR) + '\n');
  let ok = 0;
  let skipped = 0;
  let n = 0;
  const failed = [];
  let called = false;
  // Clips in the outer loop: if the run stops early, every voice already has the first clips to compare.
  outer:
  for (const c of CLIPS) {
    for (const v of VARIANTS) {
      n++;
      const tag = '[' + n + '/' + total + ']';
      const file = path.join(OUT_DIR, v.id, c.name + '.wav');
      if (fs.existsSync(file) && fs.statSync(file).size > 44) { console.log('exists ' + tag + ' ' + v.id + '/' + c.name); skipped++; continue; }
      if (called && DELAY_MS > 0) await sleep(DELAY_MS);
      called = true;
      const out = await synth(c.send, v.voice, v.style);
      if (out.error) {
        console.error('ERR ' + tag + ' ' + v.id + '/' + c.name + ': ' + out.error);
        failed.push({ variant: v.id, name: c.name, error: out.error });
        if (out.fatal) { console.error('This will not fix itself by retrying. Stopping. Check the key / model name / voice name and run again.'); break outer; }
        continue;
      }
      fs.writeFileSync(file + '.part', wav(out.pcm, out.rate));
      fs.renameSync(file + '.part', file);
      console.log('OK ' + tag + ' ' + v.id + '/' + c.name);
      ok++;
    }
  }
  console.log('\nok: ' + ok + ' | skipped: ' + skipped + ' | failed: ' + failed.length);
  if (failed.length) {
    fs.writeFileSync(path.join(OUT_DIR, '_errors.json'), JSON.stringify(failed, null, 2));
    console.log('errors saved to ' + path.join(OUT_DIR, '_errors.json') + ' (run again to retry)');
  }
  console.log('done: ' + path.resolve(OUT_DIR));
  return failed.length ? 1 : 0;
}

main().then((c) => process.exit(c)).catch((e) => { console.error('Fatal: ' + e.message); process.exit(3); });
