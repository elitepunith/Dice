  // ============================================================
  // CONFIG
  // ============================================================
  const CONFIG = Object.freeze({
    ROLL_MS:     640,   // must match --roll-ms in CSS
    MAX_HISTORY: 40,
    MAX_DICE:    3,
    MIN_DICE:    1,
    TOAST_MS:    2600,
  });

  // ============================================================
  // PIP LAYOUT TABLE
  // Face value → which of the 7 grid slots light up.
  // ============================================================
  const PIP_LAYOUT = Object.freeze({
    1: ['mc'],
    2: ['tl', 'br'],
    3: ['tl', 'mc', 'br'],
    4: ['tl', 'tr', 'bl', 'br'],
    5: ['tl', 'tr', 'mc', 'bl', 'br'],
    6: ['tl', 'tr', 'ml', 'mr', 'bl', 'br'],
  });

  const ALL_SLOTS = Object.freeze(['tl', 'tr', 'ml', 'mc', 'mr', 'bl', 'br']);

  // ============================================================
  // STATE — single object, all mutation through named functions
  // ============================================================
  const state = {
    diceCount:   1,
    values:      [1],
    rollCount:   0,
    rollSums:    [],
    streakCount: 0,     // current consecutive max-roll streak
    maxStreak:   0,     // all-time best streak
    isRolling:   false, // guard flag — prevents concurrent animations
  };

  // ============================================================
  // DOM — functions so refs are always fresh, never stale
  // ============================================================
  const DOM = {
    tray:         () => document.getElementById('tray'),
    rollBtn:      () => document.getElementById('rollBtn'),
    totalValue:   () => document.getElementById('totalValue'),
    totalTag:     () => document.getElementById('totalTag'),
    statTotal:    () => document.getElementById('statTotal'),
    statAvg:      () => document.getElementById('statAvg'),
    statBest:     () => document.getElementById('statBest'),
    statLow:      () => document.getElementById('statLow'),
    statStreak:   () => document.getElementById('statStreak'),
    historyStrip: () => document.getElementById('historyStrip'),
    toast:        () => document.getElementById('toast'),
    dice:         () => document.querySelectorAll('.die'),
    // All picker buttons across both sidebar AND mobile header
    pickerBtns:   () => document.querySelectorAll('.picker-btn'),
  };

  // ============================================================
  // UTILITIES
  // ============================================================

  /** Integer in [1, 6] */
  function rollD6() {
    return Math.floor(Math.random() * 6) + 1;
  }

  function sum(arr)   { return arr.reduce((a, b) => a + b, 0); }
  function maxOf(arr) { return arr.length ? Math.max(...arr) : null; }
  function minOf(arr) { return arr.length ? Math.min(...arr) : null; }

  function avg(arr) {
    if (!arr.length) return null;
    return Math.round((sum(arr) / arr.length) * 10) / 10;
  }

  function isValidFace(v)  { return Number.isInteger(v) && v >= 1 && v <= 6; }
  function isValidCount(n) { return Number.isInteger(n) && n >= CONFIG.MIN_DICE && n <= CONFIG.MAX_DICE; }

  // ============================================================
  // TOAST
  // ============================================================
  let _toastTimer = null;

  function showToast(msg) {
    if (typeof msg !== 'string' || !msg.trim()) return;
    const el = DOM.toast();
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(_toastTimer);
    _toastTimer = setTimeout(() => el.classList.remove('show'), CONFIG.TOAST_MS);
  }

  // ============================================================
  // RENDERING
  // ============================================================

  /** Build a single die DOM element with its pip grid */
  function createDieElement(index) {
    const die = document.createElement('div');
    die.className = 'die';
    die.dataset.index = index;
    die.setAttribute('role', 'img');
    die.setAttribute('tabindex', '0');
    die.setAttribute('aria-label', `Die ${index + 1}`);

    // Both click (desktop) and touch (mobile) fire 'click' on modern browsers
    die.addEventListener('click', () => rollSingle(index));

    // Allow keyboard users to activate a focused die
    die.addEventListener('keydown', e => {
      if (e.code === 'Enter' || e.code === 'Space') {
        e.preventDefault();
        rollSingle(index);
      }
    });

    const grid = document.createElement('div');
    grid.className = 'pip-grid';

    ALL_SLOTS.forEach(slot => {
      const pip = document.createElement('div');
      // 'mc' (middle-center) gets the red colour on face 1
      pip.className = `pip p-${slot}${slot === 'mc' ? ' pip--red' : ''}`;
      pip.dataset.slot = slot;
      grid.appendChild(pip);
    });

    die.appendChild(grid);
    return die;
  }

  /** Wipe and re-render the tray with the current dice count */
  function renderDice() {
    const tray = DOM.tray();
    tray.innerHTML = '';

    for (let i = 0; i < state.diceCount; i++) {
      const el = createDieElement(i);
      tray.appendChild(el);
      applyPips(el, state.values[i], false);  // show stored value immediately
    }

    refreshResult();
  }

  /**
   * Show the correct pip pattern on a die.
   * withDelay = true: waits until the roll animation finishes before revealing.
   */
  function applyPips(dieEl, value, withDelay = false) {
    if (!isValidFace(value)) {
      console.error('applyPips: invalid value', value);
      showToast('Unexpected error: bad die value.');
      return;
    }

    const active = PIP_LAYOUT[value];
    const delay  = withDelay ? CONFIG.ROLL_MS - 55 : 0;

    setTimeout(() => {
      dieEl.querySelectorAll('.pip').forEach(pip => {
        pip.classList.toggle('visible', active.includes(pip.dataset.slot));
      });
      dieEl.setAttribute('aria-label', `Die showing ${value}`);
    }, delay);
  }

  /** Refresh the large total number and jackpot state */
  function refreshResult() {
    const vals  = state.values.slice(0, state.diceCount);
    const total = sum(vals);
    const isMax = total === state.diceCount * 6;

    const valEl = DOM.totalValue();
    const tagEl = DOM.totalTag();

    valEl.textContent = total;
    valEl.classList.add('visible');
    valEl.classList.toggle('jackpot', isMax);

    tagEl.textContent = isMax ? '★  Maximum Roll  ★' : '';
    tagEl.classList.toggle('visible', isMax);
  }

  /** Update the five stat cells */
  function refreshStats() {
    DOM.statTotal().textContent  = state.rollCount;
    DOM.statAvg().textContent    = avg(state.rollSums)  ?? '—';
    DOM.statBest().textContent   = maxOf(state.rollSums) ?? '—';
    DOM.statLow().textContent    = minOf(state.rollSums) ?? '—';
    DOM.statStreak().textContent = state.maxStreak;
  }

  /** Append a badge to the history strip and trim to MAX_HISTORY */
  function pushBadge(total, isMax) {
    const strip = DOM.historyStrip();

    // Demote the previous "latest" badge styling
    const prev = strip.querySelector('.badge--latest');
    if (prev) prev.classList.remove('badge--latest');

    const badge = document.createElement('div');
    badge.className = 'badge badge--latest';
    badge.textContent = total;
    badge.setAttribute('role', 'listitem');
    badge.title = `Roll #${state.rollCount}: ${total}`;
    if (isMax) badge.classList.add('badge--max');

    strip.appendChild(badge);

    while (strip.children.length > CONFIG.MAX_HISTORY) {
      strip.removeChild(strip.firstChild);
    }

    // Auto-scroll so newest badge is always visible
    strip.scrollLeft = strip.scrollWidth;
  }

  /**
   * Sync the active/pressed state across ALL picker buttons —
   * there are two sets (sidebar + mobile header) and both need updating.
   */
  function refreshPickerUI() {
    DOM.pickerBtns().forEach(btn => {
      const active = parseInt(btn.dataset.count) === state.diceCount;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-pressed', String(active));
    });
  }

  // ============================================================
  // ROLL LOGIC
  // ============================================================

  /**
   * Core function — animate one die element and record a new value.
   * All roll functions call through here.
   */
  function triggerRoll(dieEl, index) {
    if (!dieEl) {
      console.error(`triggerRoll: no element at index ${index}`);
      return;
    }

    // Remove + force reflow + re-add so the animation fires even if
    // the class was already present (e.g. rapid taps)
    dieEl.classList.remove('rolling');
    void dieEl.offsetWidth;
    dieEl.classList.add('rolling');

    const value = rollD6();
    state.values[index] = value;

    applyPips(dieEl, value, true);
    setTimeout(() => dieEl.classList.remove('rolling'), CONFIG.ROLL_MS);
  }

  /** Roll all dice on the table */
  function rollAll() {
    if (state.isRolling) { showToast('Still rolling — hold on!'); return; }

    const dice = DOM.dice();

    // Sanity check: if DOM and state drifted somehow, re-render first
    if (dice.length !== state.diceCount) {
      console.warn('rollAll: dice count mismatch — re-rendering.');
      renderDice();
      return;
    }

    state.isRolling = true;
    DOM.rollBtn().disabled = true;

    dice.forEach((el, i) => triggerRoll(el, i));

    setTimeout(() => {
      state.isRolling = false;
      DOM.rollBtn().disabled = false;

      const vals  = state.values.slice(0, state.diceCount);
      const total = sum(vals);
      const isMax = total === state.diceCount * 6;
      const isMin = total === state.diceCount;

      // Streak tracking
      if (isMax) {
        state.streakCount++;
        if (state.streakCount > state.maxStreak) state.maxStreak = state.streakCount;
      } else {
        state.streakCount = 0;
      }

      state.rollCount++;
      state.rollSums.push(total);

      refreshResult();
      refreshStats();
      pushBadge(total, isMax);

      if (isMax) showToast('🎲 Maximum roll! All sixes!');
      else if (isMin) showToast('💀 Snake eyes!');
    }, CONFIG.ROLL_MS + 55);
  }

  /** Re-roll a single die — triggered by tapping/clicking a die */
  function rollSingle(index) {
    if (index < 0 || index >= state.diceCount) {
      console.error(`rollSingle: index ${index} out of range`);
      return;
    }
    if (state.isRolling) { showToast('Wait for the roll to finish.'); return; }

    const dieEl = DOM.dice()[index];
    if (!dieEl) {
      console.error(`rollSingle: no die at index ${index}`);
      showToast('Die not found. Try refreshing.');
      return;
    }

    state.isRolling = true;
    triggerRoll(dieEl, index);

    setTimeout(() => {
      state.isRolling = false;

      const vals  = state.values.slice(0, state.diceCount);
      const total = sum(vals);
      const isMax = total === state.diceCount * 6;

      state.rollCount++;
      state.rollSums.push(total);

      refreshResult();
      refreshStats();
      pushBadge(total, isMax);
    }, CONFIG.ROLL_MS + 55);
  }

  // ============================================================
  // DICE COUNT
  // ============================================================
  function setDiceCount(n) {
    if (!isValidCount(n)) {
      console.error(`setDiceCount: invalid value "${n}"`);
      showToast(`Dice must be ${CONFIG.MIN_DICE}–${CONFIG.MAX_DICE}.`);
      return;
    }
    if (n === state.diceCount) return; // no-op

    state.diceCount = n;

    // Grow array if needed — new dice start on a random face
    while (state.values.length < n) state.values.push(rollD6());

    refreshPickerUI();
    renderDice();
  }

  // ============================================================
  // RESET
  // ============================================================
  function resetEverything() {
    if (state.isRolling) { showToast('Cannot reset while rolling.'); return; }

    state.rollCount   = 0;
    state.rollSums    = [];
    state.streakCount = 0;
    state.maxStreak   = 0;
    state.values      = Array.from({ length: state.diceCount }, rollD6);

    DOM.historyStrip().innerHTML = '';

    const v = DOM.totalValue();
    v.classList.remove('visible', 'jackpot');
    v.textContent = '—';

    const t = DOM.totalTag();
    t.classList.remove('visible');
    t.textContent = '';

    refreshStats();
    renderDice();
    showToast('Reset — fresh start.');
  }

  function clearHistory() {
    DOM.historyStrip().innerHTML = '';
  }

  // ============================================================
  // KEYBOARD SHORTCUTS (desktop)
  // ============================================================
  document.addEventListener('keydown', e => {
    // Don't hijack keypresses when a button already has focus
    if (document.activeElement.tagName === 'BUTTON') return;

    switch (e.code) {
      case 'Space':
      case 'Enter':  e.preventDefault(); rollAll(); break;
      case 'KeyR':   e.preventDefault(); resetEverything(); break;
      case 'Digit1': rollSingle(0); break;
      case 'Digit2': if (state.diceCount >= 2) rollSingle(1); break;
      case 'Digit3': if (state.diceCount >= 3) rollSingle(2); break;
    }
  });

  // ============================================================
  // GLOBAL ERROR BOUNDARY
  // Shows a friendly toast instead of a silent broken screen.
  // ============================================================
  window.addEventListener('error', ev => {
    console.error('Uncaught:', ev.error);
    showToast('Something went wrong. Check the console.');
  });

  window.addEventListener('unhandledrejection', ev => {
    console.error('Unhandled rejection:', ev.reason);
    showToast('Async error. Check the console.');
  });

  // ============================================================
  // INIT
  // ============================================================
  (function init() {
    state.values = [rollD6()];
    renderDice();
    refreshStats();
  })();
</script>
