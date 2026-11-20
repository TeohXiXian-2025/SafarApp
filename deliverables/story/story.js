/* Safar story engine: runs the six-scene problem story on the #story slide.
   The deck calls SafarStory.enter(dir) / leave() from show(), routes keys through key(e)
   and the prev/next buttons through step(d). Everything else lives here. */
(function () {
  const root = document.getElementById('story');
  if (!root) return;
  const scenes = [...root.querySelectorAll('.st-scene')];
  const LAST = scenes.length - 1;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const $ = (sel, el) => (el || root).querySelector(sel);
  const $$ = (sel, el) => [...(el || root).querySelectorAll(sel)];

  // Per-scene length (ms) drives the progress bar and autoplay.
  const DUR = [0, 9000, 11000, 10500, 10500, 9500, 9000];
  const LABEL = ['', 'Dream trip', 'Food', 'Prayer', 'Too many apps', 'The problem', 'Safar'];
  const CAP = ['',
    'Imagine finally going on your dream holiday with your closest friends.',
    'Everyone wants to explore local cuisine. But finding a suitable dining option isn’t always straightforward.',
    'And for Muslim travellers, prayer is an essential part of the journey. But how do we fit it naturally into an already packed itinerary?',
    'Different apps, fragmented information and endless group coordination. Planning one trip has become a challenge of its own.',
    'A shared journey should never mean that someone has to leave their needs behind.',
    'What if we could bring everyone’s needs together in one seamless travel experience?'];
  // Transition used when entering each scene going forward.
  const IN = ['fade', 'fade', 'zoom', 'whip', 'glitch', 'freeze', 'bloom'];
  const TRANS = ['in-zoom', 'out-zoom', 'in-whip', 'out-whip', 'in-glitch', 'out-glitch', 'in-freeze', 'out-freeze', 'in-bloom', 'out-bloom', 'in-fade', 'out-fade'];

  let idx = 0, active = false, auto = false, autoT = null, timers = [], loops = [], leaveT = null;
  const at = (ms, fn) => timers.push(setTimeout(fn, ms));
  const every = (ms, fn) => loops.push(setInterval(fn, ms));
  const hooks = { edge: null };

  /* ---------------- Sound: synthesised with Web Audio, nothing to download ---------------- */
  const Sfx = (() => {
    let ctx = null, master = null, musicBus = null, on = true, musicOn = false, musicTimer = null;
    function ac() {
      if (!ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        ctx = new AC(); master = ctx.createGain(); master.gain.value = 0.42; master.connect(ctx.destination);
        musicBus = ctx.createGain(); musicBus.gain.value = 0; musicBus.connect(master);
      }
      if (ctx.state === 'suspended') ctx.resume();
      return ctx;
    }
    function env(g, t, a, d, peak) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); }
    function tone(f, d, type, peak, delay, slide, bus) {
      const c = ac(); if (!c || (!on && !bus)) return;
      const t = c.currentTime + (delay || 0), o = c.createOscillator(), g = c.createGain();
      o.type = type || 'sine'; o.frequency.setValueAtTime(f, t); if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + d);
      env(g, t, 0.008, d, peak || 0.2); o.connect(g); g.connect(bus || master); o.start(t); o.stop(t + d + 0.05);
    }
    function noise(d, type, f0, f1, peak, delay) {
      const c = ac(); if (!c || !on) return;
      const t = c.currentTime + (delay || 0), len = Math.ceil(c.sampleRate * d), b = c.createBuffer(1, len, c.sampleRate), ch = b.getChannelData(0);
      for (let i = 0; i < len; i++) ch[i] = Math.random() * 2 - 1;
      const s = c.createBufferSource(), fl = c.createBiquadFilter(), g = c.createGain();
      s.buffer = b; fl.type = type; fl.frequency.setValueAtTime(f0, t); if (f1) fl.frequency.exponentialRampToValueAtTime(f1, t + d); fl.Q.value = 0.9;
      env(g, t, d * 0.25, d * 0.75, peak || 0.2); s.connect(fl); fl.connect(g); g.connect(master); s.start(t); s.stop(t + d + 0.05);
    }
    const S = {
      whoosh: () => noise(0.7, 'bandpass', 300, 2600, 0.22),
      swish: () => noise(0.35, 'bandpass', 1800, 600, 0.12),
      pop: () => tone(620, 0.12, 'sine', 0.16, 0, 240),
      card: () => { noise(0.08, 'lowpass', 1400, 0, 0.18); tone(180, 0.1, 'sine', 0.08); },
      pin: () => tone(1046, 0.18, 'triangle', 0.08),
      ping: (k) => { const f = [1318, 1175, 1568, 1397][k || 0]; tone(f, 0.22, 'sine', 0.1); tone(f * 1.5, 0.18, 'sine', 0.05, 0.07); },
      buzz: () => { tone(150, 0.22, 'sawtooth', 0.04); tone(150, 0.22, 'sawtooth', 0.04, 0.28); },
      tick: () => tone(2200, 0.03, 'square', 0.025),
      type: () => tone(1500 + Math.random() * 400, 0.02, 'square', 0.02),
      warn: () => { tone(440, 0.16, 'triangle', 0.12); tone(349, 0.24, 'triangle', 0.12, 0.17); },
      shutter: () => { noise(0.05, 'highpass', 3000, 0, 0.3); noise(0.06, 'highpass', 2500, 0, 0.22, 0.09); },
      thud: () => { tone(110, 0.9, 'sine', 0.35, 0, 38); noise(0.4, 'lowpass', 400, 80, 0.12); },
      chime: () => [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, 1.4, 'triangle', 0.09, i * 0.11)),
      reveal: () => { [392, 523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => tone(f, 1.8, 'sine', 0.08, i * 0.08)); noise(1.2, 'bandpass', 4000, 9000, 0.05); }
    };
    // Soft generative pad: four chords that loop while music is on.
    const CHORDS = [[174.61, 220, 261.63, 329.63], [164.81, 207.65, 246.94, 329.63], [146.83, 174.61, 220, 293.66], [130.81, 164.81, 196, 246.94]];
    let ci = 0;
    function chord() {
      const c = ac(); if (!c) return;
      const notes = CHORDS[ci++ % CHORDS.length], t = c.currentTime;
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900; lp.connect(musicBus);
      notes.forEach((f, i) => [0, 3].forEach(det => {
        const o = c.createOscillator(), g = c.createGain(); o.type = 'triangle'; o.frequency.value = f; o.detune.value = det * (i % 2 ? 1 : -1);
        g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.05, t + 1.2); g.gain.linearRampToValueAtTime(0.0001, t + 4.4);
        o.connect(g); g.connect(lp); o.start(t); o.stop(t + 4.5);
      }));
      tone(notes[3] * 2, 0.9, 'sine', 0.03, 0.4, 0, musicBus);
    }
    function music(want) {
      musicOn = want; const c = ac(); if (!c) return;
      clearInterval(musicTimer);
      musicBus.gain.cancelScheduledValues(c.currentTime);
      musicBus.gain.linearRampToValueAtTime(want ? 1 : 0, c.currentTime + 1.2);
      if (want) { chord(); musicTimer = setInterval(chord, 4000); }
    }
    function duck(level) { if (!ctx || !musicOn) return; musicBus.gain.cancelScheduledValues(ctx.currentTime); musicBus.gain.linearRampToValueAtTime(level, ctx.currentTime + 0.6); }
    return {
      play(name, arg) { if (on && S[name]) try { S[name](arg) } catch (e) { } },
      set on(v) { on = v; if (master && ctx) master.gain.setTargetAtTime(v ? 0.42 : 0, ctx.currentTime, 0.05); }, get on() { return on },
      music, duck, get musicOn() { return musicOn }, wake: ac
    };
  })();

  /* ---------------- Build-once helpers ---------------- */
  $$('.petals').forEach(p => {
    const n = Number(p.dataset.petals) || 24;
    for (let i = 0; i < n; i++) {
      const s = document.createElement('span'); s.className = 'petal';
      const size = 10 + Math.random() * 12;
      s.style.cssText = `--px:${Math.random() * 100}%;--ps:${size}px;--pd:${7 + Math.random() * 7}s;--pdl:${-Math.random() * 14}s;--pw:${30 + Math.random() * 90}px;--pb:${size > 19 ? 1.5 : 0}px`;
      p.appendChild(s);
    }
  });
  // Scene 5 statement: wrap each word so it can be revealed one at a time.
  $$('.stmt p').forEach(p => {
    const walk = node => [...node.childNodes].forEach(ch => {
      if (ch.nodeType === 3) {
        const frag = document.createDocumentFragment();
        ch.textContent.split(/(\s+)/).forEach(w => { if (!w) return; if (/^\s+$/.test(w)) { frag.appendChild(document.createTextNode(w)); return; } const s = document.createElement('span'); s.className = 'w'; s.textContent = w; frag.appendChild(s); });
        ch.replaceWith(frag);
      } else walk(ch);
    });
    walk(p);
  });
  // Progress segments.
  const prog = $('.st-prog');
  for (let i = 1; i <= LAST; i++) {
    const b = document.createElement('button'); b.type = 'button'; b.dataset.go = i; b.title = 'Scene ' + i + ': ' + LABEL[i];
    b.innerHTML = '<i></i><span>' + i + ' · ' + LABEL[i] + '</span>'; prog.appendChild(b);
  }
  const caption = $('.caption');

  /* ---------------- Scene builders (JS-driven beats; CSS handles the rest) ---------------- */
  const BUILD = {
    1() {
      Sfx.play('whoosh');
      [1200, 1450, 1700, 1950].forEach(t => at(t, () => Sfx.play('card')));
      at(1600, () => Sfx.play('swish'));
      at(2600, () => Sfx.play('whoosh'));
      [3700, 4200, 4600].forEach(t => at(t, () => Sfx.play('pin')));
    },
    2(sc) {
      const steps = {}; $$('.step', sc).forEach(s => { s.classList.remove('show', 'gone'); steps[s.dataset.step] = s; });
      const typed = $('[data-role="typed"]', sc); typed.textContent = '';
      const btn = steps.btn; btn.classList.remove('pulse');
      Sfx.play('whoosh');
      at(1700, () => Sfx.play('swish'));
      [2000, 2300, 2450].forEach(t => at(t, () => Sfx.play('pop')));
      at(3400, () => Sfx.play('pop'));
      at(3700, () => Sfx.play('whoosh'));
      const word = 'Ramen near me';
      [...word].forEach((ch, i) => at(4700 + i * 65, () => { typed.textContent += ch; Sfx.play('type'); }));
      at(5700, () => { steps.card.classList.add('show'); Sfx.play('pop'); });
      at(6400, () => { steps.ask.classList.add('show'); });
      at(7600, () => { steps.ask.classList.add('gone'); steps.result.classList.add('show'); Sfx.play('warn'); });
      at(8400, () => { btn.classList.add('show', 'pulse'); });
      const showAlts = () => { if (steps.alts.classList.contains('show')) return; btn.classList.add('gone'); steps.result.classList.add('gone'); steps.alts.classList.add('show'); Sfx.play('pop'); };
      sc._alts = showAlts;
      at(9500, showAlts);
    },
    3(sc) {
      const mh = $('.mh', sc), hh = $('.hh', sc), txt = $('[data-role="clock-text"]', sc), itin = $('[data-role="itin"]', sc), alert = $('[data-role="itin-alert"]', sc);
      itin.classList.remove('shifted'); alert.textContent = '';
      const set = m => { const h = 14 + Math.floor(m / 60), mm = m % 60; mh.style.transform = `rotate(${mm * 6}deg)`; hh.style.transform = `rotate(${(h % 12) * 30 + mm * 0.5}deg)`; txt.textContent = h + ':' + String(mm).padStart(2, '0'); };
      set(30);
      Sfx.play('whoosh');
      const start = 30, end = 63;
      at(700, () => {
        const t0 = performance.now(), len = reduce.matches ? 1 : 2600; let lastMin = start;
        const step = now => { const k = Math.min(1, (now - t0) / len), m = Math.round(start + (end - start) * (1 - Math.pow(1 - k, 2))); if (m !== lastMin) { lastMin = m; set(m); if (m % 3 === 0) Sfx.play('tick'); } if (k < 1 && active && idx === 3) requestAnimationFrame(step); };
        requestAnimationFrame(step);
      });
      at(1050, () => { const f = $('[data-role="cam-flash"]', sc); f.classList.remove('go'); void f.offsetWidth; f.classList.add('go'); Sfx.play('shutter'); });
      at(1250, () => Sfx.play('pop'));
      at(3150, () => { Sfx.play('ping', 0); Sfx.play('buzz'); });
      at(4300, () => { itin.classList.add('shifted'); alert.textContent = '⚠ +30 min'; Sfx.play('swish'); });
      at(5200, () => { Sfx.play('pop'); });
      [5800, 7000].forEach(t => at(t, () => Sfx.play('pin')));
      at(7000, () => Sfx.play('pop'));
    },
    4(sc) {
      const chat = $('[data-role="chat"]', sc), toasts = $('[data-role="toasts"]', sc), cd = $('[data-role="countdown"]', sc);
      chat.innerHTML = ''; toasts.innerHTML = '';
      const badges = [1, 2, 3, 4].map(n => $('[data-role="b' + n + '"]', sc)); const counts = [3, 2, 1, 9];
      badges.forEach((b, i) => b.textContent = counts[i]);
      const bump = i => { counts[i]++; badges[i].textContent = counts[i] > 99 ? '99+' : counts[i]; badges[i].classList.remove('bump'); void badges[i].offsetWidth; badges[i].classList.add('bump'); };
      const face = n => 'assets/story/face-' + n + '.jpg';
      const MSGS = [['daniel', 'Daniel', 'Updated the itinerary link 🙏'], ['jun', 'Jun', 'Where are we eating tonight??'], ['aminah', 'Aminah', 'Is that place halal?'], ['mei', 'Mei', 'Sunset at Kiyomizu! 📸'], ['daniel', 'Daniel', 'Prayer first or temple first?'], ['aminah', 'Aminah', 'Asr starts in 10 min'], ['jun', 'Jun', 'Ramen place closes at 9'], ['daniel', 'Daniel', 'Which app has the plan? 😵'], ['mei', 'Mei', 'My battery is at 4% 😭'], ['aminah', 'Aminah', 'Nearest prayer room?'], ['jun', 'Jun', 'guys??'], ['daniel', 'Daniel', 'Re-booking dinner…']];
      let mi = 0, gap = 720;
      const add = () => {
        if (!active || idx !== 4) return;
        const [who, nm, text] = MSGS[mi % MSGS.length]; mi++;
        const m = document.createElement('div'); m.className = 'msg';
        m.innerHTML = `<img src="${face(who)}" alt=""><span><i>${nm}</i>${text}</span>`;
        chat.appendChild(m); while (chat.children.length > 9) chat.firstChild.remove();
        bump(3); Sfx.play('ping', mi % 4);
        gap = Math.max(260, gap * 0.86); at(gap, add);
      };
      at(1900, add);
      let secs = 11 * 60 + 52; cd.textContent = '11:52';
      every(1000, () => { secs--; cd.textContent = Math.floor(secs / 60) + ':' + String(secs % 60).padStart(2, '0'); });
      const rows = $$('[data-role="itinlist"] div', sc), tops = rows.map(r => r.style.top);
      every(950, () => { const a = Math.floor(Math.random() * rows.length), b = (a + 1 + Math.floor(Math.random() * (rows.length - 1))) % rows.length; const t = rows[a].style.top; rows[a].style.top = rows[b].style.top; rows[b].style.top = t; });
      sc._reset = () => rows.forEach((r, i) => r.style.top = tops[i]);
      every(1300, () => bump(Math.floor(Math.random() * 3)));
      const TOASTS = ['📍 Location shared', '🔔 12 new messages', '⏰ Asr in 10 min', '⚠ Booking changed', '🍜 Is it halal?', '📅 Itinerary updated', '🗺 Route recalculating…', '💬 Daniel: where are you?', '🚆 Train delayed 8 min', '📸 Mei shared 24 photos'];
      let ti = 0;
      const toast = () => {
        if (!active || idx !== 4) return;
        const el = document.createElement('div'); el.className = 'toast'; el.textContent = TOASTS[ti++ % TOASTS.length];
        el.style.left = (570 + Math.random() * 230) + 'px'; el.style.top = (300 + Math.random() * 250) + 'px'; el.style.rotate = (Math.random() * 10 - 5) + 'deg';
        toasts.appendChild(el); setTimeout(() => el.remove(), 2300); Sfx.play('buzz');
      };
      at(2600, () => { toast(); every(620, toast); });
      at(6500, () => root.classList.add('frantic'));
      at(7700, () => root.classList.add('shake'));
      at(8700, () => root.classList.remove('shake'));
    },
    5(sc) {
      Sfx.play('thud');
      const l1 = $('[data-role="l1"]', sc), l2 = $('[data-role="l2"]', sc);
      [l1, l2].forEach(p => { p.classList.remove('dim'); $$('.w', p).forEach(w => w.classList.remove('on')); });
      const reveal = (p, t0) => $$('.w', p).forEach((w, i) => at(t0 + i * 120, () => w.classList.add('on')));
      reveal(l1, 2900);
      at(5300, () => l1.classList.add('dim'));
      reveal(l2, 5500);
      at(5500, () => Sfx.play('pin'));
    },
    6() {
      const f = $('[data-role="bloom"]'); f.classList.remove('go'); void f.offsetWidth; f.classList.add('go');
      at(500, () => Sfx.play('chime'));
      at(5000, () => Sfx.play('reveal'));
    }
  };

  /* ---------------- Navigation ---------------- */
  function clearAll() {
    timers.forEach(clearTimeout); loops.forEach(clearInterval); timers = []; loops = [];
    clearTimeout(autoT); autoT = null;
    root.classList.remove('shake', 'frantic');
    scenes.forEach(s => { if (s._reset) { s._reset(); s._reset = null; } s._alts = null; });
  }
  function restart(el) { el.classList.remove('on'); void el.offsetWidth; el.classList.add('on'); }
  function setCaption(n) {
    caption.classList.remove('show');
    if (n > 0) at(450, () => { caption.textContent = CAP[n]; caption.classList.add('show'); });
  }
  function setProgress(n) {
    $$('button', prog).forEach((b, i) => {
      const s = i + 1; b.classList.remove('cur'); b.classList.toggle('done', s < n);
      if (s === n) { b.style.setProperty('--dur', DUR[n] + 'ms'); void b.offsetWidth; b.classList.add('cur'); }
    });
    prog.style.visibility = n === 0 ? 'hidden' : 'visible';
  }
  function scheduleAuto() {
    clearTimeout(autoT);
    if (!auto || !active) return;
    if (idx === 0) autoT = setTimeout(() => go(1), 900);
    else if (idx < LAST) autoT = setTimeout(() => go(idx + 1), DUR[idx]);
  }
  function go(n, opts) {
    opts = opts || {};
    n = Math.max(0, Math.min(LAST, n));
    const prev = idx, fwd = n > prev, moving = prev !== n && !opts.instant && !reduce.matches;
    clearAll(); clearTimeout(leaveT);
    root.classList.toggle('st-instant', !!opts.instant);
    root.classList.toggle('paused-fill', !!opts.instant);
    Sfx.duck(n === 5 ? 0.25 : 1); // the quiet beat: music drops under the problem statement
    scenes.forEach((s, i) => { if (i !== prev || !moving) s.classList.remove('out', ...TRANS); if (i !== n && (i !== prev || !moving)) s.classList.remove('on'); });
    const inn = scenes[n];
    inn.classList.remove('out', ...TRANS);
    if (moving) {
      const t = fwd ? IN[n] : 'fade', out = scenes[prev];
      out.classList.remove(...TRANS); out.classList.add('out', 'out-' + t);
      inn.classList.add('in-' + t);
      leaveT = setTimeout(() => { out.classList.remove('on', 'out', ...TRANS); inn.classList.remove(...TRANS); }, 1600);
      if (t === 'zoom' || t === 'whip') Sfx.play('whoosh');
    }
    restart(inn);
    idx = n;
    root.classList.toggle('st-poster', n === 0);
    if (!opts.instant && BUILD[n]) BUILD[n](inn);
    setCaption(n); setProgress(n); scheduleAuto();
  }
  function next() { if (idx < LAST) { go(idx + 1); return true; } return false; }
  function prev() { if (idx > 0) { go(idx - 1); return true; } return false; }

  /* ---------------- Controls ---------------- */
  const btn = act => $('.st-ui [data-act="' + act + '"]');
  function toggleAuto(v) { auto = v === undefined ? !auto : v; btn('auto').setAttribute('aria-pressed', String(auto)); btn('auto').querySelector('span').textContent = auto ? 'Auto on' : 'Auto'; if (auto && idx === LAST) go(0); else scheduleAuto(); }
  function replay() { go(0, {}); setTimeout(() => active && go(1), 60); }
  function toggleSound() { Sfx.on = !Sfx.on; btn('sound').setAttribute('aria-pressed', String(Sfx.on)); }
  function toggleMusic() { Sfx.music(!Sfx.musicOn); btn('music').setAttribute('aria-pressed', String(Sfx.musicOn)); }
  function toggleCC() { const off = root.classList.toggle('no-cc'); btn('cc').setAttribute('aria-pressed', String(!off)); }

  root.addEventListener('click', e => {
    if (!active) return;
    Sfx.wake();
    const a = e.target.closest('[data-act],[data-go]');
    if (a) {
      e.stopPropagation();
      if (e.detail > 0) a.blur(); // a mouse click must not leave focus on the button, or Space would press it again
      if (a.dataset.go) return go(Number(a.dataset.go));
      const act = a.dataset.act;
      if (act === 'start') go(1);
      else if (act === 'auto') toggleAuto();
      else if (act === 'replay') replay();
      else if (act === 'sound') toggleSound();
      else if (act === 'music') toggleMusic();
      else if (act === 'cc') toggleCC();
      else if (act === 'alts' && scenes[2]._alts) scenes[2]._alts();
      return;
    }
    // Click anywhere else advances the story; on the last scene it hands over to the next slide.
    if (!next() && hooks.edge) hooks.edge(1);
  });
  // Gentle parallax from the pointer; the Ken Burns drift keeps scenes alive without it.
  root.addEventListener('pointermove', e => {
    const r = root.getBoundingClientRect();
    root.style.setProperty('--mx', ((e.clientX - r.left) / r.width - 0.5).toFixed(3));
    root.style.setProperty('--my', ((e.clientY - r.top) / r.height - 0.5).toFixed(3));
  });

  window.SafarStory = {
    enter(dir) {
      active = true; root.classList.remove('paused-fill');
      if (dir < 0) go(LAST, { instant: true }); else { idx = 0; go(0, { instant: false }); }
    },
    leave() {
      if (!active) return; active = false; clearAll(); clearTimeout(leaveT);
      caption.classList.remove('show'); if (Sfx.musicOn) { Sfx.music(false); btn('music').setAttribute('aria-pressed', 'false'); }
    },
    // Returns true when the key was used by the story (the deck then ignores it).
    key(e) {
      if (!active || e.ctrlKey || e.metaKey || e.altKey) return false;
      Sfx.wake();
      const k = e.key, l = k.length === 1 ? k.toLowerCase() : k;
      if (k === 'Enter') { if (idx === 0) go(1); else if (!next() && hooks.edge) hooks.edge(1); return true; }
      if ([' ', 'ArrowRight', 'ArrowDown', 'PageDown'].includes(k)) return next();
      if (['ArrowLeft', 'ArrowUp', 'PageUp'].includes(k)) return prev();
      if (l === 'a') { toggleAuto(); return true; }
      if (l === 'r') { replay(); return true; }
      if (l === 'm') { toggleSound(); return true; }
      if (l === 'u') { toggleMusic(); return true; }
      if (l === 'c') { toggleCC(); return true; }
      return false;
    },
    step(d) { if (!active) return false; Sfx.wake(); return d > 0 ? next() : prev(); },
    onEdge(fn) { hooks.edge = fn; },
    get scene() { return idx; }
  };
})();
