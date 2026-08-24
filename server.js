// 记账高手 · 同步后端 (Node 内置模块，无需安装依赖)
// 运行: node server.js  (默认端口 3000, 可用 PORT 环境变量覆盖)
const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const crypto = require('crypto');

const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');
const DATA = path.join(ROOT, 'data');
const SEED_PATH = path.join(ROOT, 'seed.json');
const PORT = process.env.PORT || 3000;

fs.mkdirSync(DATA, { recursive: true });

// 默认账本种子（首次创建房间时写入，含历史账单）
let SEED = { openingBalance: 0, transactions: [], categories: { income: [], expense: [] }, fixedCats: [], settings: { defaultPayer: '老婆', theme: 'light' } };
try { SEED = JSON.parse(fs.readFileSync(SEED_PATH, 'utf-8')); } catch (e) { console.warn('未找到 seed.json，使用空账本'); }
// 给历史交易补上 id 与 updatedAt，便于合并时按 id 去重
SEED.transactions = (SEED.transactions || []).map((t, i) => ({ ...t, id: t.id || ('seed_' + i + '_' + t.date), updatedAt: t.updatedAt || Date.parse(t.date + 'T12:00:00') || Date.now() }));
SEED.version = 1;

function roomFile(room) {
  // 只允许安全字符，防止路径穿越
  const safe = String(room || '').replace(/[^a-zA-Z0-9_\-]/g, '').slice(0, 40);
  if (!safe) return null;
  return path.join(DATA, safe + '.json');
}
function loadRoom(room) {
  const f = roomFile(room);
  if (!f) return null;
  try { return JSON.parse(fs.readFileSync(f, 'utf-8')); } catch (e) { return null; }
}
function saveRoom(room, obj) {
  const f = roomFile(room);
  if (!f) return;
  const tmp = f + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2));
  fs.renameSync(tmp, f);
}
function uniq(a) { return [...new Set(a || [])]; }
// 密码：仅存哈希，绝不存明文；空密码视为未上锁
function hashPw(pw) { return pw ? crypto.createHash('sha256').update(String(pw)).digest('hex') : null; }
function authOk(st, pwHeader) { if (!st || !st.pwHash) return true; return hashPw(pwHeader) === st.pwHash; }
function send401(res) { res.writeHead(401, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'unauthorized', locked: true })); }
// 合并两份账本：交易按 id 取较新(updatedAt 大)的；分类/固定项取并集；期初取较大值
function mergeState(a, b) {
  a = a || {}; b = b || {};
  const map = {};
  (a.transactions || []).forEach(t => { map[t.id] = t; });
  (b.transactions || []).forEach(t => { const ex = map[t.id]; if (!ex || (t.updatedAt || 0) > (ex.updatedAt || 0)) map[t.id] = t; });
  const transactions = Object.values(map);
  return {
    openingBalance: Math.max(a.openingBalance || 0, b.openingBalance || 0),
    transactions,
    categories: {
      income: uniq([...(a.categories?.income || []), ...(b.categories?.income || [])]),
      expense: uniq([...(a.categories?.expense || []), ...(b.categories?.expense || [])])
    },
    fixedCats: uniq([...(a.fixedCats || []), ...(b.fixedCats || [])]),
    settings: ((b.version || 0) >= (a.version || 0)) ? (b.settings || a.settings) : (a.settings || b.settings),
    version: ((a.version || 0) + (b.version || 0)),
    pwHash: b.pwHash || a.pwHash || null   // 密码哈希由服务端权威保存，合并时不可丢失
  };
}

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };

function serveStatic(req, res, pathname) {
  let fp = path.join(PUBLIC, pathname === '/' ? 'index.html' : pathname);
  // 防穿越
  if (!fp.startsWith(PUBLIC)) { res.writeHead(403); return res.end('forbidden'); }
  fs.readFile(fp, (err, data) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || 'application/octet-stream' });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  const u = url.parse(req.url, true);
  const pathname = u.pathname;
  // API: 同步账本
  if (pathname === '/api/ledger') {
    const room = u.query.room;
    if (!room) { res.writeHead(400, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ error: 'room required' })); }
    if (req.method === 'GET') {
      let st = loadRoom(room);
      if (!st) { st = JSON.parse(JSON.stringify(SEED)); st.version = 1; saveRoom(room, st); }
      if (!authOk(st, req.headers['x-pw'])) return send401(res);
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      return res.end(JSON.stringify(st));
    }
    if (req.method === 'DELETE') {
      const f = roomFile(room);
      const cur = loadRoom(room);
      if (cur && !authOk(cur, req.headers['x-pw'])) return send401(res);
      if (f) { try { fs.unlinkSync(f); } catch (e) {} }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ ok: true }));
    }
    if (req.method === 'POST') {
      let body = '';
      req.on('data', c => { body += c; if (body.length > 5e6) req.destroy(); });
      req.on('end', () => {
        let incoming;
        try { incoming = JSON.parse(body); } catch (e) { res.writeHead(400); return res.end('bad json'); }
        let cur = loadRoom(room);
        if (!cur) cur = JSON.parse(JSON.stringify(SEED));
        if (!authOk(cur, req.headers['x-pw'])) return send401(res);
        const merged = mergeState(cur, incoming);
        saveRoom(room, merged);
        res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify(merged));
      });
      return;
    }
    res.writeHead(405); return res.end('method not allowed');
  }
  // API: 设置 / 修改 / 取消 账本密码
  if (pathname === '/api/password') {
    const room = u.query.room;
    if (!room) { res.writeHead(400, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ error: 'room required' })); }
    if (req.method === 'POST') {
      let body = '';
      req.on('data', c => { body += c; if (body.length > 1e5) req.destroy(); });
      req.on('end', () => {
        let inc;
        try { inc = JSON.parse(body); } catch (e) { res.writeHead(400); return res.end('bad json'); }
        let cur = loadRoom(room);
        if (!cur) cur = JSON.parse(JSON.stringify(SEED));
        if (cur.pwHash && hashPw(inc.oldPassword) !== cur.pwHash) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'old password wrong' }));
        }
        cur.pwHash = (inc.newPassword && String(inc.newPassword).length > 0) ? hashPw(inc.newPassword) : null;
        saveRoom(room, cur);
        res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        return res.end(JSON.stringify({ ok: true, locked: !!cur.pwHash }));
      });
      return;
    }
    res.writeHead(405); return res.end('method not allowed');
  }
  // 静态资源
  serveStatic(req, res, pathname);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('记账高手同步服务已启动: http://localhost:' + PORT);
});
