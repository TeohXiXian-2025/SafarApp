/* Deck motion layer: picks a cinematic transition for each slide change and runs
   step-by-step reveals. The deck calls DeckMotion.enter() at the end of show(),
   and routes →/← (keys, buttons, swipes) through DeckMotion.key()/step() first. */
(function () {
  const stage = document.getElementById('stage');
  if (!stage) return;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');

  // Reveal steps per slide. "each:" makes every match its own step; otherwise all matches reveal together.
  const BUILDS = {
    s2: ['.mk-pill', '.mk-spend', '.mk-audience'],
    s3: ['each:.pb-list>div', '.pb-card'],
    s4: ['.gp-row', '.gp-gap', '.gp-safar'],
    s5: ['each:.m5-row'],
    s6: ['.up-card:first-child', '.up-card:last-child', '.up-bar'],
    s9: ['each:.t9-row'],
    s10: ['.b10-left', '.b10-right'],
    mkt: ['each:.errc>div', '.now'],
    arch: ['.l1', '.l2', '.l3', '.keys']
  };

  const sweep = document.createElement('div'); sweep.id = 'dm-sweep'; sweep.setAttribute('aria-hidden', 'true');
  const dots = document.createElement('div'); dots.id = 'dm-builds'; dots.setAttribute('aria-hidden', 'true');
  stage.append(sweep, dots);

  let slide = null, steps = [], shown = 0, enteredAt = 0;

  function stepsFor(el) {
    return (BUILDS[el.id] || []).flatMap(spec => {
      const each = spec.startsWith('each:'), els = [...el.querySelectorAll(each ? spec.slice(5) : spec)];
      if (!els.length) return [];
      return each ? els.map(e => [e]) : [els];
    });
  }
  function renderDots() {
    dots.replaceChildren(...steps.map((_, i) => { const d = document.createElement('i'); if (i < shown) d.className = 'done'; else if (i === shown) d.className = 'next'; return d; }));
    dots.classList.toggle('on', steps.length > 0 && shown < steps.length);
  }
  // Count a revealed figure up from zero, like the deck does for whole slides.
  function countUp(els) {
    if (reduce.matches || performance.now() - enteredAt < 1700) return; // the deck's own count is still running
    const nums = els.flatMap(e => [...e.querySelectorAll('[data-count]')]); if (!nums.length) return;
    const t0 = performance.now() + 250, len = 1100;
    nums.forEach(n => { n.textContent = '0'; });
    const tick = now => { const t = Math.max(0, Math.min(1, (now - t0) / len)), e = 1 - Math.pow(1 - t, 3); nums.forEach(n => { n.textContent = String(Math.round(Number(n.dataset.count) * e)); }); if (t < 1) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  }
  function reveal(els) { els.forEach(e => { e.classList.remove('dm-hide', 'dm-in'); void e.offsetWidth; e.classList.add('dm-in'); }); countUp(els); }
  function hide(els) { els.forEach(e => { e.classList.remove('dm-in'); e.classList.add('dm-hide'); }); }

  window.DeckMotion = {
    leaveMs: 1150, // how long the outgoing slide stays visible (longest transition)
    enter(el, dir, prevEl) {
      if (slide && slide !== el) slide.querySelectorAll('.dm-hide,.dm-in').forEach(e => e.classList.remove('dm-hide', 'dm-in'));
      const moved = prevEl && prevEl !== el;
      const ids = [el.id, prevEl && prevEl.id];
      stage.dataset.dm = ids.includes('story') ? 'zoom' : (el.id === 's12' && dir > 0 ? 'iris' : 'push');
      if (moved && !reduce.matches) { stage.classList.toggle('dm-back', dir < 0); stage.classList.remove('dm-go'); void stage.offsetWidth; stage.classList.add('dm-go'); }
      slide = el; enteredAt = performance.now();
      steps = stepsFor(el);
      shown = dir < 0 ? steps.length : 0; // coming back: show the slide fully built
      steps.forEach((s, i) => (i < shown ? s.forEach(e => e.classList.remove('dm-hide')) : hide(s)));
      renderDots();
    },
    // → reveals the next step, ← undoes the last one; false means "change slide instead".
    step(d) {
      if (!slide || !steps.length) return false;
      if (d > 0 && shown < steps.length) { reveal(steps[shown]); shown++; renderDots(); return true; }
      if (d < 0 && shown > 0) { shown--; hide(steps[shown]); renderDots(); return true; }
      return false;
    },
    key(e) {
      if (e.ctrlKey || e.metaKey || e.altKey) return false;
      if ([' ', 'ArrowRight', 'ArrowDown', 'PageDown'].includes(e.key)) return this.step(1);
      if (['ArrowLeft', 'ArrowUp', 'PageUp'].includes(e.key)) return this.step(-1);
      return false;
    }
  };
})();
