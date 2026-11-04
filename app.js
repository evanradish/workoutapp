/* Workout app: browse BetterMe workouts, run them with timers, and track history.
   Everything is stored in this browser's localStorage. */
(function () {
  'use strict';

  const DATA = window.WORKOUT_DATA;
  const EX = DATA.exercises;
  const WORKOUTS = DATA.workouts;
  const BY_ID = Object.fromEntries(WORKOUTS.map(w => [w.id, w]));
  const LIBRARIES = [...new Set(WORKOUTS.map(w => w.library))];
  const LEVELS = ['Beginner', 'Medium', 'Advanced'];

  // ---------- storage ----------
  const DEFAULTS = {
    ready: 10,        // get-ready countdown before the first exercise
    restTimed: 15,    // rest after each exercise in workouts that have BetterMe timings
    workSecs: 40,     // work time for workouts that only list exercises
    restSecs: 20,     // rest for workouts that only list exercises
    warmSecs: 30,     // warm-up / cool-down moves in workouts without timings
    transition: 5,    // pause between warm-up / cool-down moves and between sides
    beeps: true,
    voice: true,
    tv: false,        // big-screen layout with remote-control navigation
  };
  function load(key, fallback) {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
    catch (e) { return fallback; }
  }
  function save(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* storage full or blocked */ }
  }
  let settings = Object.assign({}, DEFAULTS, load('wo.settings', {}));
  let history = load('wo.history', []);
  let favs = new Set(load('wo.favs', []));
  const ui = Object.assign({ lib: 'All', level: 'All', q: '' }, load('wo.ui', {}));

  // ---------- helpers ----------
  const $ = (sel, el = document) => el.querySelector(sel);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmtTime = s => { s = Math.max(0, Math.round(s)); const m = Math.floor(s / 60); return m + ':' + String(s % 60).padStart(2, '0'); };
  const fmtMin = s => Math.round(s / 60) + ' min';
  const dayKey = d => { const x = new Date(d); return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0'); };
  const isWarmCool = label => label === 'Warm-up' || label === 'Cool-down';

  function imgFor(ex, side) {
    if (!ex || !ex.img) return null;
    if (side === 'Right' && ex.imgR) return { src: ex.imgR, flip: false };
    return { src: ex.img, flip: side === 'Right' && !!ex.mirrorR };
  }
  function imgTag(ex, side, cls = '') {
    const im = imgFor(ex, side);
    if (!im) return `<div class="noimg ${cls}" aria-hidden="true">&#9711;</div>`;
    return `<img loading="lazy" class="${cls} ${im.flip ? 'flip' : ''}" src="${esc(im.src)}" alt="">`;
  }
  function coverEx(w) {
    const main = w.blocks.find(b => !isWarmCool(b.label)) || w.blocks[0];
    const pools = main ? [main.items, ...w.blocks.map(b => b.items)] : [];
    for (const items of pools) for (const id of items) if (EX[id] && EX[id].img) return EX[id];
    return null;
  }

  // ---------- turning a workout into timed steps ----------
  function buildSteps(w) {
    const steps = [];
    if (w.guided) {
      steps.push({ type: 'work', secs: w.minutes * 60, ex: { name: w.name + ' (guided session)' }, label: 'Guided session' });
      return withReady(steps);
    }
    const flat = [];
    w.blocks.forEach(b => {
      const rounds = b.rounds || [b.items.map(() => null)];
      rounds.forEach((r, ri) => {
        b.items.forEach((id, i) => {
          const ex = EX[id] || { name: id };
          const wc = isWarmCool(b.label);
          const secs = r[i] || (wc ? settings.warmSecs : settings.workSecs);
          const rest = wc ? settings.transition : (w.timed ? settings.restTimed : settings.restSecs);
          const label = (b.label || 'Workout') + (rounds.length > 1 ? ` · round ${ri + 1} of ${rounds.length}` : '');
          if (ex.sides) {
            flat.push({ ex, secs, side: 'Left', label, rest: settings.transition, switching: true });
            flat.push({ ex, secs, side: 'Right', label, rest });
          } else {
            flat.push({ ex, secs, side: null, label, rest });
          }
        });
      });
    });
    flat.forEach((s, i) => {
      steps.push({ type: 'work', secs: s.secs, ex: s.ex, side: s.side, label: s.label });
      const next = flat[i + 1];
      if (next && s.rest > 0) {
        steps.push({ type: 'rest', secs: s.rest, ex: next.ex, side: next.side, label: s.switching ? 'Switch sides' : 'Rest' });
      }
    });
    return withReady(steps);
  }
  function withReady(steps) {
    const first = steps[0];
    if (settings.ready > 0 && first) steps.unshift({ type: 'ready', secs: settings.ready, ex: first.ex, side: first.side, label: 'Get ready' });
    return steps;
  }
  const totalSecs = w => buildSteps(w).reduce((a, s) => a + s.secs, 0);

  // ---------- history ----------
  function timesDone(id) { return history.filter(h => h.workoutId === id).length; }
  function lastDone(id) { const h = history.filter(h => h.workoutId === id).sort((a, b) => b.date.localeCompare(a.date))[0]; return h && h.date; }
  function addHistory(entry) { history.push(entry); save('wo.history', history); }
  function streak() {
    const days = new Set(history.map(h => dayKey(h.date)));
    let d = new Date(); let n = 0;
    if (!days.has(dayKey(d))) d.setDate(d.getDate() - 1); // a streak is still alive if you trained yesterday
    while (days.has(dayKey(d))) { n++; d.setDate(d.getDate() - 1); }
    return n;
  }

  // ---------- views ----------
  const view = $('#view');
  function setTab(name) {
    document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === name));
  }

  function filtered() {
    const q = ui.q.trim().toLowerCase();
    return WORKOUTS.filter(w =>
      (ui.lib === 'All' || (ui.lib === 'Favorites' ? favs.has(w.id) : w.library === ui.lib)) &&
      (ui.level === 'All' || w.level === ui.level) &&
      (!q || (w.name + ' ' + w.library + ' ' + w.focus + ' ' + w.equipment).toLowerCase().includes(q) ||
        w.blocks.some(b => b.items.some(id => EX[id] && EX[id].name.toLowerCase().includes(q)))));
  }
  function renderList() {
    setTab('workouts');
    const libs = ['All', 'Favorites', ...LIBRARIES];
    view.innerHTML = `
      <h1>Workouts</h1>
      <input class="search" type="search" placeholder="Search workouts or exercises" value="${esc(ui.q)}">
      <div class="chips" id="libchips">${libs.map(l => `<button class="chip ${ui.lib === l ? 'on' : ''}" data-lib="${esc(l)}">${esc(l === 'Favorites' ? '★ Favorites' : l)}</button>`).join('')}</div>
      <div class="chips" id="lvlchips">${['All', ...LEVELS].map(l => `<button class="chip ${ui.level === l ? 'on' : ''}" data-level="${l}">${l === 'All' ? 'All levels' : l}</button>`).join('')}</div>
      <p class="muted small" id="count"></p>
      <div class="list" id="wlist"></div>`;
    const s = $('.search');
    s.addEventListener('input', () => { ui.q = s.value; save('wo.ui', ui); fillList(); });
    view.querySelectorAll('[data-lib]').forEach(b => b.onclick = () => {
      ui.lib = b.dataset.lib; save('wo.ui', ui);
      view.querySelectorAll('[data-lib]').forEach(x => x.classList.toggle('on', x === b)); fillList();
    });
    view.querySelectorAll('[data-level]').forEach(b => b.onclick = () => {
      ui.level = b.dataset.level; save('wo.ui', ui);
      view.querySelectorAll('[data-level]').forEach(x => x.classList.toggle('on', x === b)); fillList();
    });
    fillList();
    const chip = $('#libchips .chip.on'); if (chip) chip.scrollIntoView({ block: 'nearest', inline: 'center' });
    if (listScroll) { window.scrollTo(0, listScroll); }
  }
  function fillList() {
    const list = filtered();
    $('#count').textContent = list.length + ' workout' + (list.length === 1 ? '' : 's');
    const el = $('#wlist');
    el.innerHTML = list.map(card).join('') || '<p class="muted">No workouts match.</p>';
    el.querySelectorAll('.wcard').forEach(b => b.onclick = () => { listScroll = window.scrollY; location.hash = '#/w/' + b.dataset.id; });
  }
  function card(w) {
    const n = timesDone(w.id);
    return `<button class="wcard" data-id="${esc(w.id)}">
      ${imgTag(coverEx(w))}
      <div><div class="t">${favs.has(w.id) ? '★ ' : ''}${esc(w.name)}</div>
      <div class="m"><span class="lvl-${esc(w.level)}">${esc(w.level || '')}</span>${w.level ? ' · ' : ''}${w.minutes} min · ${esc(w.library)}</div>
      <div class="m">${esc(w.equipment || 'No equipment')}${n ? ` <span class="badge done">Done ×${n}</span>` : ''}</div></div>
    </button>`;
  }

  function renderDetail(id) {
    setTab('workouts');
    const w = BY_ID[id];
    if (!w) { location.hash = '#/'; return; }
    const est = totalSecs(w);
    const ld = lastDone(w.id);
    let body = '';
    if (w.guided) {
      body = `<div class="note">BetterMe runs this as one guided ${w.minutes}-minute session with no separate exercise list, so the app gives you a single ${w.minutes}-minute timer to follow along with.</div>`;
    }
    w.blocks.forEach(b => {
      const rounds = b.rounds ? b.rounds.length : 1;
      body += `<div class="block">${esc(b.label || 'Main set')}${rounds > 1 ? ` · ×${rounds} rounds` : ''}</div>`;
      b.items.forEach((eid, i) => {
        const ex = EX[eid] || { name: eid };
        let t;
        if (b.rounds) { const ts = [...new Set(b.rounds.map(r => r[i]))]; t = ts.map(x => x + 's').join(' / '); }
        else t = (isWarmCool(b.label) ? settings.warmSecs : settings.workSecs) + 's';
        body += `<div class="exrow">${imgTag(ex)}<div class="n">${esc(ex.name)}${ex.sides ? ' <span class="muted small">(each side)</span>' : ''}</div><div class="s">${t}</div></div>`;
      });
    });
    const missing = w.blocks.some(b => b.items.some(eid => EX[eid] && !EX[eid].img));
    view.innerHTML = `
      <button class="back">&larr; Workouts</button>
      <button class="star ${favs.has(w.id) ? 'on' : ''}" aria-label="Favorite">${favs.has(w.id) ? '★' : '☆'}</button>
      <h1>${esc(w.name)}</h1>
      <div class="muted small">${esc(w.library)}${w.focus ? ' · ' + esc(w.focus) : ''}</div>
      <div class="hero">
        <div class="stat"><b>${fmtMin(est)}</b><span>with rests</span></div>
        <div class="stat"><b class="lvl-${esc(w.level)}">${esc(w.level || '–')}</b><span>level</span></div>
        <div class="stat"><b>${w.kcal}</b><span>kcal (BetterMe)</span></div>
        <div class="stat"><b>${timesDone(w.id)}</b><span>${ld ? 'done, last ' + new Date(ld).toLocaleDateString() : 'times done'}</span></div>
      </div>
      <div class="muted small">Equipment: ${esc(w.equipment || 'none listed')}</div>
      ${!w.timed && !w.guided ? `<div class="note">BetterMe lists the exercises for this workout but not their timing, so each move runs ${settings.workSecs}s with ${settings.restSecs}s rest (warm-up and cool-down moves ${settings.warmSecs}s). You can change this in Settings.</div>` : ''}
      ${missing ? '<div class="note">Some exercises here had no BetterMe photo in your documents, so they show a placeholder.</div>' : ''}
      ${body}
      <div class="sticky-start"><button class="btn" id="start">Start workout</button></div>`;
    $('.back').onclick = () => { if (cameFromList) window.history.back(); else location.hash = '#/'; };
    $('.star').onclick = () => { favs.has(w.id) ? favs.delete(w.id) : favs.add(w.id); save('wo.favs', [...favs]); renderDetail(id); };
    $('#start').onclick = () => startPlayer(w);
  }

  function renderHistory() {
    setTab('history');
    const now = new Date();
    const weekStart = new Date(now); weekStart.setHours(0, 0, 0, 0); weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
    const thisWeek = history.filter(h => new Date(h.date) >= weekStart).length;
    const totalMin = Math.round(history.reduce((a, h) => a + (h.secs || 0), 0) / 60);
    // last 5 weeks calendar, Monday first
    const counts = {};
    history.forEach(h => { const k = dayKey(h.date); counts[k] = (counts[k] || 0) + 1; });
    const start = new Date(weekStart); start.setDate(start.getDate() - 28);
    let cal = ['M', 'T', 'W', 'T', 'F', 'S', 'S'].map(d => `<div class="hd">${d}</div>`).join('');
    for (let i = 0; i < 35; i++) {
      const d = new Date(start); d.setDate(start.getDate() + i);
      const c = counts[dayKey(d)] || 0;
      cal += `<div class="${c >= 2 ? 'l2' : c ? 'l1' : ''} ${dayKey(d) === dayKey(now) ? 'today' : ''}" title="${d.toDateString()}">${d.getDate()}</div>`;
    }
    const rows = [...history].sort((a, b) => b.date.localeCompare(a.date)).map(h => `
      <div class="hrow"><div><div>${esc(h.name)}${h.partial ? ' <span class="badge">partial</span>' : ''}</div>
      <div class="muted small">${new Date(h.date).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} · ${fmtTime(h.secs)} · ${h.done}/${h.total} exercises</div></div>
      <button class="del" data-del="${esc(h.id)}" aria-label="Delete">&#10005;</button></div>`).join('');
    view.innerHTML = `
      <h1>History</h1>
      <div class="stats">
        <div class="stat"><b>${streak()}</b><span>day streak</span></div>
        <div class="stat"><b>${thisWeek}</b><span>this week</span></div>
        <div class="stat"><b>${totalMin}</b><span>total min</span></div>
      </div>
      <h2>Last 5 weeks</h2>
      <div class="cal">${cal}</div>
      <h2>Sessions (${history.length})</h2>
      ${rows || '<p class="muted">Finish a workout and it will show up here.</p>'}`;
    view.querySelectorAll('[data-del]').forEach(b => b.onclick = () => {
      if (!confirm('Delete this session from your history?')) return;
      history = history.filter(h => h.id !== b.dataset.del); save('wo.history', history); renderHistory();
    });
  }

  function renderSettings() {
    setTab('settings');
    const num = (key, label, hint) => `<div class="set"><div>${label}<div class="muted small">${hint}</div></div><input type="number" min="0" max="600" data-key="${key}" value="${settings[key]}"></div>`;
    const tog = (key, label, hint) => `<div class="set"><div>${label}<div class="muted small">${hint}</div></div><button class="toggle ${settings[key] ? 'on' : ''}" data-tog="${key}" aria-label="${label}"></button></div>`;
    view.innerHTML = `
      <h1>Settings</h1>
      <h2>Timers (seconds)</h2>
      ${num('ready', 'Get ready', 'Countdown before the first exercise')}
      ${num('restTimed', 'Rest, timed workouts', 'Calisthenics workouts use BetterMe’s own exercise times')}
      ${num('workSecs', 'Exercise time, other workouts', 'For libraries where BetterMe lists no timing')}
      ${num('restSecs', 'Rest, other workouts', 'Between exercises in those workouts')}
      ${num('warmSecs', 'Warm-up / cool-down move', 'For workouts without timings')}
      ${num('transition', 'Quick transition', 'Between warm-up moves and between left and right sides')}
      <h2>Sound</h2>
      ${tog('beeps', 'Beeps', 'Countdown beeps for the last 3 seconds')}
      ${tog('voice', 'Voice', 'Says the next exercise out loud')}
      <h2>Display</h2>
      ${tog('tv', 'TV mode', 'Bigger layout for a TV, controlled with the remote’s arrow keys')}
      <h2>Your data</h2>
      <p class="muted small">History is saved in this browser on this device. Export a backup to move it to another device.</p>
      <button class="btn sec small" id="exp">Export history</button>
      <label class="btn sec small" style="margin-left:6px">Import<input id="imp" type="file" accept="application/json" hidden></label>
      <p class="muted small" style="margin-top:24px">${WORKOUTS.length} workouts · ${Object.keys(EX).length} exercises, from your BetterMe documents.</p>`;
    view.querySelectorAll('[data-key]').forEach(inp => inp.onchange = () => {
      const v = Math.max(0, Math.min(600, parseInt(inp.value, 10) || 0)); inp.value = v; settings[inp.dataset.key] = v; save('wo.settings', settings);
    });
    view.querySelectorAll('[data-tog]').forEach(b => b.onclick = () => {
      const key = b.dataset.tog; settings[key] = !settings[key]; save('wo.settings', settings);
      if (key === 'tv') document.documentElement.classList.toggle('tv', settings.tv || isTV);
      renderSettings(); const again = view.querySelector('[data-tog="' + key + '"]'); if (again) again.focus();
    });
    $('#exp').onclick = () => {
      const blob = new Blob([JSON.stringify({ history, favs: [...favs], settings }, null, 1)], { type: 'application/json' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'workout-history-' + dayKey(new Date()) + '.json'; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    };
    $('#imp').onchange = e => {
      const f = e.target.files[0]; if (!f) return;
      f.text().then(t => {
        const d = JSON.parse(t);
        const ids = new Set(history.map(h => h.id));
        const add = (d.history || []).filter(h => h && h.id && !ids.has(h.id));
        history = history.concat(add); save('wo.history', history);
        (d.favs || []).forEach(x => favs.add(x)); save('wo.favs', [...favs]);
        alert('Imported ' + add.length + ' session' + (add.length === 1 ? '' : 's') + '.');
      }).catch(() => alert('That file could not be read.'));
    };
  }

  // ---------- sound ----------
  let actx = null;
  function beep(freq = 880, dur = 0.12, vol = 0.25) {
    if (!settings.beeps) return;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      const o = actx.createOscillator(), g = actx.createGain();
      o.frequency.value = freq; o.connect(g); g.connect(actx.destination);
      g.gain.setValueAtTime(vol, actx.currentTime); g.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + dur);
      o.start(); o.stop(actx.currentTime + dur);
    } catch (e) { /* no audio */ }
  }
  function say(text) {
    if (!settings.voice) return;
    if (window.AndroidTTS) { try { window.AndroidTTS.speak(text); } catch (e) { } return; } // inside the Google TV app
    if (!window.speechSynthesis) return;
    try { speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(text); u.rate = 1.05; speechSynthesis.speak(u); } catch (e) { /* no speech */ }
  }

  // ---------- player ----------
  const P = $('#player');
  let run = null;
  let wakeLock = null;
  async function keepAwake(on) {
    try {
      if (on && 'wakeLock' in navigator && !wakeLock) { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => { wakeLock = null; }); }
      if (!on && wakeLock) { await wakeLock.release(); wakeLock = null; }
    } catch (e) { /* not supported */ }
  }
  document.addEventListener('visibilitychange', () => { if (run && !run.paused && document.visibilityState === 'visible') keepAwake(true); });

  function startPlayer(w) {
    try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); actx.resume(); } catch (e) { /* no audio */ }
    const steps = buildSteps(w);
    run = { w, steps, i: 0, endsAt: 0, remaining: steps[0].secs, paused: false, startedAt: Date.now(), active: 0, lastTick: Date.now(), lastBeep: null, timer: null, doneWork: new Set() };
    P.hidden = false; document.body.style.overflow = 'hidden';
    keepAwake(true);
    enterStep(0);
    run.timer = setInterval(tick, 200);
  }
  function enterStep(i) {
    const s = run.steps[i];
    run.i = i; run.remaining = s.secs; run.endsAt = Date.now() + s.secs * 1000; run.lastBeep = null;
    drawPlayer();
    const nm = s.ex.name + (s.side ? ', ' + s.side.toLowerCase() + ' side' : '');
    if (s.type === 'work') { beep(1320, 0.25, 0.3); say(nm); }
    else if (s.type === 'ready') say('Get ready. First up, ' + nm);
    else { beep(660, 0.2); say((s.label === 'Switch sides' ? 'Switch sides. ' : 'Rest. Next, ') + nm); }
  }
  function tick() {
    if (!run || run.paused) return;
    const now = Date.now();
    if (run.steps[run.i].type === 'work') run.active += (now - run.lastTick) / 1000;
    run.lastTick = now;
    let rem = (run.endsAt - now) / 1000;
    if (rem <= 0) {
      if (run.steps[run.i].type === 'work') run.doneWork.add(run.i);
      if (run.i + 1 >= run.steps.length) { finish(true); return; }
      enterStep(run.i + 1); return;
    }
    const whole = Math.ceil(rem);
    if (whole <= 3 && whole >= 1 && run.lastBeep !== whole) { run.lastBeep = whole; beep(880, 0.1); }
    run.remaining = rem;
    updateTimer();
  }
  function stepCounts() {
    const work = run.steps.map((s, i) => s.type === 'work' ? i : -1).filter(i => i >= 0);
    const pos = work.filter(i => i <= run.i).length;
    return { total: work.length, pos: Math.max(1, pos) };
  }
  function drawPlayer() {
    const s = run.steps[run.i];
    const c = stepCounts();
    // the next work step after this one, for the "up next" card
    let next = null;
    for (let j = run.i + 1; j < run.steps.length; j++) if (run.steps[j].type === 'work') { next = run.steps[j]; break; }
    const showing = s; // rest and ready steps show the upcoming exercise
    const phase = s.type === 'work' ? 'work' : s.type === 'ready' ? 'ready' : 'rest';
    const phaseText = s.type === 'work' ? s.label : s.type === 'ready' ? 'Get ready' : (s.label === 'Switch sides' ? 'Switch sides' : 'Rest · up next');
    const im = imgFor(showing.ex, showing.side);
    P.innerHTML = `
      <div class="p-top"><button class="x" id="px">&#10005; End</button><div class="p-prog"><i style="width:${(run.i / run.steps.length) * 100}%"></i></div><div class="p-count">${c.pos}/${c.total}</div></div>
      <div class="p-phase ${phase}">${esc(phaseText)}</div>
      <div class="p-img">${im ? `<img class="${im.flip ? 'flip' : ''}" src="${esc(im.src)}" alt="">` : `<div class="noimg"><span style="font-size:40px">&#9711;</span>${esc(showing.ex.name)}</div>`}</div>
      <div class="p-name">${esc(showing.ex.name)}</div>
      <div class="p-side">${showing.side ? esc(showing.side) + ' side' : ''}</div>
      <div class="p-timer"><div class="ring"><svg width="150" height="150" viewBox="0 0 150 150"><circle cx="75" cy="75" r="66" stroke="#20242d" stroke-width="10" fill="none"/><circle id="arc" cx="75" cy="75" r="66" stroke="${phase === 'work' ? '#ff6a3d' : phase === 'rest' ? '#3db8ff' : '#ffb03d'}" stroke-width="10" fill="none" stroke-linecap="round" stroke-dasharray="414.7" stroke-dashoffset="0"/></svg><div class="num" id="num"></div></div></div>
      <div class="p-next">${s.type === 'work' && next ? `${imgTag(next.ex, next.side)}<div><div class="muted small">Up next</div><div>${esc(next.ex.name)}${next.side ? ' · ' + next.side : ''}</div></div>` : s.type === 'work' ? '<div class="muted">Last exercise, finish strong!</div>' : `<div class="muted small">${esc(fmtTime(remainingTotal()))} left in workout</div>`}</div>
      <div class="p-ctrls"><button id="pprev" aria-label="Previous">&#9198;</button><button class="main" id="pplay">${run.paused ? '&#9654; Resume' : '&#10074;&#10074; Pause'}</button><button id="pnext" aria-label="Skip">&#9197;</button></div>`;
    $('#px').onclick = endEarly;
    const keepFocus = document.activeElement && document.activeElement.id;
    $('#pplay').onclick = togglePause;
    $('#pnext').onclick = () => { const cs = run.steps[run.i]; if (cs.type === 'work' && cs.secs - run.remaining > cs.secs / 2) run.doneWork.add(run.i); if (run.i + 1 >= run.steps.length) finish(true); else enterStep(run.i + 1); };
    $('#pprev').onclick = () => {
      // go back to the start of this step, or to the previous exercise if we are near the start
      const s0 = run.steps[run.i];
      let j = run.i;
      if (s0.secs - run.remaining < 3) { j = run.i - 1; while (j > 0 && run.steps[j].type !== 'work') j--; }
      enterStep(Math.max(0, j));
    };
    if (!P.querySelector('.dialog')) { const f = (keepFocus && $('#' + keepFocus)) || $('#pplay'); if (f) f.focus({ preventScroll: true }); }
    updateTimer();
  }
  function remainingTotal() {
    let t = run.remaining;
    for (let j = run.i + 1; j < run.steps.length; j++) t += run.steps[j].secs;
    return t;
  }
  function updateTimer() {
    const s = run.steps[run.i];
    const n = $('#num'), arc = $('#arc');
    if (!n) return;
    n.textContent = s.secs >= 120 ? fmtTime(run.remaining) : Math.ceil(run.remaining);
    arc.setAttribute('stroke-dashoffset', String(414.7 * (1 - run.remaining / s.secs)));
  }
  function togglePause() {
    if (run.paused) { run.paused = false; run.endsAt = Date.now() + run.remaining * 1000; run.lastTick = Date.now(); keepAwake(true); }
    else { run.paused = true; run.remaining = (run.endsAt - Date.now()) / 1000; try { speechSynthesis.cancel(); } catch (e) { } }
    drawPlayer();
  }
  function endEarly() {
    const wasPaused = run.paused; if (!wasPaused) togglePause();
    const st = run.steps[run.i];
    if (st.type === 'work' && st.secs - run.remaining > st.secs / 2) run.doneWork.add(run.i);
    const canSave = run.doneWork.size > 0;
    const d = document.createElement('div');
    d.className = 'dialog';
    d.innerHTML = `<div class="dbox"><h2>End this workout?</h2>
      <p class="muted">${canSave ? 'You finished ' + run.doneWork.size + ' of ' + stepCounts().total + ' exercises.' : 'Nothing has been completed yet.'}</p>
      <button class="btn" data-a="keep">Keep going</button>
      ${canSave ? '<button class="btn sec" data-a="save">Save and end</button>' : ''}
      <button class="btn sec" data-a="discard">${canSave ? 'End without saving' : 'End workout'}</button></div>`;
    P.appendChild(d);
    d.querySelector('[data-a="keep"]').focus();
    d.onclick = e => {
      const a = e.target.dataset && e.target.dataset.a; if (!a) return;
      d.remove();
      if (a === 'keep') { if (!wasPaused) togglePause(); }
      else if (a === 'save') finish(false);
      else closePlayer();
    };
  }
  function finish(complete) {
    clearInterval(run.timer);
    const c = stepCounts();
    const entry = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      workoutId: run.w.id, name: run.w.name, library: run.w.library,
      date: new Date().toISOString(), secs: Math.round((Date.now() - run.startedAt) / 1000),
      done: complete ? c.total : run.doneWork.size, total: c.total, partial: !complete,
    };
    addHistory(entry);
    beep(1320, 0.15); setTimeout(() => beep(1760, 0.3), 180);
    if (complete) say('Workout complete. Nice work!');
    keepAwake(false);
    P.innerHTML = `<div class="done-wrap"><div class="big">${complete ? '🎉' : '👍'}</div>
      <h1>${complete ? 'Workout complete' : 'Saved'}</h1>
      <p class="muted">${esc(run.w.name)}<br>${fmtTime(entry.secs)} · ${entry.done}/${entry.total} exercises · ${streak()} day streak</p>
      <button class="btn" id="pdone">Done</button></div>`;
    $('#pdone').onclick = () => { closePlayer(); location.hash = '#/history'; };
    $('#pdone').focus();
    run = null;
  }
  function closePlayer() {
    if (run) clearInterval(run.timer);
    run = null; P.hidden = true; P.innerHTML = ''; document.body.style.overflow = '';
    keepAwake(false); try { speechSynthesis.cancel(); } catch (e) { }
    route();
  }


  // ---------- TV remote / keyboard navigation ----------
  // Arrow keys move focus to the nearest button in that direction; Enter presses it; Back goes back.
  const isTV = !!window.AndroidTTS || /\b(TV|SMART-TV|SmartTV|AFT|BRAVIA|CrKey|GoogleTV|Android TV)\b/i.test(navigator.userAgent) ||
    (matchMedia('(pointer: none)').matches) || new URLSearchParams(location.search).has('tv');
  if (isTV || settings.tv) document.documentElement.classList.add('tv');
  const FOCUSABLE = 'button:not([disabled]), input, select, label.btn, [tabindex="0"]';
  function visible(el) { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden'; }
  function scope() { const dlg = P.querySelector('.dialog'); return dlg || (!P.hidden ? P : document.getElementById('app')); }
  function moveFocus(dir) {
    const els = [...scope().querySelectorAll(FOCUSABLE)].filter(visible);
    if (!els.length) return;
    const cur = document.activeElement;
    if (!cur || !els.includes(cur)) { els[0].focus(); return; }
    const a = cur.getBoundingClientRect();
    const ax = a.left + a.width / 2, ay = a.top + a.height / 2;
    let best = null, bestScore = Infinity;
    for (const el of els) {
      if (el === cur) continue;
      const b = el.getBoundingClientRect();
      const bx = b.left + b.width / 2, by = b.top + b.height / 2;
      const dx = bx - ax, dy = by - ay;
      let main, cross;
      if (dir === 'left') { if (b.right > a.left + 1) continue; main = -dx; cross = Math.abs(dy); }
      else if (dir === 'right') { if (b.left < a.right - 1) continue; main = dx; cross = Math.abs(dy); }
      else if (dir === 'up') { if (b.bottom > a.top + 1) continue; main = -dy; cross = Math.abs(dx); }
      else { if (b.top < a.bottom - 1) continue; main = dy; cross = Math.abs(dx); }
      const score = main + cross * 2.5;
      if (score < bestScore) { bestScore = score; best = el; }
    }
    if (best) { best.focus({ preventScroll: true }); best.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' }); }
  }
  function goBack() {
    if (!P.hidden) {
      const dlg = P.querySelector('.dialog');
      if (dlg) { dlg.querySelector('[data-a="keep"]').click(); return; }
      if (run) endEarly(); else { const d = $('#pdone'); if (d) d.click(); }
      return;
    }
    const h = location.hash || '#/';
    if (h.startsWith('#/w/')) $('.back').click();
    else if (h !== '#/') location.hash = '#/';
  }
  document.addEventListener('keydown', e => {
    const k = e.key;
    const typing = document.activeElement && document.activeElement.tagName === 'INPUT' && document.activeElement.type !== 'number';
    const dirs = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' };
    if (dirs[k]) {
      if (typing && (k === 'ArrowLeft' || k === 'ArrowRight')) return;
      e.preventDefault(); moveFocus(dirs[k]); return;
    }
    if (k === 'GoBack' || k === 'BrowserBack' || k === 'Escape' || (k === 'Backspace' && !typing)) { e.preventDefault(); goBack(); return; }
    if (run && !P.querySelector('.dialog')) {
      if (k === 'MediaPlayPause' || k === 'MediaPlay' || k === 'MediaPause' || (k === ' ' && document.activeElement.id !== 'pplay')) { e.preventDefault(); togglePause(); }
      else if (k === 'MediaTrackNext' || k === 'MediaFastForward') { e.preventDefault(); $('#pnext').click(); }
      else if (k === 'MediaTrackPrevious' || k === 'MediaRewind') { e.preventDefault(); $('#pprev').click(); }
    }
  });

  // ---------- routing ----------
  let listScroll = 0, cameFromList = false, lastRoute = null;
  function route() {
    if (run) return;
    const h = location.hash || '#/';
    cameFromList = h.startsWith('#/w/') && (lastRoute === '#/' || lastRoute === '');
    if (h === '#/' && !(lastRoute && lastRoute.startsWith('#/w/'))) listScroll = 0;
    lastRoute = h;
    window.scrollTo(0, 0);
    if (h.startsWith('#/w/')) renderDetail(decodeURIComponent(h.slice(4)));
    else if (h === '#/history') renderHistory();
    else if (h === '#/settings') renderSettings();
    else renderList();
    if (document.documentElement.classList.contains('tv')) {
      const f = (h.startsWith('#/w/') && $('#start')) || (lastFocusId && document.querySelector('[data-id="' + lastFocusId + '"]')) || $('.wcard') || view.querySelector(FOCUSABLE);
      if (f) { f.focus({ preventScroll: true }); f.scrollIntoView({ block: 'center' }); }
    }
  }
  let lastFocusId = null;
  document.addEventListener('focusin', e => { const c = e.target.closest && e.target.closest('.wcard'); if (c) lastFocusId = c.dataset.id; });
  window.addEventListener('hashchange', route);
  document.querySelectorAll('#tabs button').forEach(b => b.onclick = () => {
    location.hash = b.dataset.tab === 'workouts' ? '#/' : '#/' + b.dataset.tab;
  });
  route();

  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').catch(() => { });
  }
})();
