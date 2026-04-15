/* ── DOM refs ── */
const arena          = document.getElementById('arena');
const barsHost       = document.getElementById('bars');
const pregameOverlay = document.getElementById('pregame-overlay');
const timerEl        = document.getElementById('timer');
const overlay        = document.getElementById('overlay');
const finalTimeEl    = document.getElementById('final-time');
const newGameBtn     = document.getElementById('new-game-btn');
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
const HS_MAX = 5;
const ACT_SELECT   = 0;
const ACT_DESELECT = 1;
const ACT_MOVE     = 2;
const ACT_SWAP     = 3;

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
    overlay.classList.add('show');
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
  if (isReplaying || gameReady || finished) return;
  hidePregameOverlay();
  gameReady = true;
  if (!running) startTimer();
}

/* ── New game ── */
function newGame() {
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
  overlay.classList.remove('show');

  buildBars(n);
  requestAnimationFrame(render);
  showPregameOverlay();
}

/* ── Control listeners ── */
newGameBtn.addEventListener('click', startPlay);
document.getElementById('play-again-btn').addEventListener('click', newGame);
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
newGame();
