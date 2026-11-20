// Bell to Bell: game page + results collector. No dependencies, Node 18+.
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const KEY = process.env.TEACHER_KEY || crypto.randomBytes(6).toString('hex');
const DATA_FILE = path.join(__dirname, 'data', 'results.json');
const PUBLIC = path.join(__dirname, 'public');
const MAX_PUZZLE = 70, MAX_SORT = 120, MAX_ROWS = 1000;

let results = [];
try { results = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); } catch (_) { results = []; }

function save() {
  fs.mkdir(path.dirname(DATA_FILE), { recursive: true }, () =>
    fs.writeFile(DATA_FILE, JSON.stringify(results), () => {}));
}
function keyOk(given) {
  const a = Buffer.from(String(given || '')), b = Buffer.from(KEY);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function send(res, code, body, type) {
  res.writeHead(code, { 'Content-Type': type || 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}
function page(res, file) {
  fs.readFile(path.join(PUBLIC, file), (err, buf) => {
    if (err) return send(res, 404, 'Not found', 'text/plain; charset=utf-8');
    send(res, 200, buf.toString('utf8'), 'text/html; charset=utf-8');
  });
}
const clamp = (v, max) => Math.max(0, Math.min(max, Math.round(Number(v) || 0)));

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const route = req.method + ' ' + url.pathname;

  if (route === 'GET /') return page(res, 'index.html');
  if (route === 'GET /results') return page(res, 'results.html');
  if (route === 'GET /health') return send(res, 200, { ok: true });

  if (route === 'POST /api/results') {
    let body = '';
    req.on('data', c => { body += c; if (body.length > 2000) req.destroy(); });
    req.on('end', () => {
      let d;
      try { d = JSON.parse(body); } catch (_) { return send(res, 400, { error: 'Bad JSON' }); }
      const name = String(d.name || '').replace(/\s+/g, ' ').trim().slice(0, 40);
      if (!name) return send(res, 400, { error: 'Name is required' });
      if (results.length >= MAX_ROWS) return send(res, 507, { error: 'Results list is full' });
      const puzzle = clamp(d.puzzle, MAX_PUZZLE), sort = clamp(d.sort, MAX_SORT);
      results.push({
        id: crypto.randomBytes(5).toString('hex'), name, puzzle, sort, total: puzzle + sort,
        seconds: clamp(d.seconds, 36000), at: new Date().toISOString()
      });
      save();
      send(res, 201, { ok: true });
    });
    return;
  }

  if (url.pathname === '/api/results' && (req.method === 'GET' || req.method === 'DELETE')) {
    if (!keyOk(url.searchParams.get('key'))) return send(res, 403, { error: 'Wrong key' });
    if (req.method === 'DELETE') { results = []; save(); return send(res, 200, { ok: true }); }
    return send(res, 200, { max: MAX_PUZZLE + MAX_SORT, results });
  }

  send(res, 404, 'Not found', 'text/plain; charset=utf-8');
}).listen(PORT, () => {
  console.log('Bell to Bell is running on port ' + PORT);
  console.log('Game for students:  /');
  console.log('Results for teacher: /results?key=' + KEY + (process.env.TEACHER_KEY ? '' : '   (random key: set TEACHER_KEY to keep it fixed)'));
});
