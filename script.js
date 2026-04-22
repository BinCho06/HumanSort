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
const replayPlayToggleBtn = document.getElementById('replay-play-toggle-btn');
const replayPauseIcon = document.getElementById('replay-icon-pause');
const replayPlayIcon  = document.getElementById('replay-icon-play');
const replaySpeedDownBtn  = document.getElementById('replay-speed-down-btn');
const replaySpeedUpBtn    = document.getElementById('replay-speed-up-btn');
const replaySpeedLabel    = document.getElementById('replay-speed-label');
const replaySeekSlider   = document.getElementById('replay-seek-slider');
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
const DIFFICULTY_STORAGE_KEY = 'humansort_selected_difficulty_cols';
let selectedCols = 20;
let selectedDiff = 'easy'; // 'easy' | 'normal' | 'hard'
const diffMap = { '20': 'easy', '30': 'normal', '50': 'hard' };

function getStoredDifficultyCols() {
  try {
    const raw = localStorage.getItem(DIFFICULTY_STORAGE_KEY);
    return raw && diffMap[raw] ? parseInt(raw, 10) : null;
  } catch {
    return null;
  }
}

function persistDifficultyCols(cols) {
  try {
    localStorage.setItem(DIFFICULTY_STORAGE_KEY, String(cols));
  } catch {
    // ignore localStorage failures
  }
}

function updateDifficultyButtons() {
  const activeValue = String(selectedCols);
  diffBtns.forEach((btn) => btn.classList.toggle('active', btn.dataset.cols === activeValue));
}

function setDifficulty(cols, { persist = true, startNew = true } = {}) {
  const normalized = String(cols);
  if (!diffMap[normalized]) return;
  selectedCols = parseInt(normalized, 10);
  selectedDiff = diffMap[normalized];
  updateDifficultyButtons();
  if (persist) persistDifficultyCols(selectedCols);
  if (startNew) newGame();
}

diffBtns.forEach((btn) => {
  btn.addEventListener('click', () => {
    setDifficulty(btn.dataset.cols);
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
const MAX_REPLAY_DELTA_MS = (2 ** 35) - 1; // 35 bits across max 5 varint bytes
const REPLAY_SPEED_STEPS = [0.1, 0.2, 0.5, 1, 1.5, 2, 4, 10, 100];
const REPLAY_DEFAULT_SPEED_INDEX = REPLAY_SPEED_STEPS.indexOf(1);
const REPLAY_FINISH_HOLD_MS = 400;
const SUPABASE_URL = 'https://ruwcxfppupahnzvzqrej.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ1d2N4ZnBwdXBhaG56dnpxcmVqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYzNjE2NDIsImV4cCI6MjA5MTkzNzY0Mn0.Z37HqSTx9O0vFaQMZrzRkQhaUTXyf4D5ZCAVtMxZs-E';
const ACT_SELECT   = 0;
const ACT_DESELECT = 1;
const ACT_MOVE     = 2;
const ACT_SWAP     = 3;
const REPLAY_DESELECT_ALL_IDX = 63;
const GLOBAL_REPLAY_CACHE_KEY = 'humansort_global_replay_cache_v1';
const GLOBAL_REPLAY_CACHE_MAX_ENTRIES = 200;
let supabaseClient = null;
const globalReplayCache = new Map();

function setGlobalStatus() {
  if (!globalStatusEl) return;
  const name = getStoredPlayerName();
  globalStatusEl.textContent = name ? `Player name: ${name}` : 'Player name: Not set';
}

function logGlobalStatusMessage(message = '') {
  if (!message) return;
  console.info(`[Global] ${message}`);
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

function encodeReplayDelta(deltaRaw) {
  let delta = Number(deltaRaw) || 0;
  if (delta < 0) delta = 0;
  if (delta > MAX_REPLAY_DELTA_MS) delta = MAX_REPLAY_DELTA_MS;
  delta = Math.floor(delta);

  const out = [];
  do {
    out.push(delta & 0x7f);
    delta = Math.floor(delta / 128);
  } while (delta > 0 && out.length < 5);

  for (let i = 0; i < out.length - 1; i++) out[i] |= 0x80;
  return out;
}

function decodeReplayDeltaVarint(bytes, offset) {
  let delta = 0;
  let factor = 1;
  let off = offset;
  for (let i = 0; i < 5; i++) {
    if (off >= bytes.length) return null;
    const b = bytes[off++];
    delta += (b & 0x7f) * factor;
    if ((b & 0x80) === 0) {
      return { delta, nextOffset: off };
    }
    factor *= 128;
  }
  return null;
}

function tryParseReplayEvents(bytes, startOffset, numBars) {
  const events = [];
  let t = 0;
  let off = startOffset;

  while (off < bytes.length) {
    const deltaInfo = decodeReplayDeltaVarint(bytes, off);
    if (!deltaInfo) return null;
    off = deltaInfo.nextOffset;

    if (off >= bytes.length) return null;
    const action = bytes[off++];
    const type = action >> 6;
    t += deltaInfo.delta;
    const idx = action & 0x3f;
    const isValidBarIndex = idx < numBars;
    const isDeselectAllToken = type === ACT_DESELECT && idx === REPLAY_DESELECT_ALL_IDX;
    if (!isValidBarIndex && !isDeselectAllToken) return null;
    events.push([t, type, idx]);
  }

  return events;
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
    out.push(...encodeReplayDelta(delta));
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

    let off = 1 + numBars;
    const events = tryParseReplayEvents(bytes, off, numBars);
    if (!events) return null;
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
  return `${safe(entry.difficulty)}|${safe(entry.user_id)}|${Number(entry.score_ms) || 0}`;
}

function loadGlobalReplayCacheFromStorage() {
  if (globalReplayCache.size > 0) return;
  try {
    const raw = localStorage.getItem(GLOBAL_REPLAY_CACHE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return;
    for (const [key, replay] of Object.entries(parsed)) {
      if (typeof replay === 'string' && replay) {
        globalReplayCache.set(key, replay);
      }
    }
  } catch {
    // Ignore cache read failures
  }
}

function persistGlobalReplayCache() {
  try {
    const compact = {};
    const skipCount = Math.max(0, globalReplayCache.size - GLOBAL_REPLAY_CACHE_MAX_ENTRIES);
    let index = 0;
    for (const [key, replay] of globalReplayCache.entries()) {
      if (index++ < skipCount) continue;
      compact[key] = replay;
    }
    localStorage.setItem(GLOBAL_REPLAY_CACHE_KEY, JSON.stringify(compact));
  } catch {
    // Ignore cache write failures
  }
}

function getCachedGlobalReplay(cacheKey) {
  if (globalReplayCache.has(cacheKey)) return globalReplayCache.get(cacheKey);
  loadGlobalReplayCacheFromStorage();
  return globalReplayCache.get(cacheKey) || null;
}

function setCachedGlobalReplay(cacheKey, replay) {
  if (!cacheKey || typeof replay !== 'string' || !replay) return;
  // Reinsert existing keys to keep Map insertion order aligned with recency.
  if (globalReplayCache.has(cacheKey)) globalReplayCache.delete(cacheKey);
  globalReplayCache.set(cacheKey, replay);
  while (globalReplayCache.size > GLOBAL_REPLAY_CACHE_MAX_ENTRIES) {
    const oldestKey = globalReplayCache.keys().next().value;
    if (oldestKey === undefined) break;
    globalReplayCache.delete(oldestKey);
  }
  persistGlobalReplayCache();
}

function shouldShowOwnRankRow(ownEntry) {
  return Boolean(ownEntry && Number(ownEntry.rank) > GLOBAL_LEADERBOARD_MAX_ENTRIES);
}

async function fetchGlobalReplayData(entry) {
  if (!supabaseClient || !entry) return null;
  const cacheKey = getGlobalReplayCacheKey(entry);
  const cached = getCachedGlobalReplay(cacheKey);
  if (cached) return cached;
  try {
    let query = supabaseClient
      .from(GLOBAL_LEADERBOARD_TABLE)
      .select('replay_data')
      .eq('difficulty', entry.difficulty)
      .eq('score_ms', Number(entry.score_ms) || 0);
    if (entry.user_id == null) query = query.is('user_id', null);
    else query = query.eq('user_id', entry.user_id);
    const { data, error } = await query.limit(1);
    if (error) throw error;
    const replay = (data && data[0] && typeof data[0].replay_data === 'string') ? data[0].replay_data : null;
    if (replay) setCachedGlobalReplay(cacheKey, replay);
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
    else {
      logGlobalStatusMessage('Replay unavailable for this score');
      setGlobalStatus();
    }
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
    .select('user_id,player_name,difficulty,score_ms')
    .eq('difficulty', diff)
    .eq('user_id', currentUserId)
    .order('score_ms', { ascending: true })
    .order('created_at', { ascending: true })
    .limit(1);
  if (bestError) throw bestError;
  const best = bestRows && bestRows[0];
  if (!best) return null;

  const score = Number(best.score_ms) || 0;
  const { count: betterCount, error: betterError } = await supabaseClient
    .from(GLOBAL_LEADERBOARD_TABLE)
    .select('*', { count: 'exact', head: true })
    .eq('difficulty', diff)
    .lt('score_ms', score);
  if (betterError) throw betterError;

  return {
    ...best,
    rank: Number(betterCount || 0) + 1
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
      .select('user_id,player_name,difficulty,score_ms')
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
    logGlobalStatusMessage(`Global leaderboard unavailable: ${err.message || 'Unknown error'}`);
    setGlobalStatus();
  }
}

function initSupabaseClient() {
  if (!window.supabase || typeof window.supabase.createClient !== 'function') {
    logGlobalStatusMessage('Global leaderboard unavailable offline');
    setGlobalStatus();
    return;
  }
  try {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  } catch (err) {
    logGlobalStatusMessage(`Supabase init failed: ${err.message || 'Unknown error'}`);
    setGlobalStatus();
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
    logGlobalStatusMessage(`Global auth unavailable: ${err.message || 'Unknown error'}`);
    setGlobalStatus();
  }
}

async function submitGlobalScore(diff, ms, replay) {
  if (!supabaseClient) return;
  const playerName = await requestPlayerNameModal();
  if (!playerName) {
    logGlobalStatusMessage('Global submit skipped (name required)');
    setGlobalStatus();
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
      logGlobalStatusMessage(`Global submit failed: ${error.message}`);
      setGlobalStatus();
      return;
    }
    logGlobalStatusMessage('Global score submitted');
    setGlobalStatus();
    refreshGlobalLeaderboards();
  } catch (err) {
    logGlobalStatusMessage(`Global submit failed: ${err.message || 'Unknown error'}`);
    setGlobalStatus();
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
let isReplaying    = false;
let replayAnimFrameId = null;
let replayDecoded = null;
let replayDurationMs = 0;
let replayVirtualMs = 0;
let replayLastFrameTs = 0;
let replayNextEventIdx = 0;
let replayIsPlaying = false;
let replaySpeedIndex = REPLAY_DEFAULT_SPEED_INDEX;
let replaySeekingWasPlaying = false;

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
    if (deselected.length > 0) {
      if (nextSet.size === 0) {
        recEvent(ACT_DESELECT, REPLAY_DESELECT_ALL_IDX);
      } else {
        deselected.sort((a, b) => a - b).forEach(i => recEvent(ACT_DESELECT, i));
      }
    }
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

  const selIndices = Array.from(selSet).sort((a, b) => a - b);
  const selectedVals = selIndices.map(i => values[i]);

  const remainingPairs = values
    .map((v, i) => ({ v, i }))
    .filter(({ i }) => !selSet.has(i));

  // Insert before target by default.
  let insertAt = remainingPairs.findIndex(p => p.i >= targetIdx);
  if (insertAt === -1) insertAt = remainingPairs.length;
  // Only nudge to after-target when clicking the immediate right-adjacent
  // column; without this special case the move is usually a no-op.
  if (targetIdx === selIndices[selIndices.length - 1] + 1) insertAt++;

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

function formatReplaySpeed(speed) {
  if (speed >= 100) return `${Math.round(speed)}x`;
  if (Number.isInteger(speed)) return `${speed}x`;
  return `${speed.toFixed(1).replace(/\.0$/, '')}x`;
}

function updateReplaySpeedUi() {
  const speed = REPLAY_SPEED_STEPS[replaySpeedIndex] || 1;
  if (replaySpeedLabel) replaySpeedLabel.textContent = formatReplaySpeed(speed);
}

function updateReplaySeekSlider() {
  if (!replaySeekSlider || !replayDecoded) return;
  const timelineTotalMs = getReplayTimelineTotalMs();
  replaySeekSlider.max   = String(Math.floor(timelineTotalMs));
  replaySeekSlider.value = String(Math.floor(Math.min(Math.max(replayVirtualMs, 0), timelineTotalMs)));
}

function updateReplayPlayToggleLabel() {
  if (!replayPlayToggleBtn) return;
  const timelineTotalMs = getReplayTimelineTotalMs();
  const atReplayEnd = !replayIsPlaying && replayVirtualMs >= timelineTotalMs;
  const actionLabel = replayIsPlaying ? 'Pause replay' : (atReplayEnd ? 'Play again' : 'Play replay');
  if (replayPauseIcon) replayPauseIcon.style.display = replayIsPlaying ? '' : 'none';
  if (replayPlayIcon) replayPlayIcon.style.display = replayIsPlaying ? 'none' : '';
  replayPlayToggleBtn.title = actionLabel;
  replayPlayToggleBtn.setAttribute('aria-label', actionLabel);
}

function getReplaySpeed() {
  return REPLAY_SPEED_STEPS[replaySpeedIndex] || 1;
}

function getReplayTimelineTotalMs() {
  return replayDurationMs + REPLAY_FINISH_HOLD_MS;
}

function stopReplayAnimation() {
  if (replayAnimFrameId !== null) {
    cancelAnimationFrame(replayAnimFrameId);
    replayAnimFrameId = null;
  }
  replayLastFrameTs = 0;
}

function updateReplayTimerDisplay() {
  timerEl.textContent = fmtTime(Math.min(Math.max(replayVirtualMs, 0), replayDurationMs));
  updateReplaySeekSlider();
}

function applyReplayEventsThroughCurrentTime() {
  if (!replayDecoded) return;
  while (
    replayNextEventIdx < replayDecoded.events.length &&
    replayDecoded.events[replayNextEventIdx][0] <= replayVirtualMs
  ) {
    const [, type, idx] = replayDecoded.events[replayNextEventIdx];
    applyReplayEvent(type, [idx]);
    replayNextEventIdx++;
  }
}

function finalizeReplayFrameIfDone() {
  if (replayVirtualMs < getReplayTimelineTotalMs()) return false;
  replayVirtualMs = getReplayTimelineTotalMs();
  updateReplayTimerDisplay();
  finished = true;
  replayIsPlaying = false;
  stopReplayAnimation();
  updateReplayPlayToggleLabel();
  render();
  return true;
}

function replayFrame(nowTs) {
  replayAnimFrameId = null;
  if (!isReplaying || !replayIsPlaying) return;

  if (!replayLastFrameTs) replayLastFrameTs = nowTs;
  const frameDelta = Math.max(0, nowTs - replayLastFrameTs);
  replayLastFrameTs = nowTs;
  replayVirtualMs += frameDelta * getReplaySpeed();

  applyReplayEventsThroughCurrentTime();
  if (finalizeReplayFrameIfDone()) return;
  updateReplayTimerDisplay();
  replayAnimFrameId = requestAnimationFrame(replayFrame);
}

function startReplayAnimation() {
  if (!isReplaying || !replayDecoded) return;
  if (replayIsPlaying) return;
  replayIsPlaying = true;
  replayLastFrameTs = 0;
  updateReplayPlayToggleLabel();
  if (replayAnimFrameId === null) replayAnimFrameId = requestAnimationFrame(replayFrame);
}

function pauseReplayAnimation() {
  replayIsPlaying = false;
  stopReplayAnimation();
  updateReplayPlayToggleLabel();
}

function restartReplay(autoPlay = true) {
  if (!replayDecoded) return;
  replayVirtualMs = 0;
  replayNextEventIdx = 0;
  replayLastFrameTs = 0;
  replayIsPlaying = false;
  stopReplayAnimation();
  finished = false;
  gameReady = false;
  running = false;
  selSet.clear();

  values = replayDecoded.init.slice();
  buildBars(replayDecoded.numBars);
  render();
  updateReplayTimerDisplay();
  updateReplayPlayToggleLabel();

  if (autoPlay) startReplayAnimation();
}

function setReplaySpeedByIndex(nextIndex) {
  const parsed = Number(nextIndex);
  const normalized = Number.isFinite(parsed) ? Math.floor(parsed) : REPLAY_DEFAULT_SPEED_INDEX;
  const clamped = Math.max(0, Math.min(REPLAY_SPEED_STEPS.length - 1, normalized));
  replaySpeedIndex = clamped;
  updateReplaySpeedUi();
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
  stopReplayAnimation();
  replayDecoded = null;
  replayDurationMs = 0;
  replayVirtualMs = 0;
  replayNextEventIdx = 0;
  replayIsPlaying = false;
  isReplaying = false;
  replayBanner.classList.remove('active');
  updateReplayPlayToggleLabel();
  updateReplaySpeedUi();
  if (replaySeekSlider) { replaySeekSlider.value = '0'; replaySeekSlider.max = '100000'; }
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
if (replayPlayToggleBtn) replayPlayToggleBtn.addEventListener('click', toggleReplayPlayback);
if (replaySpeedDownBtn) replaySpeedDownBtn.addEventListener('click', () => setReplaySpeedByIndex(replaySpeedIndex - 1));
if (replaySpeedUpBtn) replaySpeedUpBtn.addEventListener('click', () => setReplaySpeedByIndex(replaySpeedIndex + 1));
if (replaySeekSlider) {
  replaySeekSlider.addEventListener('pointerdown', () => {
    if (!isReplaying) return;
    replaySeekingWasPlaying = replayIsPlaying;
    if (replayIsPlaying) pauseReplayAnimation();
  });
  replaySeekSlider.addEventListener('input', () => {
    if (!replayDecoded) return;
    seekReplayTo(Number(replaySeekSlider.value));
  });
  replaySeekSlider.addEventListener('pointerup', () => {
    if (!isReplaying) return;
    if (replaySeekingWasPlaying) startReplayAnimation();
    replaySeekingWasPlaying = false;
  });
}

window.addEventListener('resize', render);

/* ── Replay playback ── */
function applyReplayEventRaw(type, idx) {
  switch (type) {
    case ACT_SELECT:   selSet.add(idx); break;
    case ACT_DESELECT:
      if (idx === REPLAY_DESELECT_ALL_IDX) selSet.clear();
      else selSet.delete(idx);
      break;
    case ACT_MOVE:
      inputMode = 'insert';
      applyMove(idx);
      selSet.clear();
      break;
    case ACT_SWAP:
      inputMode = 'swap';
      applyMove(idx);
      selSet.clear();
      break;
  }
}

function applyReplayEvent(type, args) {
  if (!isReplaying) return;
  applyReplayEventRaw(type, args[0]);
  render();
}

function seekReplayTo(targetMs) {
  if (!replayDecoded) return;
  const timelineTotalMs = getReplayTimelineTotalMs();
  const clampedMs = Math.max(0, Math.min(targetMs, timelineTotalMs));

  values = replayDecoded.init.slice();
  selSet.clear();
  finished = false;
  replayNextEventIdx = 0;
  replayVirtualMs = clampedMs;

  for (const [t, type, idx] of replayDecoded.events) {
    if (t > clampedMs) break;
    applyReplayEventRaw(type, idx);
    replayNextEventIdx++;
  }

  if (clampedMs >= timelineTotalMs) {
    finished = true;
    replayIsPlaying = false;
    stopReplayAnimation();
    updateReplayPlayToggleLabel();
  }

  render();
  updateReplayTimerDisplay();
}

function watchReplay(replay) {
  stopReplayAnimation();
  if (tickId) { clearInterval(tickId); tickId = null; }
  running   = false;
  finished  = false;
  gameReady = false;
  selSet.clear();
  overlay.classList.remove('show');
  hidePregameOverlay();

  const decodedReplay = unpackReplay(replay);
  if (!decodedReplay) {
    stopReplay();
    return;
  }

  replayDecoded = decodedReplay;
  isReplaying = true;
  replayBanner.classList.add('active');
  setReplaySpeedByIndex(REPLAY_DEFAULT_SPEED_INDEX);
  const lastEvent = decodedReplay.events[decodedReplay.events.length - 1];
  replayDurationMs = lastEvent ? lastEvent[0] : 0;
  if (replaySeekSlider) { replaySeekSlider.max = String(Math.floor(getReplayTimelineTotalMs())); replaySeekSlider.value = '0'; }
  restartReplay(true);
}

function stopReplay() {
  stopReplayAnimation();
  replayDecoded = null;
  replayDurationMs = 0;
  replayVirtualMs = 0;
  replayNextEventIdx = 0;
  replayIsPlaying = false;
  isReplaying = false;
  replayBanner.classList.remove('active');
  updateReplayPlayToggleLabel();
  newGame();
}

function toggleReplayPlayback() {
  if (!isReplaying || !replayDecoded) return;
  if (replayIsPlaying) pauseReplayAnimation();
  else if (replayVirtualMs >= getReplayTimelineTotalMs()) restartReplay(true);
  else startReplayAnimation();
}

/* ── Boot ── */
renderHighScores();
initGlobalFeatures();
const storedDifficultyCols = getStoredDifficultyCols();
if (storedDifficultyCols !== null) setDifficulty(storedDifficultyCols, { persist: false, startNew: false });
else updateDifficultyButtons();
newGame();
