  const GREEN = '#1D9E75';

  // ── LocalStorage helpers (always parse to correct type) ──────────────────
  function loadBool(key, def) {
    const v = localStorage.getItem(key);
    // localStorage always returns strings; "true"=true, "false"=false, null=default
    if (v === null) return def;
    return v === 'true';
  }
  function loadInt(key, def) {
    const v = parseInt(localStorage.getItem(key));
    return isNaN(v) ? def : v;
  }
  function loadStr(key, def) {
    return localStorage.getItem(key) ?? def;
  }
  function save(key, value) {
    localStorage.setItem(key, value);
  }

  // ── State (loaded from localStorage, properly typed) ─────────────────────
  let tickOn        = loadBool('tickOn',        false);
  let alertOn       = loadBool('alertOn',       false);
  let loopOn        = loadBool('loopOn',        false);
  let settingsOpen  = loadBool('settingsOpen',  false);
  let selectedSound = loadStr ('selectedSound', 'chime');
  let unit          = loadStr ('unit',          'sec');
  let intervalSec   = loadInt ('intervalSec',   30);
  let alertElapsed  = 0;
  let lastSec       = -1;
  let audioUnlocked = false;

  // Repeat form state
  // days: null = once, [0..6] array = specific days (0=Sun)
  let formRepeatDays = null; // null = once, [] populated = custom/preset days

  // ── AudioContext ──────────────────────────────────────────────────────────
  const actx = new (window.AudioContext || window.webkitAudioContext)();

  // Browsers suspend AudioContext until a user gesture — show banner if so
  function checkAudioState() {
    if (actx.state === 'suspended' && (tickOn || alertOn)) {
      document.getElementById('audioBanner').classList.add('show');
    }
  }

  function unlockAudio() {
    actx.resume().then(() => {
      audioUnlocked = true;
      document.getElementById('audioBanner').classList.remove('show');
    });
  }

  // ── Colour helpers ────────────────────────────────────────────────────────
  function applyGreen(el) {
    el.style.backgroundColor = GREEN;
    el.style.color = '#ffffff';
    el.style.borderColor = GREEN;
  }
  function removeGreen(el) {
    el.style.backgroundColor = '';
    el.style.color = '';
    el.style.borderColor = '';
  }

  // ── Clock ─────────────────────────────────────────────────────────────────
  const days   = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const DAY_SHORT = ['Su','Mo','Tu','We','Th','Fr','Sa'];
  function pad(n) { return String(n).padStart(2, '0'); }

  function updateClock() {
    const now = new Date();
    const s   = now.getSeconds();
    const m   = now.getMinutes();
    const h12 = now.getHours() % 12 || 12;

    document.getElementById('hh').textContent = pad(h12);
    document.getElementById('mm').textContent = pad(m);
    document.getElementById('ss').textContent = pad(s);
    document.getElementById('ampm').textContent = now.getHours() < 12 ? 'AM' : 'PM';
    document.getElementById('dateLabel').textContent =
      days[now.getDay()].slice(0,3) + ', ' + months[now.getMonth()] + ' ' + now.getDate();
    document.getElementById('secRing').style.strokeDashoffset = 753.98 * (1 - s / 60);
    document.getElementById('minRing').style.strokeDashoffset = 615.75 * (1 - (m * 60 + s) / 3600);

    if (s !== lastSec) {
      lastSec = s;
      checkAlarms(now);

      if (tickOn && actx.state === 'running') {
        playTick();
        const d = document.getElementById('tickDot');
        d.style.color = GREEN;
        setTimeout(() => { const dd = document.getElementById('tickDot'); if (dd) dd.style.color = tickOn ? GREEN : ''; }, 120);
      }

      if (alertOn) {
        alertElapsed++;
        updateProgress();
        if (alertElapsed >= intervalSec) {
          const bar = document.getElementById('progressBar');
          const nextLbl = document.getElementById('nextLabel');
          // Show "Next alert in 0s" and fill to 100%
          if (nextLbl) nextLbl.textContent = 'Next alert in 0s';
          if (bar) bar.style.width = '100%';
          // Prevent re-entry while waiting for the transition
          alertElapsed = -999999;
          // After the 1s CSS transition finishes, play sound then reset
          setTimeout(() => {
            if (actx.state === 'running') playAlertSound(selectedSound);
            // Instantly snap bar back to 0% without animating
            const b = document.getElementById('progressBar');
            if (b) {
              b.classList.add('no-transition');
              b.style.width = '0%';
              requestAnimationFrame(() => {
                requestAnimationFrame(() => b.classList.remove('no-transition'));
              });
            }
            if (loopOn) {
              alertElapsed = 0;
            } else {
              alertOn = false;
              save('alertOn', false);
              updateAlertUI();
            }
          }, 1000);
        }
      }
    }
  }

  // ── Settings panel ────────────────────────────────────────────────────────
  function toggleSettings() {
    settingsOpen = !settingsOpen;
    save('settingsOpen', settingsOpen);
    renderSettingsUI();
  }

  function renderSettingsUI() {
    document.getElementById('settingsPanel').classList.toggle('visible', settingsOpen);
    document.getElementById('toggleSettingsBtn').classList.toggle('open', settingsOpen);
    document.getElementById('toggleLabel').textContent = settingsOpen ? 'Hide settings' : 'Show settings';
  }

  // ── Progress bar ──────────────────────────────────────────────────────────
  function updateProgress() {
    // alertElapsed is set to -999999 during the fire/reset window — skip update
    if (alertElapsed < 0) return;
    const bar = document.getElementById('progressBar');
    const lbl = document.getElementById('nextLabel');
    if (!bar || !lbl) return;
    const pct = Math.min((alertElapsed / intervalSec) * 100, 100);
    bar.style.width = pct + '%';
    const rem = Math.max(intervalSec - alertElapsed, 0);
    const rMin = Math.floor(rem / 60), rSec = rem % 60;
    lbl.textContent =
      'Next alert in ' + (unit === 'sec' ? rem + 's' : (rMin > 0 ? rMin + 'm ' : '') + rSec + 's');
  }

  // ── Unit toggle ───────────────────────────────────────────────────────────
  function setUnit(u, skipSave) {
    unit = u;
    if (!skipSave) save('unit', u);

    const secBtn = document.getElementById('unitSec');
    const minBtn = document.getElementById('unitMin');
    if (u === 'sec') { applyGreen(secBtn); removeGreen(minBtn); }
    else             { applyGreen(minBtn); removeGreen(secBtn); }

    document.getElementById('unitHint').textContent = u === 'sec' ? 'sec' : 'min';

    const sl = document.getElementById('intervalSlider');
    const ni = document.getElementById('intervalNum');

    if (u === 'sec') {
      sl.min = 5; sl.max = 300; sl.step = 5;
      ni.min = 5; ni.max = 300;
      // display current intervalSec directly
      const disp = Math.min(Math.max(intervalSec, 5), 300);
      sl.value = disp; ni.value = disp;
      document.getElementById('intervalDisplay').textContent = disp;
      document.getElementById('intervalUnit').textContent = 's';
    } else {
      sl.min = 1; sl.max = 60; sl.step = 1;
      ni.min = 1; ni.max = 60;
      // convert stored seconds → minutes for display
      const disp = Math.min(Math.max(Math.round(intervalSec / 60), 1), 60);
      sl.value = disp; ni.value = disp;
      document.getElementById('intervalDisplay').textContent = disp;
      document.getElementById('intervalUnit').textContent = 'm';
    }

    alertElapsed = 0;
    const pb = document.getElementById('progressBar'); if (pb) pb.style.width = '0%';
  }

  function syncFromSlider(v) {
    v = parseInt(v);
    document.getElementById('intervalNum').value = v;
    applyInterval(v);
  }
  function syncFromNum(v) {
    v = parseInt(v);
    if (isNaN(v)) return;
    const sl = document.getElementById('intervalSlider');
    const c  = Math.min(Math.max(v, parseInt(sl.min)), parseInt(sl.max));
    sl.value = c;
    applyInterval(c);
  }
  function applyInterval(v) {
    intervalSec = unit === 'sec' ? v : v * 60;
    save('intervalSec', intervalSec);
    alertElapsed = 0;
    document.getElementById('intervalDisplay').textContent = v;
    const pb3 = document.getElementById('progressBar'); if (pb3) pb3.style.width = '0%';
    if (alertOn) {
      const nl2 = document.getElementById('nextLabel');
      if (nl2) nl2.textContent = 'Reset — next alert in ' + (unit === 'sec' ? v + 's' : v + 'm 0s');
    }
  }

  // ── Tick ──────────────────────────────────────────────────────────────────
  function toggleTick() {
    actx.resume();  // attempt unlock on user gesture
    tickOn = !tickOn;
    save('tickOn', tickOn);
    renderTickUI();
    document.getElementById('audioBanner').classList.remove('show');
  }
  function renderTickUI() {
    const b   = document.getElementById('tickBtn');
    const dot = document.getElementById('tickDot');
    if (tickOn) {
      b.innerHTML = '<i class="ti ti-volume"></i> Tick: On';
      applyGreen(b);
      dot.innerHTML = '<i class="ti ti-volume"></i>';
      dot.style.color = GREEN;
    } else {
      b.innerHTML = '<i class="ti ti-volume-off"></i> Tick: Off';
      removeGreen(b);
      dot.innerHTML = '<i class="ti ti-volume-off"></i>';
      dot.style.color = '';
    }
  }

  // ── Alert ─────────────────────────────────────────────────────────────────
  function toggleAlert() {
    actx.resume();  // attempt unlock on user gesture
    alertOn = !alertOn;
    save('alertOn', alertOn);
    if (alertOn) alertElapsed = 0;
    updateAlertUI();
    document.getElementById('audioBanner').classList.remove('show');
  }
  function updateAlertUI() {
    const b     = document.getElementById('alertToggleBtn');
    const badge = document.getElementById('alertBadge');
    const dot   = document.getElementById('alertDot');
    if (alertOn) {
      b.innerHTML = '<i class="ti ti-bell-ringing"></i> Alert: On';
      applyGreen(b);
      applyGreen(badge);
      dot.style.color = GREEN;
      const pb1 = document.getElementById('progressBar'); if (pb1) pb1.style.width = '0%';
    } else {
      b.innerHTML = '<i class="ti ti-bell"></i> Alert: Off';
      removeGreen(b);
      removeGreen(badge);
      dot.style.color = '';
      const pb2 = document.getElementById('progressBar'); if (pb2) pb2.style.width = '0%';
      const nl = document.getElementById('nextLabel'); if (nl) nl.textContent = 'Enable alert to start countdown';
    }
  }

  // ── Loop ──────────────────────────────────────────────────────────────────
  function toggleLoop() {
    loopOn = !loopOn;
    save('loopOn', loopOn);
    renderLoopUI();
  }
  function renderLoopUI() {
    const b   = document.getElementById('loopBtn');
    const dot = document.getElementById('loopDot');
    if (loopOn) {
      b.innerHTML = '<i class="ti ti-repeat"></i> Loop: On';
      applyGreen(b);
      dot.style.color = GREEN;
    } else {
      b.innerHTML = '<i class="ti ti-repeat"></i> Loop: Off';
      removeGreen(b);
      dot.style.color = '';
    }
  }

  // ── Sound ─────────────────────────────────────────────────────────────────
  function selectSound(type, preview) {
    document.querySelectorAll('.sound-btn').forEach(b => removeGreen(b));
    applyGreen(document.getElementById('snd-' + type));
    selectedSound = type;
    save('selectedSound', type);
    if (preview) playAlertSound(type);
  }

  function note(freq, start, dur, vol = 0.25, type = 'sine') {
    const o = actx.createOscillator(), g = actx.createGain();
    o.connect(g); g.connect(actx.destination);
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, actx.currentTime + start);
    g.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + start + dur);
    o.start(actx.currentTime + start);
    o.stop(actx.currentTime + start + dur + 0.01);
  }
  function playTick() { note(1200, 0, 0.04, 0.08); }
  function playAlertSound(type) {
    ({
      chime: () => { note(523.25,0,.6); note(659.25,.15,.6); note(783.99,.3,.8); note(1046.5,.5,1.2); },
      bell:  () => { note(880,0,1.5,.12,'square'); note(1760,0,1.2,.06); },
      pulse: () => { for(let i=0;i<5;i++) note(440+i*20,i*.12,.1,.18,'sawtooth'); },
      zen:   () => { note(329.63,0,1.5,.15); note(415.30,.4,1.2,.1); note(523.25,.9,1.5,.12); },
      alarm: () => { for(let i=0;i<8;i++) note(i%2===0?880:660,i*.1,.09,.18,'square'); },
      ping:  () => { note(2093,0,.4,.15); note(2637,.1,.5,.1); note(3136,.25,.6,.08); },
    }[type] || (_ => {}))();
  }

  
  // ── Repeat form ───────────────────────────────────────────────────────
  // formRepeatDays: null=once, array of 0-6 = repeat days
  function setRepeatPreset(preset) {
    document.querySelectorAll('.repeat-preset-btn').forEach(b => b.classList.toggle('active', b.dataset.preset === preset));
    const pillRow = document.getElementById('dayPillsRow');
    if (preset === 'once')     { formRepeatDays = null; pillRow.style.display = 'none'; }
    else if (preset === 'everyday') { formRepeatDays = [0,1,2,3,4,5,6]; pillRow.style.display = 'none'; }
    else if (preset === 'weekdays') { formRepeatDays = [1,2,3,4,5]; pillRow.style.display = 'none'; }
    else if (preset === 'weekends') { formRepeatDays = [0,6]; pillRow.style.display = 'none'; }
    else if (preset === 'custom')   {
      formRepeatDays = formRepeatDays && formRepeatDays.length ? formRepeatDays : [];
      pillRow.style.display = 'flex';
      syncDayPills();
    }
  }

  function toggleDayPill(day) {
    if (!formRepeatDays) formRepeatDays = [];
    const idx = formRepeatDays.indexOf(day);
    if (idx === -1) formRepeatDays.push(day); else formRepeatDays.splice(idx, 1);
    syncDayPills();
  }

  function syncDayPills() {
    document.querySelectorAll('.day-pill').forEach(btn => {
      const d = parseInt(btn.dataset.day);
      btn.classList.toggle('active', formRepeatDays && formRepeatDays.includes(d));
    });
  }

  function repeatLabel(repeatDays) {
    if (!repeatDays) return 'Once';
    const d = repeatDays.slice().sort((a,b)=>a-b);
    if (d.length === 7) return 'Every day';
    if (JSON.stringify(d) === JSON.stringify([1,2,3,4,5])) return 'Weekdays';
    if (JSON.stringify(d) === JSON.stringify([0,6])) return 'Weekends';
    return d.map(i => DAY_SHORT[i]).join(' · ');
  }

  // ── Alarms ───────────────────────────────────────────────────────────────
  // Each alarm: { id, time:'HH:MM', label, sound, enabled, fired }
  let alarms = [];
  let toastTimer = null;

  function loadAlarms() {
    try { alarms = JSON.parse(localStorage.getItem('alarms') || '[]'); }
    catch { alarms = []; }
  }
  function saveAlarms() { localStorage.setItem('alarms', JSON.stringify(alarms)); }

  let editingAlarmId = null;  // null = adding new, number = editing existing

  function addAlarm() {
    actx.resume();
    const timeVal  = document.getElementById('alarmTimeInput').value;
    const labelVal = document.getElementById('alarmLabelInput').value.trim();
    if (!timeVal) { document.getElementById('alarmTimeInput').focus(); return; }

    const repeatDays = formRepeatDays ? [...formRepeatDays].sort((a,b)=>a-b) : null;
    
    if (editingAlarmId !== null) {
      // Save edits to existing alarm
      const a = alarms.find(a => a.id === editingAlarmId);
      if (a) {
        a.time  = timeVal;
        a.label = labelVal;
        a.repeatDays = repeatDays;
        a.fired = false; // reset so edited time can fire again
      }
      cancelEdit();
    } else {
      // Create new alarm
      alarms.push({
        id: Date.now(),
        time: timeVal,
        label: labelVal || '',
        sound: 'chime',
        enabled: true,
        fired: false,
        repeatDays: repeatDays,
      });
    }
    alarms.sort((a, b) => a.time.localeCompare(b.time));
    saveAlarms();
    renderAlarms();
    document.getElementById('alarmTimeInput').value  = "07:00";
    document.getElementById('alarmLabelInput').value = '';
  }

  function startEdit(id) {
    const a = alarms.find(a => a.id === id);
    if (!a) return;
    editingAlarmId = id;
    document.getElementById('alarmTimeInput').value  = a.time;
    document.getElementById('alarmLabelInput').value = a.label;
    // Restore repeat UI
    formRepeatDays = a.repeatDays ? [...a.repeatDays] : null;
    if (!formRepeatDays) {
      setRepeatPreset('once');
    } else {
      const d = formRepeatDays.slice().sort((a,b)=>a-b);
      if (d.length===7) setRepeatPreset('everyday');
      else if (JSON.stringify(d)===JSON.stringify([1,2,3,4,5])) setRepeatPreset('weekdays');
      else if (JSON.stringify(d)===JSON.stringify([0,6])) setRepeatPreset('weekends');
      else { setRepeatPreset('custom'); syncDayPills(); }
    }
    const btn = document.getElementById('alarmAddBtn');
    btn.innerHTML = '<i class="ti ti-check"></i> Save';
    btn.classList.add('editing');
    document.getElementById('alarmCancelBtn').classList.add('show');
    document.getElementById('alarmTimeInput').focus();
    // Scroll form into view
    document.getElementById('alarmTimeInput').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function cancelEdit() {
    editingAlarmId = null;
    document.getElementById('alarmTimeInput').value  = "07:00";
    document.getElementById('alarmLabelInput').value = '';
    setRepeatPreset('once');
    const btn = document.getElementById('alarmAddBtn');
    btn.innerHTML = '<i class="ti ti-plus"></i> Add';
    btn.classList.remove('editing');
    document.getElementById('alarmCancelBtn').classList.remove('show');
  }

  function deleteAlarm(id) {
    if (editingAlarmId === id) cancelEdit();
    alarms = alarms.filter(a => a.id !== id);
    saveAlarms();
    renderAlarms();
  }

  function toggleAlarmEnabled(id) {
    const a = alarms.find(a => a.id === id);
    if (!a) return;
    a.enabled = !a.enabled;
    if (a.enabled) a.fired = false;
    saveAlarms();
    renderAlarms();
  }

  function setAlarmSound(id, sound) {
    const a = alarms.find(a => a.id === id);
    if (a) { a.sound = sound; saveAlarms(); }
  }

  function dismissAlarm(id) {
    const a = alarms.find(a => a.id === id);
    if (!a) return;
    a.fired = true;
    saveAlarms();
    firingAlarmIds.delete(id);
    stopFiringSound();
    dismissToast();
    renderAlarms();
  }

  function dismissToast() {
    const t = document.getElementById('alarmToast');
    if (t) t.classList.remove('show');
    if (toastTimer) { clearTimeout(toastTimer); toastTimer = null; }
  }

  // Repeating sound for 30s
  let firingInterval = null;
  let firingSound    = 'chime';

  function startFiringSound(sound) {
    firingSound = sound;
    if (actx.state === 'running') playAlertSound(sound);
    // Repeat every 4s (enough gap between sounds) for up to 30s total
    let elapsed = 0;
    firingInterval = setInterval(() => {
      elapsed += 4;
      if (elapsed >= 30) { stopFiringSound(); return; }
      if (actx.state === 'running') playAlertSound(firingSound);
    }, 4000);
  }

  function stopFiringSound() {
    if (firingInterval) { clearInterval(firingInterval); firingInterval = null; }
  }

  const SOUNDS = ['chime','bell','pulse','zen','alarm','ping'];
  const SOUND_LABELS = { chime:'🔔 Chime', bell:'🛎 Bell', pulse:'📡 Pulse', zen:'🎵 Zen', alarm:'⏰ Alarm', ping:'✨ Ping' };

  // Track which alarm IDs are currently firing (showing pulse animation)
  const firingAlarmIds = new Set();

  function renderAlarms() {
    updateAlarmDot();
    const list = document.getElementById('alarmList');
    if (!list) return;

    if (alarms.length === 0) {
      list.innerHTML = `
        <div class="alarm-empty">
          <i class="ti ti-alarm"></i>
          No alarms set
        </div>`;
      return;
    }

    list.innerHTML = alarms.map(a => {
      const timeStr = formatAlarmTime(a.time);
      const soundOpts = SOUNDS.map(s =>
        `<option value="${s}" ${a.sound === s ? 'selected' : ''}>${SOUND_LABELS[s]}</option>`
      ).join('');
      const isFiring  = firingAlarmIds.has(a.id);
      const isEditing = editingAlarmId === a.id;
      let classes = 'alarm-item';
      if (isFiring) classes += ' firing';
      else if (a.fired) classes += ' done';
      if (isEditing) classes += ' editing-row';
      const rLabel = repeatLabel(a.repeatDays);
      const rClass = !a.repeatDays ? 'once' : a.repeatDays.length===7 ? 'everyday' : '';
      return `
        <div class="${classes}" data-id="${a.id}">
          <div class="alarm-main">
            <button class="alarm-toggle ${a.enabled ? 'on' : ''}" onclick="toggleAlarmEnabled(${a.id})" title="${a.enabled ? 'Disable' : 'Enable'}"></button>
            <div class="alarm-info">
              <div class="alarm-top-row">
                <div class="alarm-time-display">${timeStr}</div>
                ${a.label ? `<div class="alarm-label-display">${a.label}</div>` : ''}
              </div>
              <div class="alarm-repeat-display ${rClass}">${rLabel}</div>
            </div>
            <div class="alarm-actions">
              <select class="alarm-sound-select" onchange="setAlarmSound(${a.id}, this.value)">${soundOpts}</select>
              <button class="alarm-dismiss-btn" onclick="dismissAlarm(${a.id})"><i class="ti ti-check"></i> Done</button>
              <button class="alarm-edit-btn" onclick="startEdit(${a.id})" title="Edit"><i class="ti ti-pencil"></i></button>
              <button class="alarm-delete-btn" onclick="deleteAlarm(${a.id})" title="Delete"><i class="ti ti-trash"></i></button>
            </div>
          </div>
        </div>`;
    }).join('');
  }

  function updateAlarmDot() {
    const dot = document.getElementById('alarmDot');
    if (!dot) return;
    const hasActive  = alarms.some(a => a.enabled && !a.fired);
    const isFiring   = firingAlarmIds.size > 0;
    if (isFiring) {
      dot.className = 'dot firing';
    } else if (hasActive) {
      dot.className = 'dot has-alarm';
      const time = alarms.filter(a => a.enabled && !a.fired).sort((a,b) => a.time.localeCompare(b.time))[0].time;
      dot.title = formatAlarmTime(time);
    } else {
      dot.className = 'dot';
    }
  }

  function checkAlarms(now) {
    const nowHH = now.getHours();
    const nowMM = now.getMinutes();
    const nowSS = now.getSeconds();
    const nowDay = now.getDay();
    // Fire at HH:MM:00 exactly
    if (nowSS !== 0) return;
    alarms.forEach(a => {
      if (!a.enabled || a.fired) return;
      const [aHH, aMM] = a.time.split(':').map(Number);
      if (aHH !== nowHH || aMM !== nowMM) return;
      if (a.repeatDays && !a.repeatDays.includes(nowDay)) return;
      a.fired = true;
      saveAlarms();
      fireAlarm(a);
      // midnight reset: only for repeating alarms
    if (a.enabled && a.repeatDays !== null) a.fired = false; // ← once alarms never reset
    });
    // Reset fired flags at midnight so alarms repeat daily
    if (nowHH === 0 && nowMM === 0) {
      alarms.forEach(a => { if (a.enabled) a.fired = false; });
      saveAlarms();
      renderAlarms();
    }
  }

  function fireAlarm(a) {
    // Track as firing and re-render so the row shows pulse + dismiss button
    firingAlarmIds.add(a.id);
    renderAlarms();

    // Play sound repeatedly for 30 seconds
    startFiringSound(a.sound);

    // Show toast
    const label = a.label || formatAlarmTime(a.time);
    const toastText = document.getElementById('alarmToastText');
    const toast     = document.getElementById('alarmToast');
    if (toastText) toastText.textContent = '⏰ ' + label;
    if (toast) toast.classList.add('show');

    // Auto-dismiss after 30s
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      firingAlarmIds.delete(a.id);
      stopFiringSound();
      dismissToast();
      renderAlarms();
    }, 30000);
  }

  function formatAlarmTime(time) {
    const [hh, mm] = time.split(':').map(Number);
    const h12 = hh % 12 || 12;
    return pad(h12) + ':' + pad(mm) + (hh < 12 ? ' AM' : ' PM');
  }

  // ── Boot ──────────────────────────────────────────────────────────────────
  // Restore all UI from saved state — no preview sound on load
  loadAlarms();
  renderAlarms();
  setUnit(unit, true);           // skipSave=true, restores slider correctly
  selectSound(selectedSound);    // no preview=true so no sound plays on load
  renderTickUI();
  updateAlertUI();
  renderLoopUI();
  renderSettingsUI();
  checkAudioState();             // show banner if audio needs unlocking

  updateClock();
  setInterval(updateClock, 500);