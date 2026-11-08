/* ============================================================
   CLUTCHLAB — dashboard.js
   ============================================================ */
'use strict';

// ═══════════════════════════════════════════════════════════════
// 1. CONSTANTES Y ESTADO
// ═══════════════════════════════════════════════════════════════
const API_BASE = 'http://localhost:8000';
const TOKEN_KEY = 'clutchlab_token';
const USER_KEY = 'clutchlab_user';
const LOGIN_URL = '/index.html';

const state = {
  allAnalyses: [],
  latestPlan: null,
  currentAnalysisId: null,
  currentSessionId: null,
  selectedDuration: 30,
};

// ═══════════════════════════════════════════════════════════════
// 2. SESIÓN
// ═══════════════════════════════════════════════════════════════
const token = localStorage.getItem(TOKEN_KEY);
const userRaw = localStorage.getItem(USER_KEY);
if (!token || !userRaw) {
  window.location.href = LOGIN_URL;
  throw new Error('No autenticado');
}
const user = JSON.parse(userRaw);

// ═══════════════════════════════════════════════════════════════
// 3. HELPERS
// ═══════════════════════════════════════════════════════════════
function authFetch(path, options = {}) {
  return fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, ...(options.headers || {}) },
  });
}

function handleAuthError(res) {
  if (res.status === 401) {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    window.location.href = LOGIN_URL;
    return true;
  }
  return false;
}

function formatDate(iso) {
  const d = new Date(iso);
  const diff = Math.floor((new Date() - d) / 86400000);
  if (diff === 0) return 'hoy';
  if (diff === 1) return 'ayer';
  if (diff < 7) return `hace ${diff}d`;
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: 'short' });
}

function formatDateFull(iso) {
  return new Date(iso).toLocaleDateString('es-AR', {
    day: '2-digit', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function escapeHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ═══════════════════════════════════════════════════════════════
// 4. COLOR POR GRADIENTE
// ═══════════════════════════════════════════════════════════════
const R = [239, 68, 68], O = [255, 107, 0], G = [74, 222, 128];
const rgb = c => `rgb(${c[0]},${c[1]},${c[2]})`;

function lerp(a, b, t) {
  t = Math.max(0, Math.min(1, t));
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

function metricColor(v, red, orange, green) {
  if (v <= red) return rgb(R);
  if (v >= green) return rgb(G);
  if (v <= orange) return rgb(lerp(R, O, (v - red) / (orange - red)));
  return rgb(lerp(O, G, (v - orange) / (green - orange)));
}

function kdColor(k, d) {
  return metricColor(d === 0 ? k : k / d, 0.5, 1.0, 1.5);
}

const RANGES = {
  adr:    { red: 60, orange: 75, green: 90 },
  kast:   { red: 60, orange: 68, green: 75 },
  opening:{ red: 35, orange: 45, green: 55 },
  trade:  { red: 45, orange: 55, green: 65 },
  utility:{ red: 5,  orange: 8,  green: 12 },
};

// ═══════════════════════════════════════════════════════════════
// 5. MAPAS DE WORKSHOP
// ═══════════════════════════════════════════════════════════════
const WORKSHOP_MAPS = {
  'aim botz':         { id: '3070244462', name: 'Aim Botz', cat: 'Aim' },
  'aimbotz':          { id: '3070244462', name: 'Aim Botz', cat: 'Aim' },
  'fast warmup':      { id: '3083320026', name: 'Fast Warmup', cat: 'Aim' },
  'recoil master':    { id: '3100869952', name: 'Recoil Master', cat: 'Aim' },
  'csstats':          { id: '3070389038', name: 'CSStats Training', cat: 'Aim' },
  'aim_rush':         { id: '3105821815', name: 'Aim_Rush', cat: 'Aim' },
  'aim rush':         { id: '3105821815', name: 'Aim_Rush', cat: 'Aim' },

  'yprac':              { id: '3070715607', name: 'Yprac Hub', cat: 'Prefire' },
  'yprac hub':          { id: '3070715607', name: 'Yprac Hub', cat: 'Prefire' },
  'yprac prefire':      { id: '3070715607', name: 'Yprac Hub', cat: 'Prefire' },
  'mirage prefire':     { id: '3267302800', name: 'Mirage Prefire', cat: 'Prefire' },
  'inferno prefire':    { id: '3289507717', name: 'Inferno Prefire', cat: 'Prefire' },
  'dust2 prefire':      { id: '3295650711', name: 'Dust2 Prefire', cat: 'Prefire' },
  'ancient prefire':    { id: '3070715607', name: 'Yprac Hub (Ancient)', cat: 'Prefire' },
  'anubis prefire':     { id: '3070715607', name: 'Yprac Hub (Anubis)', cat: 'Prefire' },
  'nuke prefire':       { id: '3070715607', name: 'Yprac Hub (Nuke)', cat: 'Prefire' },
  'cache prefire':      { id: '3070715607', name: 'Yprac Hub (Cache)', cat: 'Prefire' },
  'overpass prefire':   { id: '3070715607', name: 'Yprac Hub (Overpass)', cat: 'Prefire' },
  'vertigo prefire':    { id: '3070715607', name: 'Yprac Hub (Vertigo)', cat: 'Prefire' },

  'utility':          { id: '3070715607', name: 'Yprac Utility', cat: 'Utilidad' },
  'utilidad':         { id: '3070715607', name: 'Yprac Utility', cat: 'Utilidad' },
  'instant smokes':   { id: '3070715607', name: 'Yprac Utility', cat: 'Utilidad' },

  'movement hub':     { id: '3355497176', name: 'Movement Hub', cat: 'Movimiento' },
  'bhop':             { id: '3118806244', name: 'Bhop (dunedash)', cat: 'Movimiento' },
  'surf':             { id: '3073875025', name: 'Surf (utopia)', cat: 'Movimiento' },
  'kz':               { id: '3179428851', name: 'KZ Maps', cat: 'Movimiento' },
};

function getWorkshopUrl(mapName) {
  if (!mapName) return null;
  const key = mapName.toLowerCase().trim();
  const e = WORKSHOP_MAPS[key];
  if (!e) return null;
  return {
    url: `https://steamcommunity.com/sharedfiles/filedetails/?id=${e.id}`,
    name: e.name,
  };
}

// ═══════════════════════════════════════════════════════════════
// 6. REFERENCIAS DEL DOM
// ═══════════════════════════════════════════════════════════════
const dom = {
  viewTitle:       document.getElementById('view-title'),
  viewSubtitle:    document.getElementById('view-subtitle'),
  sidebarUsername: document.getElementById('sidebar-username'),
  userAvatar:      document.getElementById('user-avatar'),
  btnLogout:       document.getElementById('btn-logout'),

  statTotalDemos: document.getElementById('stat-total-demos'),
  statAvgAdr:     document.getElementById('stat-avg-adr'),
  statAvgKast:    document.getElementById('stat-avg-kast'),
  statBestMap:    document.getElementById('stat-best-map'),
  listOverview:   document.getElementById('analyses-list-overview'),
  planActive:     document.getElementById('plan-active'),

  listFull:     document.getElementById('analyses-list-full'),
  planView:     document.getElementById('plan-view'),
  progressView: document.getElementById('progress-view'),
  preMatchView: document.getElementById('pre-match-view'),
  arsenalView:  document.getElementById('arsenal-view'),

  detailModal:  document.getElementById('analysis-modal'),
  modalClose:   document.getElementById('analysis-modal-close'),
  modalDelete:  document.getElementById('analysis-modal-delete'),
  modalMap:     document.getElementById('modal-map'),
  modalPlayer:  document.getElementById('modal-player'),
  modalDate:    document.getElementById('modal-date'),
  modalMetrics: document.getElementById('modal-metrics'),
  modalPlan:    document.getElementById('modal-plan'),

  playerSelector: document.getElementById('player-selector'),
  playerList:     document.getElementById('player-list'),
  playerCancel:   document.getElementById('player-selector-cancel'),
  durationBtns:   document.querySelectorAll('.duration-btn'),

  fileInput:      document.getElementById('demo-file-input'),
  btnNewAnalysis: document.getElementById('btn-new-analysis'),
};

// ═══════════════════════════════════════════════════════════════
// 7. SETUP UI
// ═══════════════════════════════════════════════════════════════
dom.sidebarUsername.textContent = '@' + user.username;
dom.userAvatar.textContent = user.username.charAt(0);

// ═══════════════════════════════════════════════════════════════
// 8. NAVEGACIÓN
// ═══════════════════════════════════════════════════════════════
const VIEW_META = {
  overview: { title: 'Overview',        subtitle: 'Tu progreso táctico en un solo lugar' },
  analyses: { title: 'Análisis',        subtitle: 'Historial completo de demos analizadas' },
  plan:     { title: 'Plan de hoy',     subtitle: 'Tu entrenamiento personalizado por IA' },
  progress: { title: 'Progreso',        subtitle: 'Evolución de tus métricas en el tiempo' },
  prematch: { title: 'Pre-Partida',     subtitle: 'Calentamiento recomendado según tus stats' },
  arsenal:  { title: 'Arsenal Táctico', subtitle: 'Mapas de Workshop seleccionados por categoría' },
};

function switchView(name) {
  document.querySelectorAll('.sidebar-link').forEach(l => l.classList.toggle('active', l.dataset.view === name));
  document.querySelectorAll('[data-view-content]').forEach(v => v.hidden = v.dataset.viewContent !== name);
  const m = VIEW_META[name] || VIEW_META.overview;
  dom.viewTitle.textContent = m.title;
  dom.viewSubtitle.textContent = m.subtitle;
}

document.querySelectorAll('.sidebar-link').forEach(l =>
  l.addEventListener('click', e => { e.preventDefault(); switchView(l.dataset.view); })
);
document.querySelectorAll('[data-view-link]').forEach(l =>
  l.addEventListener('click', e => { e.preventDefault(); switchView(l.dataset.viewLink); })
);

document.getElementById('sidebar-brand').addEventListener('click', e => {
  e.preventDefault();
  switchView('overview');
});

// ═══════════════════════════════════════════════════════════════
// 9. LOGOUT
// ═══════════════════════════════════════════════════════════════
dom.btnLogout.addEventListener('click', () => {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  window.location.href = LOGIN_URL;
});

// ═══════════════════════════════════════════════════════════════
// 10. TOASTS
// ═══════════════════════════════════════════════════════════════
let toastStyles = false;

function showNotification(title, msg, type = 'success') {
  const c = {
    success: { b: 'var(--green)',  g: 'rgba(74,222,128,0.1)' },
    warn:    { b: 'var(--yellow)', g: 'rgba(251,191,36,0.1)' },
    error:   { b: 'var(--red)',    g: 'rgba(239,68,68,0.1)' },
  }[type] || { b: 'var(--green)', g: 'rgba(74,222,128,0.1)' };

  if (!toastStyles) {
    const s = document.createElement('style');
    s.textContent = `@keyframes ti{from{transform:translateX(120%);opacity:0}to{transform:translateX(0);opacity:1}}@keyframes to{from{transform:translateX(0);opacity:1}to{transform:translateX(120%);opacity:0}}`;
    document.head.appendChild(s);
    toastStyles = true;
  }

  const t = document.createElement('div');
  t.style.cssText = `position:fixed;top:24px;right:24px;z-index:99999;background:var(--bg-2);border:1px solid var(--border);border-left:3px solid ${c.b};background-image:linear-gradient(90deg,${c.g},transparent);padding:16px 20px;max-width:380px;font-family:var(--mono);font-size:12px;color:var(--text);box-shadow:0 12px 32px rgba(0,0,0,.4);animation:ti .3s ease;clip-path:polygon(0 6px,6px 0,100% 0,100% calc(100% - 6px),calc(100% - 6px) 100%,0 100%);`;
  t.innerHTML = `<div style="font-weight:700;margin-bottom:6px;color:${c.b}">${title}</div><div style="color:var(--text-dim);line-height:1.5">${msg}</div>`;
  document.body.appendChild(t);
  setTimeout(() => {
    t.style.animation = 'to .3s ease forwards';
    setTimeout(() => t.remove(), 300);
  }, 5000);
}

// ═══════════════════════════════════════════════════════════════
// 11. CONFIRM MODAL
// ═══════════════════════════════════════════════════════════════
function showConfirm({ title, message, confirmText = 'Confirmar', cancelText = 'Cancelar', danger = true }) {
  return new Promise(resolve => {
    const o  = document.getElementById('confirm-modal');
    const te = document.getElementById('confirm-title');
    const me = document.getElementById('confirm-message');
    const cb = document.getElementById('confirm-cancel');
    const ab = document.getElementById('confirm-accept');

    te.textContent = title;
    me.textContent = message;
    cb.textContent = cancelText;
    ab.textContent = confirmText;
    ab.classList.toggle('confirm-btn-danger', danger);
    ab.classList.toggle('confirm-btn-cancel', !danger);

    const ncb = cb.cloneNode(true);
    const nab = ab.cloneNode(true);
    cb.replaceWith(ncb);
    ab.replaceWith(nab);

    const clean = () => {
      o.classList.remove('active');
      document.removeEventListener('keydown', kd);
    };
    const cancel = () => { clean(); resolve(false); };
    const accept = () => { clean(); resolve(true); };
    const kd = e => {
      if (e.key === 'Escape') cancel();
      else if (e.key === 'Enter') accept();
    };

    ncb.addEventListener('click', cancel);
    nab.addEventListener('click', accept);
    o.addEventListener('click', e => { if (e.target === o) cancel(); });
    document.addEventListener('keydown', kd);
    o.classList.add('active');
  });
}

// ═══════════════════════════════════════════════════════════════
// 12. LOADING
// ═══════════════════════════════════════════════════════════════
function showLoading(title, sub) {
  const o = document.createElement('div');
  o.className = 'loading-overlay';
  o.innerHTML = `<div class="loading-spinner"></div><div class="loading-text">${title}</div>${sub ? `<div class="loading-text" style="font-size:10px;color:var(--text-faint)">${sub}</div>` : ''}`;
  document.body.appendChild(o);
  return o;
}

// ═══════════════════════════════════════════════════════════════
// 13. CARGA DE ANÁLISIS
// ═══════════════════════════════════════════════════════════════
async function loadAnalyses() {
  try {
    const res = await authFetch('/analyses');
    if (handleAuthError(res)) return;
    if (!res.ok) throw new Error(`Error ${res.status}`);
    state.allAnalyses = await res.json();
    state.latestPlan = state.allAnalyses[0]?.plan || null;
    renderOverview();
    renderAnalysesFull();
    renderProgress();
    renderPlanView();
    renderPreMatch();
    renderArsenal();
  } catch (err) {
    console.error('[dashboard]', err);
    showNotification('❌ Error', 'No se pudo cargar el historial.', 'error');
  }
}

// ═══════════════════════════════════════════════════════════════
// 14. OVERVIEW
// ═══════════════════════════════════════════════════════════════
function renderOverview() {
  const total = state.allAnalyses.length;
  dom.statTotalDemos.textContent = total;

  if (total > 0) {
    const avgAdr  = state.allAnalyses.reduce((s, a) => s + a.adr, 0) / total;
    const avgKast = state.allAnalyses.reduce((s, a) => s + a.kast, 0) / total;

    dom.statAvgAdr.textContent  = avgAdr.toFixed(1);
    dom.statAvgKast.textContent = avgKast.toFixed(1) + '%';
    dom.statAvgAdr.style.color  = metricColor(avgAdr, RANGES.adr.red, RANGES.adr.orange, RANGES.adr.green);
    dom.statAvgKast.style.color = metricColor(avgKast, RANGES.kast.red, RANGES.kast.orange, RANGES.kast.green);

    const byMap = {};
    state.allAnalyses.forEach(a => {
      (byMap[a.map_name] = byMap[a.map_name] || []).push(a.adr);
    });

    let best = '—', bestAvg = 0;
    Object.entries(byMap).forEach(([m, ads]) => {
      const av = ads.reduce((s, x) => s + x, 0) / ads.length;
      if (av > bestAvg) { bestAvg = av; best = m.replace('de_', '').toUpperCase(); }
    });
    dom.statBestMap.textContent = best;
  }

  const recent = state.allAnalyses.slice(0, 4);
  dom.listOverview.innerHTML = recent.length === 0
    ? `<div class="empty-state"><div class="empty-state-icon">◈</div><p>Todavía no analizaste ninguna demo.</p><p class="empty-state-hint">Subí tu primera demo para empezar.</p></div>`
    : recent.map(analysisCardHTML).join('');

  if (recent.length) attachCardListeners(dom.listOverview);
  renderPlanActive();
}

// ═══════════════════════════════════════════════════════════════
// 15. CARDS Y LISTA FULL
// ═══════════════════════════════════════════════════════════════
function analysisCardHTML(a) {
  const map   = (a.map_name || '').replace('de_', '').toUpperCase() || '—';
  const adrC  = metricColor(a.adr, RANGES.adr.red, RANGES.adr.orange, RANGES.adr.green);
  const kastC = metricColor(a.kast, RANGES.kast.red, RANGES.kast.orange, RANGES.kast.green);
  return `<div class="analysis-card" data-analysis-id="${a.id}" role="button" tabindex="0">
    <div class="analysis-card-header">
      <div class="analysis-card-map">${map}</div>
      <div class="analysis-card-date">${formatDate(a.created_at)}</div>
    </div>
    <div class="analysis-card-player">${escapeHtml(a.player_name || '—')}</div>
    <div class="analysis-card-metrics">
      <div class="analysis-metric"><div class="analysis-metric-label">ADR</div><div class="analysis-metric-value" style="color:${adrC}">${a.adr.toFixed(1)}</div></div>
      <div class="analysis-metric"><div class="analysis-metric-label">KAST</div><div class="analysis-metric-value" style="color:${kastC}">${a.kast.toFixed(1)}%</div></div>
    </div>
  </div>`;
}

function renderAnalysesFull() {
  dom.listFull.innerHTML = state.allAnalyses.length === 0
    ? `<div class="empty-state"><div class="empty-state-icon">▤</div><p>Todavía no analizaste ninguna demo.</p><p class="empty-state-hint">Hacé click en "Nuevo análisis".</p></div>`
    : state.allAnalyses.map(analysisCardHTML).join('');
  if (state.allAnalyses.length) attachCardListeners(dom.listFull);
}

function attachCardListeners(container) {
  container.querySelectorAll('.analysis-card').forEach(card => {
    const open = () => {
      const a = state.allAnalyses.find(x => x.id === parseInt(card.dataset.analysisId, 10));
      if (a) openAnalysisModal(a);
    };
    card.addEventListener('click', open);
    card.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
    });
  });
}

// ═══════════════════════════════════════════════════════════════
// 16. PLAN
// ═══════════════════════════════════════════════════════════════
function planHTML(plan) {
  if (!plan?.drills?.length) return `<div class="plan-empty">Plan no disponible.</div>`;
  const drills = plan.drills.map(d => {
    const w = getWorkshopUrl(d.mapa);
    const mapHtml = w
      ? `<a href="${w.url}" target="_blank" rel="noopener noreferrer" class="plan-map-link">${escapeHtml(w.name)} ↗</a>`
      : escapeHtml(d.mapa || '');
    return `<div class="plan-drill">
      <div class="plan-drill-time">${d.duracion}<span>MIN</span></div>
      <div class="plan-drill-content">
        <div class="plan-drill-title">${escapeHtml(d.titulo || '')}</div>
        <div class="plan-drill-meta">${mapHtml}</div>
        <div class="plan-drill-instruction">${escapeHtml(d.instruccion || '')}</div>
      </div>
    </div>`;
  }).join('');
  const total = plan.drills.reduce((s, x) => s + x.duracion, 0);
  return `<div class="plan-header">
    <div class="plan-badge">IA Coach</div>
    <div style="font-family:var(--mono);font-size:11px;color:var(--text-dim);letter-spacing:1px;text-transform:uppercase">Plan de ${total} min</div>
  </div>
  <div class="plan-diagnostico">${escapeHtml(plan.diagnostico || '')}</div>
  <div class="plan-drills">${drills}</div>
  ${plan.motivacion ? `<div class="plan-motivacion">"${escapeHtml(plan.motivacion)}"</div>` : ''}`;
}

function renderPlanActive() {
  dom.planActive.innerHTML = state.latestPlan
    ? planHTML(state.latestPlan)
    : `<div class="empty-state"><p>Subí una demo para generar tu primer plan.</p></div>`;
}

function renderPlanView() {
  dom.planView.innerHTML = state.latestPlan
    ? planHTML(state.latestPlan)
    : `<div class="empty-state"><div class="empty-state-icon">▶</div><p>Subí una demo para generar tu plan.</p></div>`;
}

// ═══════════════════════════════════════════════════════════════
// 17. PROGRESO
// ═══════════════════════════════════════════════════════════════
function renderProgress() {
  if (state.allAnalyses.length < 2) {
    dom.progressView.innerHTML = `<div class="empty-state"><p>Necesitás al menos 2 análisis para ver tu progreso.</p></div>`;
    return;
  }
  const sorted = [...state.allAnalyses].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  const adrs = sorted.map(a => a.adr);
  const max = Math.max(...adrs), min = Math.min(...adrs), range = max - min || 1;

  const bars = sorted.map(a => {
    const h = 20 + ((a.adr - min) / range) * 180;
    const c = metricColor(a.adr, RANGES.adr.red, RANGES.adr.orange, RANGES.adr.green);
    return `<div class="progress-bar" style="height:${h}px;background:linear-gradient(180deg,${c},${c}66)" title="${a.map_name} · ${a.adr.toFixed(1)} ADR"><div class="progress-bar-value" style="color:${c}">${a.adr.toFixed(1)}</div></div>`;
  }).join('');

  dom.progressView.innerHTML = `<div class="progress-chart"><div class="progress-chart-title">ADR por partida</div><div class="progress-bars">${bars}</div></div>`;
}

// ═══════════════════════════════════════════════════════════════
// 18. PRE-PARTIDA
// ═══════════════════════════════════════════════════════════════
function renderPreMatch() {
  if (state.allAnalyses.length === 0) {
    dom.preMatchView.innerHTML = `<div class="empty-state"><div class="empty-state-icon">⚡</div><p>Necesitás al menos 1 análisis para recomendaciones.</p></div>`;
    return;
  }

  const total = state.allAnalyses.length;
  const avg = key => state.allAnalyses.reduce((s, a) => s + a[key], 0) / total;
  const adr = avg('adr'), kast = avg('kast'), opening = avg('opening_duels_won_pct');
  const trade = avg('trade_efficiency_pct'), utility = avg('utility_dmg_per_round');

  const weaknesses = [
    { name: 'Opening duels',   val: opening, range: RANGES.opening, map: 'Yprac Hub' },
    { name: 'Trade efficiency', val: trade,  range: RANGES.trade,   map: 'Yprac Hub' },
    { name: 'Utility damage',  val: utility, range: RANGES.utility, map: 'Yprac Hub' },
  ];
  weaknesses.sort((a, b) => (a.val - a.range.orange) - (b.val - b.range.orange));
  const main = weaknesses[0];

  const routines = {
    15: [
      { d: 8, t: 'Aim calentamiento', m: 'Aim Botz',  desc: 'Flicks y microajustes. 100 kills rápidos.' },
      { d: 7, t: 'Prefire',           m: 'Yprac Hub', desc: `Rutas de prefire. Foco en ${main.name.toLowerCase()}.` },
    ],
    30: [
      { d: 10, t: 'Aim calentamiento', m: 'Aim Botz',  desc: '100 kills estáticos + 50 con strafe.' },
      { d: 12, t: 'Prefire y ángulos', m: 'Yprac Hub', desc: `3 rutas de prefire. Priorizá ${main.name.toLowerCase()}.` },
      { d: 8,  t: 'Utilidad express',  m: 'Yprac Hub', desc: '5 lineups clave (smokes/flashes).' },
    ],
    45: [
      { d: 12, t: 'Aim completo',      m: 'Aim Botz',  desc: '150 kills variados: estáticos, strafe y flicks.' },
      { d: 15, t: 'Prefire profundo',  m: 'Yprac Hub', desc: '5 rutas completas de prefire.' },
      { d: 10, t: 'Utilidad avanzada', m: 'Yprac Hub', desc: '10 lineups con ejecución perfecta.' },
      { d: 8,  t: 'Duelos reales',     m: 'Aim_Rush',  desc: 'Duelos bajo presión.' },
    ],
  };

  const renderRoutine = dur => (routines[dur] || routines[30]).map(i => {
    const w = getWorkshopUrl(i.m);
    const mh = w ? `<a href="${w.url}" target="_blank" rel="noopener noreferrer" class="prematch-map-link">${w.name} ↗</a>` : i.m;
    return `<div class="prematch-item">
      <div class="prematch-item-duration">${i.d} min</div>
      <div class="prematch-item-content">
        <div class="prematch-item-title">${i.t}</div>
        <div class="prematch-item-map">${mh}</div>
        <div class="prematch-item-desc">${i.desc}</div>
      </div>
    </div>`;
  }).join('');

  dom.preMatchView.innerHTML = `
    <div class="prematch-header">
      <div class="prematch-title">Calentamiento recomendado</div>
      <div class="prematch-subtitle">Basado en ${total} análisis</div>
    </div>
    <div class="prematch-stats">
      <div class="prematch-stat"><span class="prematch-stat-label">ADR</span><span class="prematch-stat-value" style="color:${metricColor(adr, RANGES.adr.red, RANGES.adr.orange, RANGES.adr.green)}">${adr.toFixed(1)}</span></div>
      <div class="prematch-stat"><span class="prematch-stat-label">KAST</span><span class="prematch-stat-value" style="color:${metricColor(kast, RANGES.kast.red, RANGES.kast.orange, RANGES.kast.green)}">${kast.toFixed(1)}%</span></div>
      <div class="prematch-stat"><span class="prematch-stat-label">Opening</span><span class="prematch-stat-value" style="color:${metricColor(opening, RANGES.opening.red, RANGES.opening.orange, RANGES.opening.green)}">${opening.toFixed(1)}%</span></div>
      <div class="prematch-stat"><span class="prematch-stat-label">Trade</span><span class="prematch-stat-value" style="color:${metricColor(trade, RANGES.trade.red, RANGES.trade.orange, RANGES.trade.green)}">${trade.toFixed(1)}%</span></div>
      <div class="prematch-stat"><span class="prematch-stat-label">Utility</span><span class="prematch-stat-value" style="color:${metricColor(utility, RANGES.utility.red, RANGES.utility.orange, RANGES.utility.green)}">${utility.toFixed(1)}</span></div>
    </div>
    <div class="prematch-diagnostico">
      <span class="prematch-diagnostico-label">Debilidad principal:</span>
      <span class="prematch-diagnostico-value">${main.name} (${main.val.toFixed(1)} vs ${main.range.orange} esperado)</span>
    </div>
    <div class="prematch-duration-selector">
      <button type="button" class="prematch-duration-btn ${state.selectedDuration === 15 ? 'active' : ''}" data-duration="15">15 min</button>
      <button type="button" class="prematch-duration-btn ${state.selectedDuration === 30 ? 'active' : ''}" data-duration="30">30 min</button>
      <button type="button" class="prematch-duration-btn ${state.selectedDuration === 45 ? 'active' : ''}" data-duration="45">45 min</button>
    </div>
    <div class="prematch-routine" id="prematch-routine">${renderRoutine(state.selectedDuration)}</div>
  `;

  dom.preMatchView.querySelectorAll('.prematch-duration-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      state.selectedDuration = parseInt(btn.dataset.duration, 10);
      dom.preMatchView.querySelectorAll('.prematch-duration-btn').forEach(b =>
        b.classList.toggle('active', b === btn)
      );
      document.getElementById('prematch-routine').innerHTML = renderRoutine(state.selectedDuration);
    });
  });
}

// ═══════════════════════════════════════════════════════════════
// 19. ARSENAL TÁCTICO
// ═══════════════════════════════════════════════════════════════
function renderArsenal() {
  const categories = { 'Aim': [], 'Prefire': [], 'Utilidad': [], 'Movimiento': [] };
  const seen = new Set();

  Object.values(WORKSHOP_MAPS).forEach(m => {
    const key = `${m.cat}|${m.id}`;
    if (seen.has(key)) return;
    seen.add(key);
    categories[m.cat]?.push(m);
  });

  const sections = Object.entries(categories)
    .filter(([, maps]) => maps.length > 0)
    .map(([cat, maps]) => `
      <div class="arsenal-category">
        <div class="arsenal-category-title">${cat}</div>
        <div class="arsenal-grid">
          ${maps.map(m => `
            <a href="https://steamcommunity.com/sharedfiles/filedetails/?id=${m.id}"
               target="_blank" rel="noopener noreferrer" class="arsenal-card">
              <div class="arsenal-card-name">${escapeHtml(m.name)}</div>
              <div class="arsenal-card-id">ID ${m.id}</div>
            </a>
          `).join('')}
        </div>
      </div>
    `).join('');

  dom.arsenalView.innerHTML = `
    <div class="arsenal-header">
      <div class="arsenal-title">Arsenal Táctico</div>
      <div class="arsenal-sub">Los mejores mapas de Workshop para cada habilidad. Gratuitos y actualizados para CS2.</div>
    </div>
    ${sections}
  `;
}

// ═══════════════════════════════════════════════════════════════
// 20. MODAL DE DETALLE
// ═══════════════════════════════════════════════════════════════
function openAnalysisModal(analysis) {
  state.currentAnalysisId = analysis.id;
  dom.modalDelete.disabled = false;
  dom.modalMap.textContent    = (analysis.map_name || '').replace('de_', '').toUpperCase() || '—';
  dom.modalPlayer.textContent = analysis.player_name || '—';
  dom.modalDate.textContent   = formatDateFull(analysis.created_at);

  const metrics = [
    { l: 'ADR',     v: analysis.adr.toFixed(1),                         c: metricColor(analysis.adr, RANGES.adr.red, RANGES.adr.orange, RANGES.adr.green) },
    { l: 'KAST',    v: analysis.kast.toFixed(1) + '%',                  c: metricColor(analysis.kast, RANGES.kast.red, RANGES.kast.orange, RANGES.kast.green) },
    { l: 'Opening', v: analysis.opening_duels_won_pct.toFixed(1) + '%', c: metricColor(analysis.opening_duels_won_pct, RANGES.opening.red, RANGES.opening.orange, RANGES.opening.green) },
    { l: 'Trade',   v: analysis.trade_efficiency_pct.toFixed(1) + '%',  c: metricColor(analysis.trade_efficiency_pct, RANGES.trade.red, RANGES.trade.orange, RANGES.trade.green) },
    { l: 'Utility', v: analysis.utility_dmg_per_round.toFixed(1),       c: metricColor(analysis.utility_dmg_per_round, RANGES.utility.red, RANGES.utility.orange, RANGES.utility.green) },
    { l: 'K/D',     v: `${analysis.kills} / ${analysis.deaths}`,        c: kdColor(analysis.kills, analysis.deaths) },
  ];

  dom.modalMetrics.innerHTML = metrics.map(m =>
    `<div class="modal-metric"><div class="modal-metric-label">${m.l}</div><div class="modal-metric-value" style="color:${m.c}">${m.v}</div></div>`
  ).join('');

  dom.modalPlan.innerHTML = analysis.plan
    ? planHTML(analysis.plan)
    : `<div class="plan-empty">Plan no disponible.</div>`;

  dom.detailModal.classList.add('active');
}

function closeAnalysisModal() {
  dom.detailModal.classList.remove('active');
  state.currentAnalysisId = null;
}

dom.modalClose.addEventListener('click', closeAnalysisModal);
dom.detailModal.addEventListener('click', e => {
  if (e.target === dom.detailModal) closeAnalysisModal();
});

// ═══════════════════════════════════════════════════════════════
// 21. ELIMINAR
// ═══════════════════════════════════════════════════════════════
dom.modalDelete.addEventListener('click', async () => {
  if (!state.currentAnalysisId) return;

  const ok = await showConfirm({
    title: '¿Eliminar análisis?',
    message: 'Se borrará el informe y el plan. No se puede deshacer.',
    confirmText: 'Eliminar',
    danger: true,
  });
  if (!ok) return;

  dom.modalDelete.disabled = true;
  try {
    const res = await authFetch(`/analyses/${state.currentAnalysisId}`, { method: 'DELETE' });
    if (handleAuthError(res)) return;
    if (!res.ok) throw new Error(`Error ${res.status}`);
    closeAnalysisModal();
    showNotification('🗑️ Análisis eliminado', 'El informe fue borrado.', 'success');
    await loadAnalyses();
  } catch (err) {
    console.error(err);
    showNotification('❌ Error', err.message, 'error');
    dom.modalDelete.disabled = false;
  }
});

// ═══════════════════════════════════════════════════════════════
// 22. UPLOAD — FASE 1
// ═══════════════════════════════════════════════════════════════
dom.btnNewAnalysis.addEventListener('click', () => dom.fileInput.click());

dom.fileInput.addEventListener('change', async e => {
  const file = e.target.files?.[0];
  if (!file) return;
  dom.fileInput.value = '';
  dom.btnNewAnalysis.disabled = true;

  const overlay = showLoading('Parseando demo...', 'Detectando jugadores');

  try {
    const fd = new FormData();
    fd.append('file', file);

    const res = await authFetch('/demo/upload', { method: 'POST', body: fd });
    if (handleAuthError(res)) { overlay.remove(); return; }
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || `Error ${res.status}`);
    }

    const data = await res.json();
    overlay.remove();

    // Si TODOS los jugadores ya fueron analizados, mostrar el más reciente
    if (data.all_analyzed) {
      await loadAnalyses();
      const lastAnalysis = state.allAnalyses.find(a =>
        data.analyzed_players.includes(a.player_name)
      );
      showNotification(
        '♻️ Todos los jugadores ya fueron analizados',
        'Mostrando el análisis más reciente. Eliminá uno para volver a analizar.',
        'warn'
      );
      if (lastAnalysis) openAnalysisModal(lastAnalysis);
      return;
    }

    // Flujo normal: mostrar selector con badges
    state.currentSessionId = data.session_id;
    renderPlayerList(data.players, data.analyzed_players || []);
    dom.playerSelector.classList.add('active');

  } catch (err) {
    console.error(err);
    overlay.remove();
    showNotification('❌ Error', err.message, 'error');
  } finally {
    dom.btnNewAnalysis.disabled = false;
  }
});

// ═══════════════════════════════════════════════════════════════
// 23. SELECTOR DE JUGADOR Y DURACIÓN
// ═══════════════════════════════════════════════════════════════
function renderPlayerList(players, analyzedPlayers = []) {
  const analyzedSet = new Set(analyzedPlayers);

  dom.playerList.innerHTML = players.map((p, i) => {
    const adrC  = metricColor(p.adr, RANGES.adr.red, RANGES.adr.orange, RANGES.adr.green);
    const kastC = metricColor(p.kast, RANGES.kast.red, RANGES.kast.orange, RANGES.kast.green);
    const kdC   = kdColor(p.kills, p.deaths);
    const isAnalyzed = analyzedSet.has(p.name);

    return `<button type="button" class="player-option ${isAnalyzed ? 'analyzed' : ''}" data-player="${escapeHtml(p.name)}" data-analyzed="${isAnalyzed}">
      <div class="player-option-top">
        <div class="player-option-rank">${i + 1}</div>
      </div>
      <div class="player-option-name">
        ${escapeHtml(p.name)}
        ${isAnalyzed ? '<span class="player-option-badge">✓ YA ANALIZADO</span>' : ''}
      </div>
      <div class="player-option-stats">
        <div class="player-option-stat"><div class="player-option-stat-label">K/D</div><div class="player-option-stat-value" style="color:${kdC}">${p.kills}/${p.deaths}</div></div>
        <div class="player-option-stat"><div class="player-option-stat-label">ADR</div><div class="player-option-stat-value" style="color:${adrC}">${p.adr.toFixed(1)}</div></div>
        <div class="player-option-stat"><div class="player-option-stat-label">KAST</div><div class="player-option-stat-value" style="color:${kastC}">${p.kast.toFixed(1)}%</div></div>
      </div>
    </button>`;
  }).join('');

  dom.playerList.querySelectorAll('.player-option').forEach(btn => {
    btn.addEventListener('click', () => {
      const name = btn.dataset.player;
      const isAnalyzed = btn.dataset.analyzed === 'true';
      const sid  = state.currentSessionId;
      dom.playerSelector.classList.remove('active');

      if (!sid) {
        showNotification('❌ Error', 'Sesión expirada. Subí la demo de nuevo.', 'error');
        return;
      }

      if (isAnalyzed) {
        showNotification('♻️ Jugador ya analizado', 'Se mostrará el análisis existente.', 'warn');
      }

      analyzePlayer(name, sid, state.selectedDuration);
    });
  });
}

function closePlayerSelector() {
  dom.playerSelector.classList.remove('active');
  state.currentSessionId = null;
}

dom.playerCancel.addEventListener('click', closePlayerSelector);
dom.playerSelector.addEventListener('click', e => {
  if (e.target === dom.playerSelector) closePlayerSelector();
});

dom.durationBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    state.selectedDuration = parseInt(btn.dataset.duration, 10);
    dom.durationBtns.forEach(b => b.classList.toggle('active', b === btn));
  });
});

// ═══════════════════════════════════════════════════════════════
// 24. UPLOAD — FASE 2
// ═══════════════════════════════════════════════════════════════
async function analyzePlayer(player, sessionId, duration) {
  dom.btnNewAnalysis.disabled = true;
  const overlay = showLoading('Analizando...', `Generando plan de ${duration} min (~15s)`);

  try {
    const fd = new FormData();
    fd.append('session_id', sessionId);
    fd.append('player', player);
    fd.append('duration', String(duration));

    const res = await authFetch('/analyze', { method: 'POST', body: fd });
    if (handleAuthError(res)) { overlay.remove(); return; }
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || `Error ${res.status}`);
    }

    const data = await res.json();
    overlay.remove();
    state.currentSessionId = null;

    if (data.duplicate) {
      showNotification('♻️ Jugador ya analizado', `Análisis del ${formatDateFull(data.created_at)}.`, 'warn');
    } else {
      showNotification('✅ Análisis completo', `Plan de ${duration} min para ${data.jugador}.`, 'success');
    }

    await loadAnalyses();

    const a = state.allAnalyses.find(x => x.id === data.analysis_id);
    if (a) openAnalysisModal(a);

  } catch (err) {
    console.error(err);
    overlay.remove();
    state.currentSessionId = null;
    showNotification('❌ Error', err.message, 'error');
  } finally {
    dom.btnNewAnalysis.disabled = false;
  }
}

// ═══════════════════════════════════════════════════════════════
// 25. ESC
// ═══════════════════════════════════════════════════════════════
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  if (dom.detailModal.classList.contains('active')) closeAnalysisModal();
  else if (dom.playerSelector.classList.contains('active')) closePlayerSelector();
});

// ═══════════════════════════════════════════════════════════════
// 26. BOOT
// ═══════════════════════════════════════════════════════════════
loadAnalyses();
console.log('[dashboard] ✅ Inicializado para', user.username);