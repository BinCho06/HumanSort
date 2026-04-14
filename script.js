/* ── DOM refs ── */
const arena          = document.getElementById('arena');
const timerEl        = document.getElementById('timer');
const overlay        = document.getElementById('overlay');
const finalTimeEl    = document.getElementById('final-time');
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
});
settingsPanel.addEventListener('click', (e) => e.stopPropagation());
document.addEventListener('click', () => settingsPanel.classList.remove('open'));

/* ── High Scores ── */
const HS_KEY = 'humansort_scores';
const HS_MAX = 5;

function loadScores() {
  try {
    const data = JSON.parse(localStorage.getItem(HS_KEY)) || { easy: [], normal: [], hard: [] };
    // Normalize old format (plain numbers → objects)
    for (const key of ['easy', 'normal', 'hard']) {
      data[key] = (data[key] || []).map(s => typeof s === 'number' ? { ms: s, replay: null } : s);
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
          btn.addEventListener('click', () => watchReplay(r));
          div.appendChild(btn);
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
let isDragging     = false;
let dragStartIdx   = -1;
let dragCurrentIdx = -1;
let ctrlDeselect   = -1; // index of bar being ctrl+clicked to deselect, or -1
let running        = false;
let finished       = false;
let startMs        = 0;
let tickId         = null;

/* Touch drag-detection state */
let touchStartX = 0;
let touchStartY = 0;
let touchIsDrag = false;

/* ── Replay state ── */
let replayInitVals = [];  // snapshot of values[] taken at game start
let replayEvents   = [];  // recorded events: [absT, type, ...args]
                          //   type 0 = drag-select  args=[lo, hi]
                          //   type 1 = click-select  args=[idx]
                          //   type 3 = move          args=[targetIdx, isSwap(0|1), selIndices[]]
let replayTids     = [];  // setTimeout IDs for active replay
let isReplaying    = false;

/* Record a replay event (no-op before timer starts or after game ends) */
function recEvent(...args) {
  if (!startMs || finished) return;
  replayEvents.push([Date.now() - startMs, ...args]);
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
    const elapsed   = stopTimer();
    const t         = fmtTime(elapsed);
    timerEl.textContent     = t;
    finalTimeEl.textContent = `Time: ${t}`;
    const replay = { numBars: values.length, init: replayInitVals, events: replayEvents };
    saveScore(selectedDiff, elapsed, replay);
    overlay.classList.add('show');
  }
}

/* ── Render ── */
function render() {
  const bars = arena.children;
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
    const lo = Math.min(dragStartIdx, releaseIdx);
    const hi = Math.max(dragStartIdx, releaseIdx);
    selSet = getRange(dragStartIdx, releaseIdx);
    recEvent(0, lo, hi);
  } else {
    const clickedIdx = releaseIdx;
    if (selSet.size > 0) {
      if (selSet.has(clickedIdx)) {
        selSet.clear();
      } else {
        recEvent(3, clickedIdx, inputMode === 'swap' ? 1 : 0, Array.from(selSet).sort((a, b) => a - b));
        applyMove(clickedIdx);
        selSet.clear();
        checkWin();
      }
    } else {
      selSet = new Set([clickedIdx]);
      recEvent(1, clickedIdx);
    }
  }
  render();
}

/* ── Build DOM ── */
function buildBars(n) {
  arena.innerHTML = '';
  for (let i = 0; i < n; i++) {
    const bar = document.createElement('div');
    bar.className = 'bar';

    /* Mouse events */
    bar.addEventListener('mousedown', (e) => {
      if (finished || isReplaying) return;
      e.preventDefault();
      // Ctrl+click on a selected bar: deselect it instead of starting a drag
      if (e.ctrlKey && selSet.has(i)) {
        ctrlDeselect = i;
        return;
      }
      if (!running) startTimer();
      isDragging     = true;
      dragStartIdx   = i;
      dragCurrentIdx = i;
    });

    bar.addEventListener('mouseenter', () => {
      if (!isDragging) return;
      dragCurrentIdx = i;
      selSet = getRange(dragStartIdx, i);
      render();
    });

    /* Touch start */
    bar.addEventListener('touchstart', (e) => {
      if (finished || isReplaying) return;
      e.preventDefault();
      if (!running) startTimer();
      isDragging     = true;
      dragStartIdx   = i;
      dragCurrentIdx = i;
      touchStartX    = e.touches[0].clientX;
      touchStartY    = e.touches[0].clientY;
      touchIsDrag    = false;
    }, { passive: false });

    arena.appendChild(bar);
  }
}

/* ── Document-level mouse events ── */
document.addEventListener('mouseup', () => {
  if (isReplaying) return;
  if (ctrlDeselect !== -1) {
    selSet.delete(ctrlDeselect);
    ctrlDeselect   = -1;
    isDragging     = false;
    dragStartIdx   = -1;
    dragCurrentIdx = -1;
    render();
    return;
  }
  if (!isDragging) return;
  const wasDrag = dragCurrentIdx !== dragStartIdx;
  handleRelease(wasDrag, dragCurrentIdx);
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
    const bars = Array.from(arena.children);
    const idx  = bars.indexOf(el);
    if (idx !== -1 && idx !== dragCurrentIdx) {
      dragCurrentIdx = idx;
      selSet = getRange(dragStartIdx, idx);
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
  selSet.clear();
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

/* ── New game ── */
function newGame() {
  if (isReplaying) {
    replayTids.forEach(clearTimeout);
    replayTids   = [];
    isReplaying  = false;
    replayBanner.classList.remove('active');
  }

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

  if (tickId) clearInterval(tickId);
  tickId  = null;
  running = false;
  startMs = 0;

  timerEl.textContent  = '00:00.0';
  overlay.classList.remove('show');

  buildBars(n);
  requestAnimationFrame(render);
}

/* ── Control listeners ── */
document.getElementById('new-game-btn').addEventListener('click', newGame);
document.getElementById('play-again-btn').addEventListener('click', newGame);
replayStopBtn.addEventListener('click', stopReplay);

window.addEventListener('resize', render);

/* ── Replay playback ── */
function applyReplayEvent(type, args) {
  if (!isReplaying) return;
  switch (type) {
    case 0: // drag-select [lo, hi]
      selSet = getRange(args[0], args[1]);
      break;
    case 1: // click-select [idx]
      selSet = new Set([args[0]]);
      break;
    case 3: // move [targetIdx, isSwap, selIndices[]]
      selSet = new Set(args[2]);
      inputMode = args[1] ? 'swap' : 'insert';
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
  if (tickId) { clearInterval(tickId); tickId = null; }
  running   = false;
  finished  = false;
  selSet.clear();
  overlay.classList.remove('show');
  isReplaying = true;
  replayBanner.classList.add('active');

  // Restore initial state
  values = replay.init.slice();
  buildBars(replay.numBars);
  render();

  // Schedule each recorded event at its original timestamp
  for (const ev of replay.events) {
    const [t, type, ...args] = ev;
    const tid = setTimeout(() => applyReplayEvent(type, args), t);
    replayTids.push(tid);
  }

  // After all events, show the final sorted state
  const lastEvent = replay.events[replay.events.length - 1];
  const lastT = lastEvent ? lastEvent[0] : 0;
  const finTid = setTimeout(() => {
    if (!isReplaying) return;
    finished = true;
    render();
  }, lastT + 400);
  replayTids.push(finTid);
}

function stopReplay() {
  replayTids.forEach(clearTimeout);
  replayTids  = [];
  isReplaying = false;
  replayBanner.classList.remove('active');
  newGame();
}

/* ── Boot ── */
renderHighScores();
newGame();
