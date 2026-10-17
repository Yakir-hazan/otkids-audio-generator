// otkids-audio.js: one WAV file per word of the otkids bank.js (Gemini TTS). File name = word id.
// Key comes from the GEMINI_API_KEY env var (several keys: comma separated). Optional env: LIMIT (0 = all), VOICE, MODEL, STYLE (tone, English), DELAY_MS, OUT_DIR, SITE.
// SET=numbers records the number words 1-10 (with nikud, as written in the numbers game); SET=letters records the 22 letter names (with nikud, file = letter id from bank.js). Both replace the bank words; default OUT_DIR becomes audio/<set>.
// List voices: node otkids-audio.js voices   (VOICE_GENDER=female|male, VOICE_LANG=he-IL, VOICE_SEARCH=warm)
// Node 16+, no dependencies. Existing files are skipped, so it is safe to run again after a failure.
'use strict';
const https = require('https');
const fs = require('fs');
const path = require('path');

const KEYS = (process.env.GEMINI_API_KEY || '').split(',').map((s) => s.trim()).filter(Boolean);
const MODEL = process.env.MODEL || "gemini-3.8-flash-tts";
const VOICE = process.env.VOICE || "Sulafat";
const STYLE = process.env.STYLE || "";
const DELAY_MS = Number(process.env.DELAY_MS || 10000);
const SET = (process.env.SET || '').trim();
const OUT_DIR = process.env.OUT_DIR || (SET ? "audio/" + SET : "audio/words");
const LIMIT = Number(process.env.LIMIT || 0);
const SITE = process.env.SITE || "https://otkids.vercel.app";
const SNAPSHOT = [["motos","מטוס"],["mafteach","מפתח"],["melafefon","מלפפון"],["shemesh","שמש"],["shaon","שעון"],["shokolad","שוקולד"],["bayit","בית"],["balon","בלון"],["banana","בננה"],["dag","דג"],["dov","דוב"],["delet","דלת"],["pil","פיל"],["parpar","פרפר"],["pitza","פיצה"],["tapuach","תפוח"],["tut","תות"],["tuki","תוכי"],["kelev","כלב"],["kadur","כדור"],["kova","כובע"],["lev","לב"],["limon","לימון"],["lechem","לחם"],["nachash","נחש"],["naal","נעל"],["ner","נר"],["sus","סוס"],["sefer","ספר"],["sukaria","סוכריה"],["gamal","גמל"],["gezer","גזר"],["glida","גלידה"],["zebra","זברה"],["zvuv","זבוב"],["zeev","זאב"],["chatul","חתול"],["chalav","חלב"],["chalon","חלון"],["rakevet","רכבת"],["robot","רובוט"],["ramzor","רמזור"],["yanshuf","ינשוף"],["yona","יונה"],["yareach","ירח"],["televizya","טלוויזיה"],["traktor","טרקטור"],["tavas","טווס"],["tzav","צב"],["tzfardea","צפרדע"],["tziif","צעיף"],["kof","קוף"],["keshet","קשת"],["kerach","קרח"],["har","הר"],["hamburger","המבורגר"],["hipopotam","היפופוטם"],["vered","ורד"],["wafel","וופל"],["aryeh","אריה"],["arnav","ארנב"],["avatiach","אבטיח"],["anan","ענן"],["achbar","עכבר"],["agala","עגלה"]];

// Word list: 1) js/content/bank.js in the folder you run this from, 2) the live otkids site, 3) the snapshot above.
// bank.js is only READ AS TEXT and parsed with a pattern. Nothing from it is ever executed.
function parseBank(src) {
  const start = src.indexOf('export const WORDS = [');
  if (start < 0) throw new Error('WORDS not found');
  const end = src.indexOf('\n];', start);
  if (end < 0) throw new Error('end of WORDS not found');
  const block = src.slice(start, end);
  const words = [];
  const re = /\bid:\s*'([^']+)'\s*,\s*text:\s*'([^']+)'/g;
  let m;
  while ((m = re.exec(block))) words.push([m[1], m[2]]);
  const ids = (block.match(/\bid:\s*'/g) || []).length;
  if (!words.length || words.length !== ids) throw new Error('could not read every word (' + words.length + ' of ' + ids + ')');
  const seen = {};
  words.forEach((w) => {
    if (!/^[A-Za-z0-9_]+$/.test(w[0])) throw new Error('unsafe id: ' + w[0]);
    if (seen[w[0]]) throw new Error('duplicate id: ' + w[0]);
    seen[w[0]] = 1;
  });
  return words;
}

function download(url, redirects) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'otkids-audio-generator' } }, (res) => {
      if ([301, 302, 307, 308].indexOf(res.statusCode) !== -1 && res.headers.location && redirects < 3) {
        res.resume();
        resolve(download(new URL(res.headers.location, url).href, redirects + 1));
        return;
      }
      if (res.statusCode !== 200) { res.resume(); reject(new Error('HTTP ' + res.statusCode)); return; }
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { data += c; if (data.length > 1000000) req.destroy(new Error('file too large')); });
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.setTimeout(15000, () => req.destroy(new Error('timeout')));
  });
}

// Fixed sets, recorded instead of the bank words when SET=<name> is given. File name = id.
const SETS = {
  numbers: [["1","אֶחָד"],["2","שְׁנַיִם"],["3","שָׁלוֹשׁ"],["4","אַרְבַּע"],["5","חָמֵשׁ"],["6","שֵׁשׁ"],["7","שֶׁבַע"],["8","שְׁמוֹנֶה"],["9","תֵּשַׁע"],["10","עֶשֶׂר"]],
  letters: [["alef","אָלֶף"],["bet","בֵּית"],["gimel","גִּימֶל"],["dalet","דָּלֶת"],["he","הֵא"],["vav","וָו"],["zayin","זַיִן"],["chet","חֵית"],["tet","טֵית"],["yod","יוֹד"],["kaf","כַּף"],["lamed","לָמֶד"],["mem","מֵם"],["nun","נוּן"],["samech","סָמֶךְ"],["ayin","עַיִן"],["pe","פֵּא"],["tsadi","צַדִּי"],["qof","קוֹף"],["resh","רֵישׁ"],["shin","שִׁין"],["tav","תָּו"]]
};

async function loadWords() {
  const notes = [];
  if (SET) {
    if (!SETS[SET]) throw new Error('unknown SET "' + SET + '" (available: ' + Object.keys(SETS).join(', ') + ')');
    return { words: SETS[SET], source: 'built-in set "' + SET + '"', notes: notes };
  }
  const bankPath = path.join(process.cwd(), 'js', 'content', 'bank.js');
  if (fs.existsSync(bankPath)) {
    try { return { words: parseBank(fs.readFileSync(bankPath, 'utf8')), source: 'local file ' + bankPath, notes: notes }; }
    catch (e) { notes.push('local bank.js not usable: ' + e.message); }
  }
  if (SITE) {
    const url = SITE.replace(/\/+$/, '') + '/js/content/bank.js';
    try { return { words: parseBank(await download(url, 0)), source: 'live site ' + url, notes: notes }; }
    catch (e) { notes.push('could not use ' + url + ': ' + e.message); }
  }
  return { words: SNAPSHOT, source: 'embedded snapshot (may be out of date)', notes: notes };
}

const NEW_API = !/gemini-(2\.5|3\.1)/.test(MODEL);
const BASE = new URL(process.env.API_BASE || 'https://generativelanguage.googleapis.com');
const LIB = BASE.protocol === 'http:' ? require('http') : https;
let keyIdx = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function request(text) {
  return new Promise((resolve, reject) => {
    // gemini-3.8 TTS: text is the verbatim transcript, the tone goes in speech_metadata.style.
    // Older models (3.1 preview, 2.5): the style is a prefix of the text.
    const part = { text: NEW_API ? text : (STYLE ? STYLE + ' ' + text : text) };
    if (NEW_API && STYLE) part.speech_metadata = { style: STYLE };
    const body = JSON.stringify(NEW_API ? {
      contents: [{ role: 'user', parts: [part] }],
      generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { voice: VOICE } } }
    } : {
      contents: [{ parts: [part] }],
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICE } } }
      }
    });
    const req = LIB.request({
      hostname: BASE.hostname,
      port: BASE.port || undefined,
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

async function synth(text) {
  let last = 'unknown error';
  let switches = 0;
  for (let attempt = 1; attempt <= 4; attempt++) {
    let wait = 0;
    try {
      const r = await request(text);
      if (r.status === 200) {
        const j = JSON.parse(r.body);
        const parts = (j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts) || [];
        const p = parts.find((x) => x.inlineData && x.inlineData.data);
        if (p) {
          const m = /rate=(\d+)/.exec(p.inlineData.mimeType || '');
          const raw = Buffer.from(p.inlineData.data, 'base64');
          return { pcm: raw, rate: m ? Number(m[1]) : 24000, isWav: raw.length > 44 && raw.toString('ascii', 0, 4) === 'RIFF' };
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

function getJson(pathAndQuery) {
  return new Promise((resolve, reject) => {
    const req = LIB.get({ hostname: BASE.hostname, port: BASE.port || undefined, path: pathAndQuery, headers: { 'x-goog-api-key': KEYS[0] } }, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        if (res.statusCode !== 200) { reject(new Error('HTTP ' + res.statusCode + ': ' + data.slice(0, 200))); return; }
        try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.setTimeout(30000, () => req.destroy(new Error('timeout')));
  });
}

// node otkids-audio.js voices   (env: VOICE_GENDER=female|male|neutral, VOICE_LANG=he-IL, VOICE_SEARCH=warm)
async function listVoices() {
  const gender = process.env.VOICE_GENDER === undefined ? 'female' : process.env.VOICE_GENDER;
  let token = '';
  let count = 0;
  for (let page = 0; page < 20; page++) {
    const q = ['page_size=200'];
    if (gender) q.push('gender=' + encodeURIComponent(gender));
    if (process.env.VOICE_LANG) q.push('language_code=' + encodeURIComponent(process.env.VOICE_LANG));
    if (process.env.VOICE_SEARCH) q.push('search=' + encodeURIComponent(process.env.VOICE_SEARCH));
    if (token) q.push('page_token=' + encodeURIComponent(token));
    const j = await getJson('/v1beta/voices?' + q.join('&'));
    (j.voices || []).forEach((v) => {
      count++;
      console.log((v.id || v.name) + ' | ' + (v.displayName || v.display_name || '') + ' (' + [v.languageCode || v.language_code, v.accent, v.gender, v.pitch].filter(Boolean).join(', ') + ') ' + (v.description || ''));
    });
    token = j.nextPageToken || j.next_page_token || '';
    if (!token) break;
  }
  console.log('\nvoices: ' + count + '. Use the first column: VOICE=<id> (prebuilt names such as Sulafat also work).');
  return 0;
}

async function main() {
  if (!KEYS.length) { console.error('Missing key. Run: export GEMINI_API_KEY="your-key"'); return 2; }
  if (process.argv[2] === 'voices') return listVoices();
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const loaded = await loadWords();
  const list = LIMIT > 0 ? loaded.words.slice(0, LIMIT) : loaded.words;
  loaded.notes.forEach((n) => console.log('note: ' + n));
  console.log('word source: ' + loaded.source);
  console.log('words: ' + list.length + ' | voice: ' + VOICE + ' | model: ' + MODEL + ' | keys: ' + KEYS.length);
  console.log('output: ' + path.resolve(OUT_DIR) + '\n');
  let ok = 0;
  let skipped = 0;
  const failed = [];
  let called = false;
  for (let i = 0; i < list.length; i++) {
    const id = list[i][0];
    const text = list[i][1];
    const tag = '[' + (i + 1) + '/' + list.length + ']';
    const file = path.join(OUT_DIR, id + '.wav');
    if (fs.existsSync(file) && fs.statSync(file).size > 44) { console.log('exists ' + tag + ' ' + id); skipped++; continue; }
    if (called && DELAY_MS > 0) await sleep(DELAY_MS);
    called = true;
    const out = await synth(text);
    if (out.error) {
      console.error('ERR ' + tag + ' ' + id + ' (' + text + '): ' + out.error);
      failed.push({ id: id, text: text, error: out.error });
      if (out.fatal) { console.error('This will not fix itself by retrying. Stopping. Check the key / model name and run again.'); break; }
      continue;
    }
    fs.writeFileSync(file + '.part', out.isWav ? out.pcm : wav(out.pcm, out.rate));
    fs.renameSync(file + '.part', file);
    console.log('OK ' + tag + ' ' + id + ' (' + text + ')');
    ok++;
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
