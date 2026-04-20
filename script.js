/* ── DOM refs ── */
const arena          = document.getElementById('arena');
const barsHost       = document.getElementById('bars');
const pregameOverlay = document.getElementById('pregame-overlay');
const timerEl        = document.getElementById('timer');
const overlay        = document.getElementById('overlay');
const finalTimeEl    = document.getElementById('final-time');
const playBtn        = document.getElementById('play-btn');
const diffBtns       = document.querySelectorAll('.diff-btn');
const themeToggleBtn = document.getElementById('theme-toggle-btn');
const iconMoon       = document.getElementById('icon-moon');
const iconSun        = document.getElementById('icon-sun');
const settingsBtn    = document.getElementById('settings-btn');
const settingsPanel  = document.getElementById('settings-panel');
const insertBtn      = document.getElementById('insert-btn');
const swapBtn        = document.getElementById('swap-btn');
const modeDesc       = document.getElementById('mode-desc');
const replayBanner   = document.getElementById('replay-banner');
const replayStopBtn  = document.getElementById('replay-stop-btn');
const changeNameBtn  = document.getElementById('change-name-btn');
const nameEditorEl   = document.getElementById('name-editor');
const nameInputEl    = document.getElementById('name-input');
const nameSaveBtn    = document.getElementById('name-save-btn');
const nameCancelBtn  = document.getElementById('name-cancel-btn');
const globalStatusEl = document.getElementById('global-status');
const nameModalEl    = document.getElementById('name-modal');
const nameModalInputEl = document.getElementById('name-modal-input');
const nameModalSaveBtn = document.getElementById('name-modal-save-btn');
const nameModalSkipBtn = document.getElementById('name-modal-skip-btn');

/* ── Difficulty state ── */
let selectedCols = 30;
let selectedDiff = 'normal'; // 'easy' | 'normal' | 'hard'
const diffMap = { '20': 'easy', '30': 'normal', '50': 'hard' };

diffBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    diffBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    selectedCols = parseInt(btn.dataset.cols, 10);
    selectedDiff = diffMap[btn.dataset.cols];
    newGame();
  });
});

/* ── Theme toggle ── */
let isLight = false;

themeToggleBtn.addEventListener('click', () => {
  isLight = !isLight;
  document.body.classList.toggle('light', isLight);
  iconMoon.style.display = isLight ? 'none' : '';
  iconSun.style.display  = isLight ? ''     : 'none';
});

/* ── Settings panel ── */
settingsBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  settingsPanel.classList.toggle('open');
  settingsBtn.classList.toggle('open', settingsPanel.classList.contains('open'));
});
settingsPanel.addEventListener('click', (e) => e.stopPropagation());
document.addEventListener('click', () => {
  settingsPanel.classList.remove('open');
  settingsBtn.classList.remove('open');
});

/* ── High Scores ── */
const HS_KEY = 'humansort_scores';
const HS_NAME_KEY = 'humansort_player_name';
const HS_MAX = 3;
const MAX_PLAYER_NAME_LENGTH = 20;
const GLOBAL_LEADERBOARD_MAX_ENTRIES = 10;
const GLOBAL_LEADERBOARD_TABLE = 'leaderboard_scores';
const SUPABASE_URL = 'https://ruwcxfppupahnzvzqrej.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ1d2N4ZnBwdXBhaG56dnpxcmVqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYzNjE2NDIsImV4cCI6MjA5MTkzNzY0Mn0.Z37HqSTx9O0vFaQMZrzRkQhaUTXyf4D5ZCAVtMxZs-E';
const ACT_SELECT   = 0;
const ACT_DESELECT = 1;
const ACT_MOVE     = 2;
const ACT_SWAP     = 3;
let supabaseClient = null;
const globalReplayCache = new Map();

function setGlobalStatus(message = '') {
  if (!globalStatusEl) return;
  if (message) {
    globalStatusEl.textContent = message;
    return;
  }
  const name = getStoredPlayerName();
  globalStatusEl.textContent = name ? `Your global name: ${name}` : 'Your global name: Not set';
}

function getStoredPlayerName() {
  try {
    const raw = localStorage.getItem(HS_NAME_KEY);
    if (!raw) return '';
    return raw.trim().slice(0, MAX_PLAYER_NAME_LENGTH);
  } catch {
    return '';
  }
}

function setStoredPlayerName(name) {
  const clean = (name || '').trim().slice(0, MAX_PLAYER_NAME_LENGTH);
  if (!clean) return '';
  try {
    localStorage.setItem(HS_NAME_KEY, clean);
  } catch {
    // ignore localStorage failures
  }
  setGlobalStatus();
  return clean;
}

function openNameEditor(initialValue = '') {
  if (!nameEditorEl || !nameInputEl) return;
  nameEditorEl.hidden = false;
  nameInputEl.value = initialValue.slice(0, MAX_PLAYER_NAME_LENGTH);
  nameInputEl.focus();
  nameInputEl.select();
}

function closeNameEditor() {
  if (!nameEditorEl) return;
  nameEditorEl.hidden = true;
}

function saveNameFromEditor() {
  if (!nameInputEl) return '';
  const clean = nameInputEl.value.trim().slice(0, MAX_PLAYER_NAME_LENGTH);
  if (!clean) return '';
  const saved = setStoredPlayerName(clean);
  closeNameEditor();
  return saved;
}

let resolveNameModal = null;

function closeNameModal() {
  if (!nameModalEl || !nameModalInputEl) return;
  nameModalEl.classList.remove('show');
  nameModalEl.setAttribute('aria-hidden', 'true');
  nameModalInputEl.blur();
}

function showNameModal(initialValue = '') {
  if (!nameModalEl || !nameModalInputEl) return;
  nameModalInputEl.value = initialValue.slice(0, MAX_PLAYER_NAME_LENGTH);
  nameModalEl.classList.add('show');
  nameModalEl.setAttribute('aria-hidden', 'false');
  nameModalInputEl.focus();
  nameModalInputEl.select();
}

function resolveNameModalWith(value = '') {
  if (typeof resolveNameModal !== 'function') return;
  const resolver = resolveNameModal;
  resolveNameModal = null;
  closeNameModal();
  resolver(value);
}

function requestPlayerNameModal() {
  const existing = getStoredPlayerName();
  if (existing) return Promise.resolve(existing);
  if (!nameModalEl || !nameModalInputEl) return Promise.resolve('');
  if (typeof resolveNameModal === 'function') return Promise.resolve('');
  showNameModal('');
  return new Promise((resolve) => {
    resolveNameModal = resolve;
  });
}

if (changeNameBtn) {
  changeNameBtn.addEventListener('click', () => {
    const current = getStoredPlayerName();
    openNameEditor(current);
  });
}

if (nameSaveBtn) {
  nameSaveBtn.addEventListener('click', () => {
    saveNameFromEditor();
  });
}

if (nameCancelBtn) {
  nameCancelBtn.addEventListener('click', () => {
    closeNameEditor();
  });
}

if (nameInputEl) {
  nameInputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      saveNameFromEditor();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closeNameEditor();
    }
  });
}

if (nameModalSaveBtn && nameModalInputEl) {
  nameModalSaveBtn.addEventListener('click', () => {
    const clean = nameModalInputEl.value.trim().slice(0, MAX_PLAYER_NAME_LENGTH);
    if (!clean) return;
    const saved = setStoredPlayerName(clean);
    resolveNameModalWith(saved);
  });
}

if (nameModalSkipBtn) {
  nameModalSkipBtn.addEventListener('click', () => {
    resolveNameModalWith('');
  });
}

if (nameModalInputEl) {
  nameModalInputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const clean = nameModalInputEl.value.trim().slice(0, MAX_PLAYER_NAME_LENGTH);
      if (!clean) return;
      const saved = setStoredPlayerName(clean);
      resolveNameModalWith(saved);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      resolveNameModalWith('');
    }
  });
}

setGlobalStatus();

function bytesToBase64(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function base64ToBytes(base64) {
  const bin = atob(base64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function packReplay(numBars, init, events) {
  const out = [numBars & 0xff];
  for (let i = 0; i < numBars; i++) out.push(init[i] & 0xff);

  let prevT = 0;
  for (const [tRaw, typeRaw, idxRaw] of events) {
    const t    = tRaw | 0;
    const type = typeRaw | 0;
    const idx  = idxRaw | 0;
    let delta  = t - prevT;
    prevT      = t;
    if (delta < 0) delta = 0;
    if (delta > 0x7fff) delta = 0x7fff;

    if (delta < 128) {
      out.push(delta);
    } else {
      out.push(0x80 | (delta >> 8));
      out.push(delta & 0xff);
    }
    out.push(((type & 0x03) << 6) | (idx & 0x3f));
  }

  return bytesToBase64(Uint8Array.from(out));
}

function unpackReplay(base64) {
  if (typeof base64 !== 'string' || !base64) return null;
  try {
    const bytes = base64ToBytes(base64);
    if (bytes.length < 1) return null;

    const numBars = bytes[0];
    if (!numBars || bytes.length < 1 + numBars) return null;
    const init = Array.from(bytes.slice(1, 1 + numBars));

    const events = [];
    let t = 0;
    let off = 1 + numBars;
    while (off < bytes.length) {
      const b0 = bytes[off++];
      let delta = b0;
      if (b0 & 0x80) {
        if (off >= bytes.length) return null;
        delta = ((b0 & 0x7f) << 8) | bytes[off++];
      }
      if (off >= bytes.length) return null;

      const action = bytes[off++];
      t += delta;
      events.push([t, action >> 6, action & 0x3f]);
    }
    return { numBars, init, events };
  } catch {
    return null;
  }
}

function replaySizeBytes(base64) {
  try {
    return base64ToBytes(base64).length;
  } catch {
    return 0;
  }
}

function loadScores() {
  try {
    const data = JSON.parse(localStorage.getItem(HS_KEY)) || { easy: [], normal: [], hard: [] };
    // Normalize old format (plain numbers → objects)
    for (const key of ['easy', 'normal', 'hard']) {
      data[key] = (data[key] || []).map(s => {
        if (typeof s === 'number') return { ms: s, replay: null };
        if (!s || typeof s.ms !== 'number') return null;
        return { ms: s.ms, replay: typeof s.replay === 'string' ? s.replay : null };
      }).filter(Boolean);
    }
    return data;
  } catch {
    // localStorage may be unavailable or contain corrupt data; start fresh
    return { easy: [], normal: [], hard: [] };
  }
}

function saveScore(diff, ms, replay) {
  const scores = loadScores();
  scores[diff] = scores[diff] || [];
  scores[diff].push({ ms, replay });
  scores[diff].sort((a, b) => a.ms - b.ms);
  scores[diff] = scores[diff].slice(0, HS_MAX);
  localStorage.setItem(HS_KEY, JSON.stringify(scores));
  renderHighScores();
}

function renderHighScores() {
  const scores = loadScores();
  const diffs = [
    { key: 'easy',   id: 'hs-easy',   label: 'Easy (20)' },
    { key: 'normal', id: 'hs-normal', label: 'Normal (30)' },
    { key: 'hard',   id: 'hs-hard',   label: 'Hard (50)' },
  ];
  for (const d of diffs) {
    const col = document.getElementById(d.id);
    col.replaceChildren(col.firstElementChild);
    const list = scores[d.key] || [];
    if (list.length === 0) {
      const empty = document.createElement('span');
      empty.className = 'hs-empty';
      empty.textContent = 'No scores yet';
      col.appendChild(empty);
    } else {
      list.forEach((entry, i) => {
        const div = document.createElement('div');
        div.className = 'hs-entry';
        const rank = document.createElement('span');
        rank.className = 'hs-rank';
        rank.textContent = `#${i + 1}`;
        const time = document.createElement('span');
        time.className = 'hs-time';
        time.textContent = fmtTime(entry.ms);
        div.appendChild(rank);
        div.appendChild(time);
        if (entry.replay) {
          const btn = document.createElement('button');
          btn.className = 'hs-replay-btn';
          btn.textContent = '▶';
          btn.title = 'Watch replay';
          const r = entry.replay;
          const replaySize = replaySizeBytes(r);
          const replaySizeField = document.createElement('input');
          replaySizeField.type = 'hidden';
          replaySizeField.className = 'replay-size-field';
          replaySizeField.value = String(replaySize);
          btn.addEventListener('click', () => watchReplay(r));
          div.appendChild(btn);
          div.appendChild(replaySizeField);
        }
        col.appendChild(div);
      });
    }
  }
}

function isCurrentPlayerEntry(entry, currentUserId) {
  if (!currentUserId) return false;
  return entry?.user_id === currentUserId;
}

function getGlobalReplayCacheKey(entry) {
  const safe = (value) => (value === null || value === undefined ? '__NULL__' : String(value));
  return `${safe(entry.difficulty)}|${safe(entry.user_id)}|${Number(entry.score_ms) || 0}|${safe(entry.created_at)}`;
}

function shouldShowOwnRankRow(ownEntry) {
  return Boolean(ownEntry && Number(ownEntry.rank) > GLOBAL_LEADERBOARD_MAX_ENTRIES);
}

async function fetchGlobalReplayData(entry) {
  if (!supabaseClient || !entry) return null;
  const cacheKey = getGlobalReplayCacheKey(entry);
  if (globalReplayCache.has(cacheKey)) {
    return globalReplayCache.get(cacheKey);
  }
  try {
    let query = supabaseClient
      .from(GLOBAL_LEADERBOARD_TABLE)
      .select('replay_data')
      .eq('difficulty', entry.difficulty)
      .eq('score_ms', Number(entry.score_ms) || 0);
    if (entry.user_id == null) query = query.is('user_id', null);
    else query = query.eq('user_id', entry.user_id);
    if (entry.created_at == null) query = query.is('created_at', null);
    else query = query.eq('created_at', entry.created_at);
    const { data, error } = await query.limit(1);
    if (error) throw error;
    const replay = (data && data[0] && typeof data[0].replay_data === 'string') ? data[0].replay_data : null;
    if (replay) globalReplayCache.set(cacheKey, replay);
    return replay;
  } catch {
    // Network/query failures should fail replay playback silently for this row.
    return null;
  }
}

async function watchGlobalReplay(btn, entry) {
  if (!btn) return;
  btn.disabled = true;
  try {
    const replay = await fetchGlobalReplayData(entry);
    if (replay) watchReplay(replay);
    else setGlobalStatus('Replay unavailable for this score');
  } finally {
    btn.disabled = false;
  }
}

function renderGlobalColumn(colId, list, currentUserId = '', ownEntryOutsideTopTen = null) {
  const col = document.getElementById(colId);
  if (!col) return;
  col.replaceChildren(col.firstElementChild);
  const hasOwnExtraRow = shouldShowOwnRankRow(ownEntryOutsideTopTen);
  if ((!list || list.length === 0) && !hasOwnExtraRow) {
    const empty = document.createElement('span');
    empty.className = 'hs-empty';
    empty.textContent = 'No scores yet';
    col.appendChild(empty);
    return;
  }
  list.forEach((entry, i) => {
    const div = document.createElement('div');
    div.className = 'hs-entry';
    if (isCurrentPlayerEntry(entry, currentUserId)) div.classList.add('own-score');
    const rank = document.createElement('span');
    rank.className = 'hs-rank';
    rank.textContent = `#${i + 1}`;
    const name = document.createElement('span');
    name.textContent = (entry.player_name || 'Anonymous').slice(0, MAX_PLAYER_NAME_LENGTH);
    const time = document.createElement('span');
    time.className = 'hs-time';
    time.textContent = fmtTime(Number(entry.score_ms) || 0);
    div.appendChild(rank);
    div.appendChild(name);
    div.appendChild(time);
    const btn = document.createElement('button');
    btn.className = 'hs-replay-btn';
    btn.textContent = '▶';
    btn.title = 'Watch replay';
    btn.addEventListener('click', () => watchGlobalReplay(btn, entry));
    div.appendChild(btn);
    col.appendChild(div);
  });

  if (hasOwnExtraRow) {
    const div = document.createElement('div');
    div.className = 'hs-entry own-score own-rank-row';
    const rank = document.createElement('span');
    rank.className = 'hs-rank';
    rank.textContent = `#${ownEntryOutsideTopTen.rank}`;
    const name = document.createElement('span');
    name.textContent = (ownEntryOutsideTopTen.player_name || 'Anonymous').slice(0, MAX_PLAYER_NAME_LENGTH);
    const time = document.createElement('span');
    time.className = 'hs-time';
    time.textContent = fmtTime(Number(ownEntryOutsideTopTen.score_ms) || 0);
    const btn = document.createElement('button');
    btn.className = 'hs-replay-btn';
    btn.textContent = '▶';
    btn.title = 'Watch replay';
    btn.addEventListener('click', () => watchGlobalReplay(btn, ownEntryOutsideTopTen));
    div.appendChild(rank);
    div.appendChild(name);
    div.appendChild(time);
    div.appendChild(btn);
    col.appendChild(div);
  }
}

async function getCurrentUserId() {
  if (!supabaseClient) return '';
  try {
    const { data, error } = await supabaseClient.auth.getSession();
    if (error) return '';
    return data?.session?.user?.id || '';
  } catch {
    return '';
  }
}

async function fetchOwnRankedEntry(diff, currentUserId) {
  if (!supabaseClient || !currentUserId) return null;
  const { data: bestRows, error: bestError } = await supabaseClient
    .from(GLOBAL_LEADERBOARD_TABLE)
    .select('user_id,player_name,difficulty,score_ms,created_at')
    .eq('difficulty', diff)
    .eq('user_id', currentUserId)
    .order('score_ms', { ascending: true })
    .order('created_at', { ascending: true })
    .limit(1);
  if (bestError) throw bestError;
  const best = bestRows && bestRows[0];
  if (!best) return null;

  const score = Number(best.score_ms) || 0;
  const createdAt = best.created_at;
  const { count: betterCount, error: betterError } = await supabaseClient
    .from(GLOBAL_LEADERBOARD_TABLE)
    .select('*', { count: 'exact', head: true })
    .eq('difficulty', diff)
    .lt('score_ms', score);
  if (betterError) throw betterError;
  const { count: tieEarlierCount, error: tieError } = await supabaseClient
    .from(GLOBAL_LEADERBOARD_TABLE)
    .select('*', { count: 'exact', head: true })
    .eq('difficulty', diff)
    .eq('score_ms', score)
    .lt('created_at', createdAt);
  if (tieError) throw tieError;

  return {
    ...best,
    rank: Number(betterCount || 0) + Number(tieEarlierCount || 0) + 1
  };
}

async function refreshGlobalLeaderboards() {
  if (!supabaseClient) {
    renderGlobalColumn('ghs-easy', []);
    renderGlobalColumn('ghs-normal', []);
    renderGlobalColumn('ghs-hard', []);
    return;
  }
  try {
    const difficulties = ['easy', 'normal', 'hard'];
    const currentUserId = await getCurrentUserId();
    const { data, error } = await supabaseClient
      .from(GLOBAL_LEADERBOARD_TABLE)
      .select('user_id,player_name,difficulty,score_ms,created_at')
      .in('difficulty', difficulties)
      .order('score_ms', { ascending: true })
      .order('created_at', { ascending: true });
    if (error) throw error;

    const byDifficulty = { easy: [], normal: [], hard: [] };
    for (const row of data || []) {
      const key = row.difficulty;
      if (!(key in byDifficulty)) continue;
      if (byDifficulty[key].length >= GLOBAL_LEADERBOARD_MAX_ENTRIES) continue;
      byDifficulty[key].push(row);
    }
    const [ownEasy, ownNormal, ownHard] = currentUserId
      ? await Promise.all([
          fetchOwnRankedEntry('easy', currentUserId),
          fetchOwnRankedEntry('normal', currentUserId),
          fetchOwnRankedEntry('hard', currentUserId)
        ])
      : [null, null, null];
    renderGlobalColumn(
      'ghs-easy',
      byDifficulty.easy,
      currentUserId,
      shouldShowOwnRankRow(ownEasy) ? ownEasy : null
    );
    renderGlobalColumn(
      'ghs-normal',
      byDifficulty.normal,
      currentUserId,
      shouldShowOwnRankRow(ownNormal) ? ownNormal : null
    );
    renderGlobalColumn(
      'ghs-hard',
      byDifficulty.hard,
      currentUserId,
      shouldShowOwnRankRow(ownHard) ? ownHard : null
    );
  } catch (err) {
    setGlobalStatus(`Global leaderboard unavailable: ${err.message || 'Unknown error'}`);
  }
}

function initSupabaseClient() {
  if (!window.supabase || typeof window.supabase.createClient !== 'function') {
    setGlobalStatus('Global leaderboard unavailable offline');
    return;
  }
  try {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  } catch (err) {
    setGlobalStatus(`Supabase init failed: ${err.message || 'Unknown error'}`);
  }
}

async function ensureSupabaseSession() {
  if (!supabaseClient) return;
  try {
    const { data, error } = await supabaseClient.auth.getSession();
    if (error) throw error;
    if (!data.session) {
      const { error: signInError } = await supabaseClient.auth.signInAnonymously();
      if (signInError) throw signInError;
    }
  } catch (err) {
    setGlobalStatus(`Global auth unavailable: ${err.message || 'Unknown error'}`);
  }
}

async function submitGlobalScore(diff, ms, replay) {
  if (!supabaseClient) return;
  const playerName = await requestPlayerNameModal();
  if (!playerName) {
    setGlobalStatus('Global submit skipped (name required)');
    return;
  }
  try {
    const { error } = await supabaseClient.rpc('submit_score', {
      p_player_name: playerName,
      p_difficulty: diff,
      p_score_ms: Math.round(ms),
      p_replay_data: replay
    });
    if (error) {
      setGlobalStatus(`Global submit failed: ${error.message}`);
      return;
    }
    setGlobalStatus('Global score submitted');
    refreshGlobalLeaderboards();
  } catch (err) {
    setGlobalStatus(`Global submit failed: ${err.message || 'Unknown error'}`);
  }
}

async function initGlobalFeatures() {
  initSupabaseClient();
  await ensureSupabaseSession();
  await refreshGlobalLeaderboards();
}

/* ── Move mode ── */
let inputMode = 'insert'; // 'insert' | 'swap'

const modeDescriptions = {
  insert: 'Selected columns are inserted at the clicked position.',
  swap:   'Selected columns swap places with the clicked column.'
};

insertBtn.addEventListener('click', () => {
  inputMode = 'insert';
  insertBtn.classList.add('active');
  swapBtn.classList.remove('active');
  modeDesc.textContent = modeDescriptions.insert;
});

swapBtn.addEventListener('click', () => {
  inputMode = 'swap';
  swapBtn.classList.add('active');
  insertBtn.classList.remove('active');
  modeDesc.textContent = modeDescriptions.swap;
});

/* ── State ── */
const MIN_H = 44;
const ARENA_V_PAD = 6;
const TOUCH_DRAG_THRESHOLD = 8; // px – movement beyond this is treated as a drag

let values         = [];
let selSet         = new Set();
let isDragging        = false;
let suppressNextClick = false;
let dragStartIdx      = -1;
let dragCurrentIdx = -1;
let running        = false;
let finished       = false;
let gameReady      = false;
let startMs        = 0;
let tickId         = null;
let postWinTid     = null;

/* Touch drag-detection state */
let touchStartX = 0;
let touchStartY = 0;
let touchIsDrag = false;

/* ── Replay state ── */
let replayInitVals = [];  // snapshot of values[] taken at game start
let replayEvents   = [];  // recorded events: [absT, action, idx]
let replayTids     = [];  // setTimeout IDs for active replay
let isReplaying    = false;
let replayTickId   = null;
let replayStartMs  = 0;
let replayTotalMs  = 0;

/* Record a replay event (no-op before timer starts or after game ends) */
function recEvent(action, idx) {
  if (!startMs || finished) return;
  replayEvents.push([Date.now() - startMs, action, idx]);
}

function setSelection(nextSet, shouldRecord = true) {
  if (shouldRecord && !isReplaying) {
    const deselected = [];
    const selected   = [];
    for (const i of selSet) if (!nextSet.has(i)) deselected.push(i);
    for (const i of nextSet) if (!selSet.has(i)) selected.push(i);
    deselected.sort((a, b) => a - b).forEach(i => recEvent(ACT_DESELECT, i));
    selected.sort((a, b) => a - b).forEach(i => recEvent(ACT_SELECT, i));
  }
  selSet = nextSet;
}

/* ── Helpers ── */
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

function isSorted(arr) {
  for (let i = 1; i < arr.length; i++) if (arr[i] < arr[i - 1]) return false;
  return true;
}

function fmtTime(ms) {
  const totalS = Math.floor(ms / 1000);
  const m      = Math.floor(totalS / 60);
  const s      = totalS % 60;
  const tenth  = Math.floor((ms % 1000) / 100);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${tenth}`;
}

/* ── Heights ── */
function getStep() {
  const availH = arena.clientHeight - ARENA_V_PAD;
  const n = values.length;
  return n > 1 ? (availH - MIN_H) / (n - 1) : 0;
}

function rankToHeight(rank, step) {
  return MIN_H + (rank - 1) * step;
}

/* ── Drag range helper ── */
function getRange(a, b) {
  const s = new Set();
  const lo = Math.min(a, b), hi = Math.max(a, b);
  for (let i = lo; i <= hi; i++) s.add(i);
  return s;
}

/* ── Move selected bars to target position (insert mode) ── */
function moveSelectedTo(targetIdx) {
  if (selSet.size === 0 || selSet.has(targetIdx)) return;

  const selectedVals = Array.from(selSet)
    .sort((a, b) => a - b)
    .map(i => values[i]);

  const remainingPairs = values
    .map((v, i) => ({ v, i }))
    .filter(({ i }) => !selSet.has(i));

  // Insert the group just before the target column (adjusted for removed items)
  let insertAt = remainingPairs.findIndex(p => p.i >= targetIdx);
  if (insertAt === -1) insertAt = remainingPairs.length;

  values = [
    ...remainingPairs.slice(0, insertAt).map(p => p.v),
    ...selectedVals,
    ...remainingPairs.slice(insertAt).map(p => p.v)
  ];
}

/* ── Swap selected bars with target (swap mode) ── */
function swapSelectedWith(targetIdx) {
  if (selSet.size === 0 || selSet.has(targetIdx)) return;

  const selIndices = Array.from(selSet).sort((a, b) => a - b);
  const n = selIndices.length;

  if (n === 1) {
    // Simple single-bar swap
    const si = selIndices[0];
    [values[si], values[targetIdx]] = [values[targetIdx], values[si]];
    return;
  }

  // Block swap: collect n target indices starting from targetIdx, skipping selected
  const targetIndices = [];
  for (let i = targetIdx; targetIndices.length < n && i < values.length; i++) {
    if (!selSet.has(i)) targetIndices.push(i);
  }
  // If not enough going forward, fill from before targetIdx
  for (let i = targetIdx - 1; targetIndices.length < n && i >= 0; i--) {
    if (!selSet.has(i)) targetIndices.unshift(i);
  }

  const count      = Math.min(n, targetIndices.length);
  const selVals    = selIndices.slice(0, count).map(i => values[i]);
  const targetVals = targetIndices.slice(0, count).map(i => values[i]);
  for (let j = 0; j < count; j++) {
    values[selIndices[j]]    = targetVals[j];
    values[targetIndices[j]] = selVals[j];
  }
}

/* ── Apply move based on current mode ── */
function applyMove(targetIdx) {
  if (inputMode === 'swap') swapSelectedWith(targetIdx);
  else moveSelectedTo(targetIdx);
}

/* ── Check win condition ── */
function checkWin() {
  if (isSorted(values)) {
    finished        = true;
    gameReady       = false;
    const elapsed   = stopTimer();
    const t         = fmtTime(elapsed);
    timerEl.textContent     = t;
    finalTimeEl.textContent = `Time: ${t}`;
    const replay = packReplay(values.length, replayInitVals, replayEvents);
    saveScore(selectedDiff, elapsed, replay);
    submitGlobalScore(selectedDiff, elapsed, replay);
    overlay.classList.remove('fade-out');
    overlay.classList.add('show');
    scheduleReturnToPregame();
  }
}

/* ── Render ── */
function render() {
  const bars = barsHost.children;
  const step = getStep();
  for (let i = 0; i < bars.length; i++) {
    bars[i].style.height = rankToHeight(values[i], step) + 'px';
    bars[i].classList.toggle('sel',    !finished && selSet.has(i));
    bars[i].classList.toggle('sorted', finished);
  }
}

/* ── Shared release handler (mouse & touch) ── */
function handleRelease(wasDrag, releaseIdx) {
  isDragging = false;
  if (wasDrag) {
    suppressNextClick = true;
    setSelection(getRange(dragStartIdx, releaseIdx));
  } else {
    const clickedIdx = releaseIdx;
    if (selSet.size > 0) {
      if (selSet.has(clickedIdx)) {
        const next = new Set(selSet);
        next.delete(clickedIdx);
        setSelection(next);
      } else {
        recEvent(inputMode === 'swap' ? ACT_SWAP : ACT_MOVE, clickedIdx);
        applyMove(clickedIdx);
        setSelection(new Set());
        checkWin();
      }
    } else {
      setSelection(new Set([clickedIdx]));
    }
  }
  render();
}

/* ── Build DOM ── */
function buildBars(n) {
  barsHost.innerHTML = '';
  for (let i = 0; i < n; i++) {
    const bar = document.createElement('div');
    bar.className = 'bar';
    bar.dataset.idx = String(i);

    /* Mouse events */
    bar.addEventListener('mousedown', (e) => {
      if (finished || isReplaying || !gameReady) return;
      e.preventDefault();
      isDragging     = true;
      dragStartIdx   = i;
      dragCurrentIdx = i;
    });

    bar.addEventListener('mouseenter', () => {
      if (!isDragging) return;
      dragCurrentIdx = i;
      setSelection(getRange(dragStartIdx, i));
      render();
    });

    /* Touch start */
    bar.addEventListener('touchstart', (e) => {
      if (finished || isReplaying || !gameReady) return;
      e.preventDefault();
      isDragging     = true;
      dragStartIdx   = i;
      dragCurrentIdx = i;
      touchStartX    = e.touches[0].clientX;
      touchStartY    = e.touches[0].clientY;
      touchIsDrag    = false;
    }, { passive: false });

    barsHost.appendChild(bar);
  }
}

/* ── Document-level mouse events ── */
document.addEventListener('mouseup', () => {
  if (isReplaying) return;
  if (!isDragging) return;
  const wasDrag = dragCurrentIdx !== dragStartIdx;
  handleRelease(wasDrag, dragCurrentIdx);
});

document.addEventListener('click', (e) => {
  if (suppressNextClick) { suppressNextClick = false; return; }
  if (isReplaying || finished || selSet.size === 0) return;
  if (e.target && e.target.closest('.bar')) return;
  setSelection(new Set());
  render();
});

/* ── Document-level touch events ── */
document.addEventListener('touchmove', (e) => {
  if (!isDragging) return;
  e.preventDefault();
  const touch = e.touches[0];

  // Mark as a drag once the finger moves beyond the threshold
  if (!touchIsDrag) {
    const dx = touch.clientX - touchStartX;
    const dy = touch.clientY - touchStartY;
    if (Math.sqrt(dx * dx + dy * dy) > TOUCH_DRAG_THRESHOLD) {
      touchIsDrag = true;
    }
  }

  const el = document.elementFromPoint(touch.clientX, touch.clientY);
  if (el && el.classList.contains('bar')) {
    const bars = Array.from(barsHost.children);
    const idx  = bars.indexOf(el);
    if (idx !== -1 && idx !== dragCurrentIdx) {
      dragCurrentIdx = idx;
      setSelection(getRange(dragStartIdx, idx));
      render();
    }
  }
}, { passive: false });

document.addEventListener('touchend', () => {
  if (isReplaying) return;
  if (!isDragging) return;
  // Use the drag-threshold flag instead of index comparison so that a stationary
  // tap on a selected bar reliably triggers deselection on mobile.
  const wasDrag = touchIsDrag;
  touchIsDrag   = false;
  handleRelease(wasDrag, dragCurrentIdx);
});

document.addEventListener('touchcancel', () => {
  if (isReplaying) return;
  if (!isDragging) return;
  isDragging  = false;
  touchIsDrag = false;
  setSelection(new Set());
  render();
});

/* ── Timer ── */
function startTimer() {
  startMs = Date.now();
  running = true;
  tickId  = setInterval(() => {
    timerEl.textContent = fmtTime(Date.now() - startMs);
  }, 100);
}

function stopTimer() {
  clearInterval(tickId);
  tickId  = null;
  running = false;
  return Date.now() - startMs;
}

function scheduleReturnToPregame() {
  if (postWinTid) clearTimeout(postWinTid);
  postWinTid = setTimeout(() => {
    overlay.classList.add('fade-out');
    setTimeout(newGame, 350);
  }, 2000);
}

function startReplayTimer(totalMs) {
  replayTotalMs = totalMs;
  replayStartMs = Date.now();
  timerEl.textContent = fmtTime(0);
  stopReplayTimer(false);
  replayTickId = setInterval(() => {
    const elapsed = Math.min(Date.now() - replayStartMs, replayTotalMs);
    timerEl.textContent = fmtTime(elapsed);
  }, 100);
}

function stopReplayTimer(showFinal = true) {
  if (replayTickId) {
    clearInterval(replayTickId);
    replayTickId = null;
  }
  if (showFinal) {
    timerEl.textContent = fmtTime(replayTotalMs);
  }
}

function showPregameOverlay() {
  pregameOverlay.classList.add('show');
}

function hidePregameOverlay() {
  pregameOverlay.classList.remove('show');
}

function startPlay() {
  if (isReplaying || gameReady || finished || running) return;
  window.scrollTo({ top: 0, behavior: 'smooth' });
  hidePregameOverlay();
  gameReady = true;
  if (!running) startTimer();
}

/* ── New game ── */
function newGame() {
  if (postWinTid) {
    clearTimeout(postWinTid);
    postWinTid = null;
  }
  if (isReplaying) {
    replayTids.forEach(clearTimeout);
    replayTids   = [];
    isReplaying  = false;
    replayBanner.classList.remove('active');
  }
  stopReplayTimer(false);
  hidePregameOverlay();

  const n = selectedCols;

  values = Array.from({ length: n }, (_, k) => k + 1);
  shuffle(values);
  if (isSorted(values)) {
    [values[0], values[1]] = [values[1], values[0]];
  }

  replayInitVals = values.slice();
  replayEvents   = [];

  selSet         = new Set();
  isDragging     = false;
  dragStartIdx   = -1;
  dragCurrentIdx = -1;
  finished      = false;
  gameReady     = false;

  if (tickId) clearInterval(tickId);
  tickId  = null;
  running = false;
  startMs = 0;

  timerEl.textContent  = '00:00.0';
  overlay.classList.remove('fade-out');
  overlay.classList.remove('show');

  buildBars(n);
  requestAnimationFrame(render);
  showPregameOverlay();
}

/* ── Control listeners ── */
playBtn.addEventListener('click', startPlay);
replayStopBtn.addEventListener('click', stopReplay);

window.addEventListener('resize', render);

/* ── Replay playback ── */
function applyReplayEvent(type, args) {
  if (!isReplaying) return;
  switch (type) {
    case ACT_SELECT:
      selSet.add(args[0]);
      break;
    case ACT_DESELECT:
      selSet.delete(args[0]);
      break;
    case ACT_MOVE:
      inputMode = 'insert';
      applyMove(args[0]);
      selSet.clear();
      break;
    case ACT_SWAP:
      inputMode = 'swap';
      applyMove(args[0]);
      selSet.clear();
      break;
  }
  render();
}

function watchReplay(replay) {
  // Tear down any existing replay or running game
  if (isReplaying) {
    replayTids.forEach(clearTimeout);
    replayTids = [];
  }
  stopReplayTimer(false);
  if (tickId) { clearInterval(tickId); tickId = null; }
  running   = false;
  finished  = false;
  gameReady = false;
  selSet.clear();
  overlay.classList.remove('show');
  hidePregameOverlay();
  isReplaying = true;
  replayBanner.classList.add('active');

  const decodedReplay = unpackReplay(replay);
  if (!decodedReplay) {
    stopReplay();
    return;
  }

  // Restore initial state
  values = decodedReplay.init.slice();
  buildBars(decodedReplay.numBars);
  render();

  // Schedule each recorded event at its original timestamp
  const lastEvent = decodedReplay.events[decodedReplay.events.length - 1];
  const lastT = lastEvent ? lastEvent[0] : 0;
  startReplayTimer(lastT);
  for (const ev of decodedReplay.events) {
    const [t, type, idx] = ev;
    const tid = setTimeout(() => applyReplayEvent(type, [idx]), t);
    replayTids.push(tid);
  }

  // After all events, show the final sorted state
  const finTid = setTimeout(() => {
    if (!isReplaying) return;
    finished = true;
    stopReplayTimer(true);
    render();
  }, lastT + 400);
  replayTids.push(finTid);
}

function stopReplay() {
  replayTids.forEach(clearTimeout);
  replayTids  = [];
  stopReplayTimer(false);
  isReplaying = false;
  replayBanner.classList.remove('active');
  newGame();
}

/* ── Boot ── */
renderHighScores();
initGlobalFeatures();
newGame();
