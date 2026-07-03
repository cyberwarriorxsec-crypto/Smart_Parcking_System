// XPark Server (Simplified) — run with: node server.js
const express     = require('express');
const session     = require('express-session');
const bcrypt      = require('bcryptjs');
const cors        = require('cors');
const axios       = require('axios');

const app = express();

// ── CONFIG — edit these ──────────────────────────────────
const ESP32_IP        = 'http://192.168.43.58';   // ← replace with your ESP32 IP
const ESP32_TOKEN     = 'XParkToken2026';
const PORT             = 3000;
const SESSION_SECRET   = 'xpark_secret_2026';

// Admin login — change these!
const ADMIN_USERNAME       = 'admin';
const ADMIN_PASSWORD_HASH  = bcrypt.hashSync('admin123', 10); // ← change 'admin123'

// ── Team members — edit names/roles here ────────────────
const TEAM_MEMBERS = [
  { name: 'RUPAM_DHALI',  role: 'Project Lead &  ESP32 Programming ',  avatar: 'RD' },
  { name: 'GOUTAM PRADHAN',   role: 'Hardware & Wiring',        avatar: 'MT' },
  { name: 'SOHOM GHOSH', role: 'Parts & Materials Manager',     avatar: 'MH'  },
  { name: 'CHITTARANJAN SARDAR', role: 'Frontend & Dashboard',     avatar: 'MH' },
  { name: 'PRIYANKO MAJUMDER',  role: 'Project Documentation Manager',  avatar: 'MF' },
];

// ── In-memory state (no database) ────────────────────────
let esp32State = { available: 4, occupied: 0, total: 4, gate: 'Closed', locked: false, activity: '', occupied_slots: [] };
let prevActivity = '';

// Keep the most recent 100 activity events in memory
const activityLog = [];
function addLog(event, slot, extra) {
  activityLog.unshift({ id: activityLog.length + 1, event, slot: slot || null, timestamp: new Date().toISOString(), extra: extra || '' });
  if (activityLog.length > 100) activityLog.pop();
}

// Simple per-slot usage counters (resets on server restart)
const slotStats = {};
for (let i = 1; i <= 4; i++) slotStats[i] = { slot: i, total_uses: 0, last_entry: null };

// ── Middleware ────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 8 * 60 * 60 * 1000 } // 8 hours
}));

function requireLogin(req, res, next) {
  if (req.session && req.session.userId) return next();
  res.redirect('/login');
}

// ── ESP32 polling ─────────────────────────────────────────
async function pollESP32() {
  try {
    const r = await axios.get(`${ESP32_IP}/data`, { timeout: 3000 });
    esp32State = r.data;

    if (esp32State.activity && esp32State.activity !== prevActivity) {
      prevActivity  = esp32State.activity;
      const isEntry = esp32State.activity.includes('entered');
      const isExit  = esp32State.activity.includes('exited');

      if (isEntry || isExit) {
        addLog(esp32State.activity, esp32State.occupied, JSON.stringify(esp32State));
        if (isEntry && slotStats[esp32State.occupied]) {
          slotStats[esp32State.occupied].total_uses++;
          slotStats[esp32State.occupied].last_entry = new Date().toISOString();
        }
      }
    }
  } catch (e) {
    console.warn('[Poll] ESP32 unreachable');
  }
}
setInterval(pollESP32, 2500);

// ── Routes ────────────────────────────────────────────────

// Public page — no login, available slots only, no controls
app.get('/', (req, res) => res.send(publicHTML()));

// Public status feed (safe subset — no gate/lock/admin details)
app.get('/api/public-status', (req, res) => {
  res.json({
    available: esp32State.available,
    total: esp32State.total,
    occupied_slots: esp32State.occupied_slots || []
  });
});

// Login
app.get('/login', (req, res) => {
  if (req.session.userId) return res.redirect('/dashboard');
  res.send(loginHTML());
});

app.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (username === ADMIN_USERNAME && bcrypt.compareSync(password || '', ADMIN_PASSWORD_HASH)) {
    req.session.userId   = 1;
    req.session.username = username;
    addLog('Admin login', null, username);
    return res.redirect('/dashboard');
  }
  res.send(loginHTML('Invalid username or password'));
});

app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/login');
});

// Dashboard (admin only)
app.get('/dashboard', requireLogin, (req, res) => res.send(dashboardHTML(req.session.username)));

// API endpoints (admin only)
app.get('/api/status', requireLogin, (req, res) => res.json(esp32State));

app.get('/api/logs', requireLogin, (req, res) => res.json(activityLog));

app.get('/api/stats', requireLogin, (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const todayCount = activityLog.filter(r => r.event === 'Car entered' && r.timestamp.slice(0, 10) === today).length;
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const weekCount = activityLog.filter(r => r.event === 'Car entered' && new Date(r.timestamp).getTime() >= weekAgo).length;
  res.json({ todayCount, weekCount, slotStats: Object.values(slotStats).sort((a, b) => a.slot - b.slot) });
});

// Admin proxy to ESP32
async function proxyToESP(endpoint, req, res) {
  try {
    const r = await axios.get(`${ESP32_IP}${endpoint}`, {
      headers: { 'X-Auth-Token': ESP32_TOKEN },
      timeout: 4000
    });
    addLog(`Admin: ${endpoint}`, null, req.session.username);
    res.json(r.data);
  } catch (e) {
    res.status(502).json({ error: 'ESP32 unreachable' });
  }
}

app.post('/api/admin/gate/open',   requireLogin, (req, res) => proxyToESP('/admin/gate/open',   req, res));
app.post('/api/admin/gate/close',  requireLogin, (req, res) => proxyToESP('/admin/gate/close',  req, res));
app.post('/api/admin/lock',        requireLogin, (req, res) => proxyToESP('/admin/lock',         req, res));
app.post('/api/admin/unlock',      requireLogin, (req, res) => proxyToESP('/admin/unlock',       req, res));
app.post('/api/admin/slot/add',    requireLogin, (req, res) => proxyToESP('/admin/slot/add',     req, res));
app.post('/api/admin/slot/remove', requireLogin, (req, res) => proxyToESP('/admin/slot/remove',  req, res));
app.post('/api/admin/reset',       requireLogin, (req, res) => proxyToESP('/admin/reset',        req, res));

app.listen(PORT, () => {
  console.log(`XPark running → http://localhost:${PORT}`);
  console.log(`Public view   → http://localhost:${PORT}/`);
  console.log(`Admin login   → http://localhost:${PORT}/login  (user: ${ADMIN_USERNAME})`);
});

// ── HTML: Public page (no login, view-only) ──────────────
function publicHTML() {
  return `<!DOCTYPE html><html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>XPark — Live Availability</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Sans:wght@400;500;600;700&family=DM+Mono:wght@400;500&display=swap');
*{box-sizing:border-box;margin:0;padding:0}
:root{
  --bg:#080c14;--s:rgba(255,255,255,0.03);--b:rgba(255,255,255,0.08);
  --t:#e8eaf0;--m:#6b7280;
  --green:#00c896;--red:#ef4444;--blue:#0078ff;
  --grad:linear-gradient(135deg,#00c896,#0078ff);
}
body{font-family:'DM Sans',sans-serif;background:var(--bg);color:var(--t);
     min-height:100vh;padding:16px;position:relative}
body::before{content:'';position:fixed;width:500px;height:500px;border-radius:50%;
  background:radial-gradient(circle,rgba(0,200,150,0.04),transparent 70%);
  top:-150px;left:-150px;pointer-events:none}
.header{display:flex;align-items:center;justify-content:space-between;
        margin-bottom:20px;padding-bottom:14px;border-bottom:1px solid var(--b);
        max-width:520px;margin-left:auto;margin-right:auto}
.logo{font-family:'Syne',sans-serif;font-size:1.4rem;font-weight:800;
      background:var(--grad);-webkit-background-clip:text;
      -webkit-text-fill-color:transparent;background-clip:text;letter-spacing:-0.5px}
.dot{width:7px;height:7px;background:var(--green);border-radius:50%;
     display:inline-block;margin-right:5px;
     box-shadow:0 0 6px var(--green);animation:pulse 2s infinite}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}
.clock{font-family:'DM Mono',monospace;font-size:0.7rem;color:var(--m)}
.wrap{max-width:520px;margin:0 auto}
.card{background:var(--s);border:1px solid var(--b);border-radius:16px;padding:14px 16px}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px}
.card-label{font-size:.6rem;color:var(--m);text-transform:uppercase;
            letter-spacing:.1em;margin-bottom:6px}
.card-value{font-size:2.2rem;font-weight:700;font-family:'DM Mono',monospace;line-height:1}
.green{color:var(--green)}.red{color:var(--red)}
.sec-title{font-size:.6rem;color:var(--m);text-transform:uppercase;
           letter-spacing:.1em;margin-bottom:12px}
.slots-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:10px}
.slot{border-radius:12px;padding:18px 6px;text-align:center;
      border:1px solid transparent;transition:.3s}
.slot.av{background:rgba(0,200,150,.07);border-color:rgba(0,200,150,.2)}
.slot.oc{background:rgba(239,68,68,.07);border-color:rgba(239,68,68,.2)}
.slot-n{font-family:'DM Mono',monospace;font-size:1rem;font-weight:600}
.slot.av .slot-n{color:var(--green)}.slot.oc .slot-n{color:var(--red)}
.slot-u{font-size:.6rem;color:var(--m);margin-top:4px;text-transform:uppercase;letter-spacing:.05em}
.footer-link{display:block;text-align:center;margin-top:24px;font-size:.7rem;color:var(--m);
             text-decoration:none;border:1px solid var(--b);border-radius:8px;padding:8px;
             transition:.15s}
.footer-link:hover{color:var(--t);border-color:rgba(255,255,255,.2)}
</style></head><body>
<div class="wrap">
  <div class="header">
    <div class="logo"><span class="dot"></span>XPark</div>
    <span class="clock" id="clock">--:--:--</span>
  </div>

  <div class="grid2">
    <div class="card"><div class="card-label">Available</div><div class="card-value green" id="av">—</div></div>
    <div class="card"><div class="card-label">Capacity</div><div class="card-value blue" id="tot">—</div></div>
  </div>

  <div class="card">
    <div class="sec-title">⬡ Slot Status — Live</div>
    <div class="slots-grid" id="slots"></div>
  </div>

  <a class="footer-link" href="/login">Admin sign in →</a>
</div>

<script>
  async function refresh() {
    try {
      const data = await (await fetch('/api/public-status')).json();
      document.getElementById('av').textContent  = data.available;
      document.getElementById('tot').textContent = data.total;

      let html = '';
      for (let i = 1; i <= data.total; i++) {
        const occ = data.occupied_slots && data.occupied_slots.includes(i);
        html += '<div class="slot '+(occ?'oc':'av')+'">' +
                '<div class="slot-n">P'+i+'</div>' +
                '<div class="slot-u">'+(occ?'Occupied':'Available')+'</div></div>';
      }
      document.getElementById('slots').innerHTML = html;
    } catch(e) {}
  }

  setInterval(() => {
    document.getElementById('clock').textContent =
      new Date().toLocaleTimeString('en-US', { hour12: false });
  }, 1000);

  setInterval(refresh, 2500);
  window.onload = refresh;
</script>
</body></html>`;
}

// ── HTML: Login page ──────────────────────────────────────
function loginHTML(error = '') {
  return `<!DOCTYPE html><html><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>ParkAdmin — Login</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Sans:wght@400;500;600&display=swap');
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'DM Sans',sans-serif;background:#080c14;color:#e8eaf0;
     min-height:100vh;display:flex;align-items:center;justify-content:center;
     padding:20px;position:relative;overflow:hidden}
.bg-glow{position:fixed;width:400px;height:400px;border-radius:50%;
         background:radial-gradient(circle,rgba(0,200,150,0.08),transparent 70%);
         top:-100px;left:-100px;animation:drift 8s ease-in-out infinite alternate}
.bg-glow2{position:fixed;width:300px;height:300px;border-radius:50%;
          background:radial-gradient(circle,rgba(0,120,255,0.06),transparent 70%);
          bottom:-80px;right:-80px;animation:drift 6s ease-in-out infinite alternate-reverse}
@keyframes drift{0%{transform:translate(0,0)}100%{transform:translate(40px,40px)}}
.card{background:rgba(255,255,255,0.03);backdrop-filter:blur(20px);
      border:1px solid rgba(255,255,255,0.08);border-radius:24px;
      padding:40px 32px;width:100%;max-width:380px;position:relative;z-index:1}
.logo{font-family:'Syne',sans-serif;font-size:2rem;font-weight:800;
      background:linear-gradient(135deg,#00c896,#0078ff);
      -webkit-background-clip:text;-webkit-text-fill-color:transparent;
      background-clip:text;letter-spacing:-1px;margin-bottom:4px}
.tagline{font-size:0.72rem;color:#4b5563;margin-bottom:32px;
         letter-spacing:.06em;text-transform:uppercase}
label{display:block;font-size:0.68rem;color:#6b7280;text-transform:uppercase;
      letter-spacing:.08em;margin-bottom:6px;margin-top:16px}
input{width:100%;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);
      border-radius:12px;padding:13px 16px;color:#e8eaf0;font-size:0.9rem;
      font-family:'DM Sans',sans-serif;outline:none;transition:.2s}
input:focus{border-color:#00c896;background:rgba(0,200,150,0.05)}
.btn-login{width:100%;margin-top:24px;background:linear-gradient(135deg,#00c896,#0078ff);
           color:#fff;border:none;border-radius:12px;padding:14px;
           font-size:0.9rem;font-weight:600;cursor:pointer;
           font-family:'DM Sans',sans-serif;letter-spacing:.02em;transition:.2s}
.btn-login:hover{opacity:.9;transform:translateY(-1px)}
.btn-login:active{transform:translateY(0)}
.err{background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.25);
     border-radius:10px;padding:10px 14px;font-size:0.8rem;color:#ef4444;margin-bottom:8px}
.lock-icon{font-size:1.5rem;margin-bottom:12px}
.back-link{display:block;text-align:center;margin-top:16px;font-size:.72rem;color:#6b7280;text-decoration:none}
.back-link:hover{color:#e8eaf0}
</style></head><body>
<div class="bg-glow"></div><div class="bg-glow2"></div>
<div class="card">
  <div class="lock-icon">⬡</div>
  <div class="logo">XPark</div>
  <div class="tagline">Admin Control Panel</div>
  ${error ? `<div class="err">⚠ ${error}</div>` : ''}
  <form method="POST" action="/login">
    <label>Username</label>
    <input name="username" type="text" placeholder="Enter username" autocomplete="username" required>
    <label>Password</label>
    <input name="password" type="password" placeholder="Enter password" autocomplete="current-password" required>
    <button class="btn-login" type="submit">Sign In →</button>
  </form>
  <a class="back-link" href="/">← Back to public view</a>
</div></body></html>`;
}

// ── HTML: Dashboard ───────────────────────────────────────
function dashboardHTML(adminName) {
  const membersHTML = TEAM_MEMBERS.map((m, i) => `
    <div class="member-card" style="animation-delay:${i * 0.1}s">
      <div class="avatar">${m.avatar}</div>
      <div class="member-info">
        <div class="member-name">${m.name}</div>
        <div class="member-role">${m.role}</div>
      </div>
    </div>`).join('');

  return `<!DOCTYPE html><html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>XPark Dashboard</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Sans:wght@400;500;600;700&family=DM+Mono:wght@400;500&display=swap');
*{box-sizing:border-box;margin:0;padding:0}
:root{
  --bg:#080c14;--s:rgba(255,255,255,0.03);--b:rgba(255,255,255,0.08);
  --t:#e8eaf0;--m:#6b7280;
  --green:#00c896;--red:#ef4444;--amber:#f59e0b;--blue:#0078ff;
  --grad:linear-gradient(135deg,#00c896,#0078ff);
}
body{font-family:'DM Sans',sans-serif;background:var(--bg);color:var(--t);
     min-height:100vh;padding:16px;position:relative}
body::before{content:'';position:fixed;width:500px;height:500px;border-radius:50%;
  background:radial-gradient(circle,rgba(0,200,150,0.04),transparent 70%);
  top:-150px;left:-150px;pointer-events:none}
.header{display:flex;align-items:center;justify-content:space-between;
        margin-bottom:20px;padding-bottom:14px;border-bottom:1px solid var(--b)}
.logo{font-family:'Syne',sans-serif;font-size:1.4rem;font-weight:800;
      background:var(--grad);-webkit-background-clip:text;
      -webkit-text-fill-color:transparent;background-clip:text;letter-spacing:-0.5px}
.header-right{display:flex;align-items:center;gap:10px}
.admin-badge{font-size:0.68rem;color:var(--m);background:var(--s);
             border:1px solid var(--b);border-radius:8px;padding:4px 10px}
.admin-badge span{color:var(--green)}
a.logout{font-size:0.72rem;color:var(--red);text-decoration:none;
         border:1px solid rgba(239,68,68,.25);border-radius:8px;padding:4px 10px;transition:.15s}
a.logout:hover{background:rgba(239,68,68,.1)}
.clock{font-family:'DM Mono',monospace;font-size:0.7rem;color:var(--m)}
.dot{width:7px;height:7px;background:var(--green);border-radius:50%;
     display:inline-block;margin-right:5px;
     box-shadow:0 0 6px var(--green);animation:pulse 2s infinite}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}
.lock-banner{background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.2);
             border-radius:12px;padding:10px 16px;font-size:.78rem;color:var(--red);
             text-align:center;margin-bottom:14px;display:none}
.lock-banner.on{display:block}
.grid3{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:12px}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px}
.card{background:var(--s);border:1px solid var(--b);border-radius:16px;padding:14px 16px}
.card-label{font-size:.6rem;color:var(--m);text-transform:uppercase;
            letter-spacing:.1em;margin-bottom:6px}
.card-value{font-size:2rem;font-weight:700;font-family:'DM Mono',monospace;line-height:1}
.green{color:var(--green)}.red{color:var(--red)}.blue{color:var(--blue)}.amber{color:var(--amber)}
.gate-row{display:flex;align-items:center;justify-content:space-between}
.gate-dot{width:10px;height:10px;border-radius:50%;transition:.3s}
.gate-dot.open{background:var(--green);box-shadow:0 0 8px var(--green)}
.gate-dot.closed{background:var(--red);box-shadow:0 0 8px var(--red)}
.slots-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:10px}
.slot{border-radius:12px;padding:14px 6px;text-align:center;
      border:1px solid transparent;transition:.3s}
.slot.av{background:rgba(0,200,150,.07);border-color:rgba(0,200,150,.2)}
.slot.oc{background:rgba(239,68,68,.07);border-color:rgba(239,68,68,.2)}
.slot-n{font-family:'DM Mono',monospace;font-size:.9rem;font-weight:600}
.slot.av .slot-n{color:var(--green)}.slot.oc .slot-n{color:var(--red)}
.slot-u{font-size:.55rem;color:var(--m);margin-top:3px;text-transform:uppercase;letter-spacing:.05em}
.tabs{display:flex;gap:6px;margin-bottom:12px;flex-wrap:wrap}
.tab{padding:7px 14px;border-radius:8px;font-size:.73rem;font-weight:600;
     cursor:pointer;border:1px solid var(--b);background:transparent;
     color:var(--m);transition:.15s;font-family:'DM Sans',sans-serif}
.tab.active{background:var(--grad);color:#fff;border-color:transparent}
.tab:hover:not(.active){color:var(--t)}
.sec-title{font-size:.6rem;color:var(--m);text-transform:uppercase;
           letter-spacing:.1em;margin-bottom:12px}
.btn-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px}
.btn{border:none;border-radius:10px;padding:12px 8px;font-family:'DM Sans',sans-serif;
     font-size:.75rem;font-weight:600;cursor:pointer;transition:.15s;
     display:flex;align-items:center;justify-content:center;gap:5px}
.btn:active{transform:scale(.96)}
.btn.full{grid-column:span 2}
.bg{background:rgba(0,200,150,.12);color:var(--green);border:1px solid rgba(0,200,150,.25)}
.br{background:rgba(239,68,68,.12);color:var(--red);border:1px solid rgba(239,68,68,.25)}
.bb{background:rgba(0,120,255,.12);color:var(--blue);border:1px solid rgba(0,120,255,.25)}
.ba{background:rgba(245,158,11,.12);color:var(--amber);border:1px solid rgba(245,158,11,.25)}
.bv{background:linear-gradient(135deg,rgba(0,200,150,.15),rgba(0,120,255,.15));
    color:#fff;border:1px solid rgba(255,255,255,.1)}
.btn:hover{filter:brightness(1.15)}
.tbl-wrap{overflow-x:auto;margin-top:10px}
table{width:100%;border-collapse:collapse;font-size:.73rem}
th{color:var(--m);text-align:left;padding:7px 10px;font-weight:500;
   border-bottom:1px solid var(--b);text-transform:uppercase;font-size:.6rem;letter-spacing:.06em}
td{padding:8px 10px;border-bottom:1px solid rgba(255,255,255,0.04);
   font-family:'DM Mono',monospace;font-size:.7rem}
tr:last-child td{border:none}
.badge{display:inline-block;padding:2px 8px;border-radius:5px;font-size:.62rem;font-weight:600}
.badge.entry{background:rgba(0,200,150,.15);color:var(--green)}
.badge.exit {background:rgba(239,68,68,.15);color:var(--red)}
.badge.adm  {background:rgba(0,120,255,.15);color:var(--blue)}
.bar-row{display:flex;align-items:center;gap:8px;margin-bottom:10px}
.bar-label{font-size:.68rem;color:var(--m);width:46px;text-align:right;flex-shrink:0}
.bar-track{flex:1;background:rgba(255,255,255,.06);border-radius:4px;height:8px;overflow:hidden}
.bar-fill{height:100%;border-radius:4px;background:var(--grad);transition:width .6s ease}
.bar-count{font-size:.68rem;font-family:'DM Mono',monospace;width:22px;color:var(--t)}
.members-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px}
.member-card{background:rgba(255,255,255,.02);border:1px solid var(--b);
             border-radius:12px;padding:12px;display:flex;align-items:center;gap:12px;
             animation:fadeUp .4s ease both}
@keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
.avatar{width:40px;height:40px;border-radius:10px;
        background:var(--grad);display:flex;align-items:center;justify-content:center;
        font-size:.8rem;font-weight:700;color:#fff;flex-shrink:0;font-family:'Syne',sans-serif}
.member-name{font-size:.82rem;font-weight:600;color:var(--t)}
.member-role{font-size:.65rem;color:var(--m);margin-top:2px}
.project-card{background:linear-gradient(135deg,rgba(0,200,150,.07),rgba(0,120,255,.07));
              border:1px solid rgba(0,200,150,.15);border-radius:16px;
              padding:16px;margin-bottom:12px;display:flex;align-items:center;gap:16px}
.project-logo{font-family:'Syne',sans-serif;font-size:2.5rem;font-weight:800;
              background:var(--grad);-webkit-background-clip:text;
              -webkit-text-fill-color:transparent;background-clip:text;line-height:1}
.project-title{font-size:1rem;font-weight:700;color:var(--t)}
.project-sub{font-size:.7rem;color:var(--m);margin-top:3px}
.project-tag{display:inline-block;background:rgba(0,200,150,.15);color:var(--green);
             font-size:.6rem;border-radius:5px;padding:2px 8px;margin-top:6px;
             font-weight:600;letter-spacing:.04em}
.toast{position:fixed;bottom:16px;left:50%;transform:translateX(-50%) translateY(70px);
       background:rgba(20,25,40,.95);border:1px solid var(--b);border-radius:10px;
       padding:10px 20px;font-size:.78rem;transition:transform .3s;z-index:99;
       white-space:nowrap;backdrop-filter:blur(10px)}
.toast.show{transform:translateX(-50%) translateY(0)}
</style></head><body>

<div class="header">
  <div class="logo"><span class="dot"></span>XPark</div>
  <div class="header-right">
    <span class="clock" id="clock">--:--:--</span>
    <span class="admin-badge">Signed in as <span>${adminName}</span></span>
    <a class="logout" href="/logout">Sign out</a>
  </div>
</div>

<div id="lock-banner" class="lock-banner">⚠ System Locked — All sensors disabled</div>

<div class="project-card">
  <div class="project-logo">X</div>
  <div>
    <div class="project-title">XPark Smart Parking System</div>
    <div class="project-sub">IoT-based real-time parking management with ESP32</div>
    <span class="project-tag">⬡ LIVE SYSTEM</span>
  </div>
</div>

<div class="grid3">
  <div class="card"><div class="card-label">Available</div><div class="card-value green" id="av">—</div></div>
  <div class="card"><div class="card-label">Occupied</div><div class="card-value red"   id="oc">—</div></div>
  <div class="card"><div class="card-label">Capacity</div><div class="card-value blue"  id="tot">—</div></div>
</div>
<div class="grid2">
  <div class="card">
    <div class="card-label">Gate Status</div>
    <div class="gate-row">
      <div class="card-value" id="gate" style="font-size:1.3rem">—</div>
      <div class="gate-dot closed" id="gate-dot"></div>
    </div>
  </div>
  <div class="card"><div class="card-label">Today's Entries</div><div class="card-value amber" id="today">—</div></div>
</div>

<div class="card" style="margin-bottom:12px">
  <div class="sec-title">⬡ Slot Monitor — Real-time</div>
  <div class="slots-grid" id="slots"></div>
</div>

<div class="tabs">
  <button class="tab active" onclick="showTab('controls')">Controls</button>
  <button class="tab"        onclick="showTab('logs')">Activity Log</button>
  <button class="tab"        onclick="showTab('analytics')">Analytics</button>
  <button class="tab"        onclick="showTab('team')">Team</button>
</div>

<div id="tab-controls" class="card" style="margin-bottom:16px">
  <div class="sec-title">Admin Controls</div>
  <div class="btn-grid">
    <button class="btn bg" onclick="cmd('gate/open')">▲ Open Gate</button>
    <button class="btn br" onclick="cmd('gate/close')">▼ Close Gate</button>
    <button class="btn bb" onclick="cmd('slot/add')">＋ Add Slot</button>
    <button class="btn ba" onclick="cmd('slot/remove')">－ Remove Slot</button>
    <button class="btn bv full" onclick="cmd('reset')">↺ Reset All Slots</button>
    <button class="btn br full" id="lock-btn" onclick="toggleLock()">🔒 Lock System</button>
  </div>
</div>

<div id="tab-logs" class="card" style="display:none;margin-bottom:16px">
  <div class="sec-title">Activity Log</div>
  <div class="tbl-wrap">
    <table><thead><tr><th>#</th><th>Timestamp</th><th>Event</th><th>Slot</th></tr></thead>
    <tbody id="log-body"></tbody></table>
  </div>
</div>

<div id="tab-analytics" class="card" style="display:none;margin-bottom:16px">
  <div class="sec-title">Slot Usage — All Time</div>
  <div id="slot-bars"></div>
  <div style="margin-top:16px" class="sec-title">This Week</div>
  <div class="card-value green" id="week-count"
       style="font-size:2rem;font-family:'DM Mono',monospace">—</div>
  <div style="font-size:.68rem;color:var(--m);margin-top:4px">total entries</div>
</div>

<div id="tab-team" class="card" style="display:none;margin-bottom:16px">
  <div class="sec-title">⬡ Project Team</div>
  <div class="members-grid">${membersHTML}</div>
  <div style="margin-top:16px;padding-top:14px;border-top:1px solid var(--b);
              font-size:.68rem;color:var(--m);text-align:center">
    XPark — IoT Smart Parking System &nbsp;·&nbsp; Built with ESP32 &amp; Node.js
  </div>
</div>

<div class="toast" id="toast"></div>

<script>
  let isLocked = false;

  function showTab(name) {
    ['controls','logs','analytics','team'].forEach(t => {
      document.getElementById('tab-'+t).style.display = t===name?'block':'none';
    });
    document.querySelectorAll('.tab').forEach((b,i) => {
      b.classList.toggle('active',['controls','logs','analytics','team'][i]===name);
    });
    if (name==='logs')      loadLogs();
    if (name==='analytics') loadStats();
  }

  function showToast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 2200);
  }

  async function cmd(endpoint) {
    try {
      const res = await fetch('/api/admin/'+endpoint, { method: 'POST' });
      const d   = await res.json();
      showToast('✓ ' + (d.status || 'done').replace(/_/g,' '));
      await refresh();
    } catch(e) { showToast('✗ Request failed'); }
  }

  async function toggleLock() { await cmd(isLocked ? 'unlock' : 'lock'); }

  async function refresh() {
    try {
      const data = await (await fetch('/api/status')).json();
      document.getElementById('av').textContent  = data.available;
      document.getElementById('oc').textContent  = data.occupied;
      document.getElementById('tot').textContent = data.total;

      const gEl  = document.getElementById('gate');
      const gDot = document.getElementById('gate-dot');
      gEl.textContent = data.gate;
      gEl.className   = 'card-value ' + (data.gate==='Open' ? 'green' : 'red');
      gDot.className  = 'gate-dot '   + (data.gate==='Open' ? 'open'  : 'closed');

      isLocked = data.locked;
      document.getElementById('lock-banner').className = 'lock-banner' + (isLocked ? ' on' : '');
      const lb = document.getElementById('lock-btn');
      lb.textContent = isLocked ? '🔓 Unlock System' : '🔒 Lock System';
      lb.className   = 'btn full ' + (isLocked ? 'bg' : 'br');

      let html = '';
      for (let i = 1; i <= data.total; i++) {
        const occ = data.occupied_slots && data.occupied_slots.includes(i);
        html += '<div class="slot '+(occ?'oc':'av')+'">' +
                '<div class="slot-n">P'+i+'</div>' +
                '<div class="slot-u">'+(occ?'Occupied':'Available')+'</div></div>';
      }
      document.getElementById('slots').innerHTML = html;
    } catch(e) {}
  }

  async function loadLogs() {
    const rows = await (await fetch('/api/logs')).json();
    const cls  = e => e.includes('entered') ? 'entry' : e.includes('exited') ? 'exit' : 'adm';
    document.getElementById('log-body').innerHTML = rows.map((r, i) =>
      '<tr><td>'+(i+1)+'</td><td>'+r.timestamp+'</td>' +
      '<td><span class="badge '+cls(r.event)+'">'+r.event+'</span></td>' +
      '<td>'+(r.slot||'—')+'</td></tr>'
    ).join('') || '<tr><td colspan="4" style="color:var(--m);text-align:center">No logs yet</td></tr>';
  }

  async function loadStats() {
    const data = await (await fetch('/api/stats')).json();
    document.getElementById('today').textContent      = data.todayCount;
    document.getElementById('week-count').textContent = data.weekCount;
    const max = Math.max(...data.slotStats.map(s => s.total_uses), 1);
    document.getElementById('slot-bars').innerHTML = data.slotStats.map(s =>
      '<div class="bar-row">' +
      '<span class="bar-label">P'+s.slot+'</span>' +
      '<div class="bar-track"><div class="bar-fill" style="width:'+
      Math.round(s.total_uses / max * 100)+'%"></div></div>' +
      '<span class="bar-count">'+s.total_uses+'</span></div>'
    ).join('');
  }

  setInterval(() => {
    document.getElementById('clock').textContent =
      new Date().toLocaleTimeString('en-US', { hour12: false });
  }, 1000);

  setInterval(refresh, 2500);
  window.onload = refresh;
</script>
</body></html>`;
}
