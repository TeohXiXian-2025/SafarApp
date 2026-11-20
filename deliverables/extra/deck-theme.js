/* Deck theme: gives every slide the same Japan-spring touches as the title slide.
   - one cherry-blossom branch in the top-left corner and a few drifting petals
   - footer page numbers that follow the real slide order ("03 / 14")
   The story slide keeps its own cinematic look; the title slide already has its own branches. */
(function () {
  const slides = [...document.querySelectorAll('#stage .slide')];
  const total = slides.length;
  const pad = n => String(n).padStart(2, '0');

  // Small seeded random so every slide gets the identical branch.
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const U = (a, b) => a + rnd() * (b - a);
  const shape = (() => {
    const flowers = [], buds = [];
    for (let k = 0; k < 30; k++) flowers.push([U(0, 370), U(0, 200), U(9, 17), U(0, 72)]);
    for (let k = 0; k < 15; k++) buds.push([U(0, 370), U(0, 200), U(3, 5)]);
    return { flowers, buds };
  })();
  function branch(id) {
    const petals = (r, rot) => [0, 1, 2, 3, 4].map(i => `<ellipse cx="0" cy="${(-r * .55).toFixed(1)}" rx="${(r * .42).toFixed(1)}" ry="${(r * .6).toFixed(1)}" transform="rotate(${(rot + i * 72).toFixed(0)})"/>`).join('');
    const fl = shape.flowers.map(([x, y, r, rot]) => `<g transform="translate(${x.toFixed(0)} ${y.toFixed(0)})"><g fill="url(#${id})" stroke="#e7a3b5" stroke-width=".6">${petals(r, rot)}</g><circle r="${(r * .18).toFixed(1)}" fill="#f4c96b"/></g>`).join('');
    const bd = shape.buds.map(([x, y, r]) => `<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${r.toFixed(1)}" fill="#e98fa8"/>`).join('');
    return `<defs><radialGradient id="${id}" cx=".5" cy=".9" r=".9"><stop offset="0" stop-color="#fff6f8"/><stop offset=".6" stop-color="#f9c9d6"/><stop offset="1" stop-color="#ef9fb6"/></radialGradient></defs>` +
      '<path d="M-20 40 C60 30 140 60 220 70 C280 78 330 110 370 150" fill="none" stroke="#4a2f25" stroke-width="7" stroke-linecap="round"/>' +
      ['M120 55 C140 30 170 18 200 10', 'M210 70 C220 110 215 150 200 190', 'M60 38 C70 70 60 100 40 130', 'M300 100 C330 80 350 60 365 40']
        .map(d => `<path d="${d}" fill="none" stroke="#5a3a2e" stroke-width="3" stroke-linecap="round"/>`).join('') + bd + fl;
  }
  const petalsHTML = () => Array.from({ length: 7 }, () =>
    `<i style="left:${U(4, 96).toFixed(0)}%;--d:${U(9, 15).toFixed(1)}s;--l:${(-U(0, 15)).toFixed(1)}s;--s:${U(8, 13).toFixed(0)}px;--w:${U(30, 80).toFixed(0)}px"></i>`).join('');

  slides.forEach((s, i) => {
    const num = s.querySelector('.slide-bottom b');
    if (num) num.textContent = pad(i + 1) + ' / ' + pad(total);
    if (s.id === 'story' || s.id === 's1') return;
    s.insertAdjacentHTML('afterbegin',
      `<svg class="th-bloom" viewBox="0 0 380 260" aria-hidden="true">${branch('thp-' + s.id)}</svg><div class="th-petals" aria-hidden="true">${petalsHTML()}</div>`);
  });
})();
