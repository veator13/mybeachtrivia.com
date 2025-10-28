(() => {
  const ready = (fn) => (document.readyState === 'loading')
    ? document.addEventListener('DOMContentLoaded', fn, {once:true})
    : fn();

  ready(() => {
    const tbl = document.querySelector('#teamTable') || document.querySelector('table');
    if (!tbl) return;

    // Final width -> CSS var for sticky offsets
    const finals = tbl.querySelectorAll('td.sticky-right-final, th.sticky-right-final, td.sticky-col-right, th.sticky-col-right');
    const finalW = finals.length
      ? Math.max(...[...finals].map(el => Math.ceil(el.getBoundingClientRect().width || el.offsetWidth)), 116)
      : 116;
    tbl.style.setProperty('--finalW', finalW + 'px');

    // Bonus body cell -> background and width; also map plain .bonus-td to sticky class if present
    const bonusBody = tbl.querySelector('tbody td.sticky-right-bonus, tbody td.bonus-td');
    if (!bonusBody) return;
    tbl.querySelectorAll('tbody td.bonus-td').forEach(td => td.classList.add('sticky-right-bonus'));

    const bonusBG = getComputedStyle(bonusBody).backgroundColor || '#111';
    tbl.style.setProperty('--bonus-bg', bonusBG);

    const bonusW = Math.ceil(bonusBody.getBoundingClientRect().width || bonusBody.offsetWidth);
    if (bonusW) tbl.style.setProperty('--bonus-w', bonusW + 'px');

    // Find the BONUS header cell (prefer explicit text)
    let thBonus = [...(tbl.tHead?.querySelectorAll('th,td') || [])]
      .find(h => /bonus/i.test((h.textContent || '').replace(/\s+/g, ' ').trim()));

    // Fallback: pick the top-row header covering the bonus column index
    if (!thBonus && tbl.tHead) {
      const colIndex = (row, cell) => { let i=0; for (const c of row.cells){ if(c===cell) break; i += c.colSpan||1; } return i; };
      const bonusIdx = colIndex(bonusBody.parentElement, bonusBody);
      const top = tbl.tHead.rows[0];
      if (top) {
        let i=0;
        for (const c of top.cells) {
          const span = c.colSpan || 1;
          if (bonusIdx >= i && bonusIdx < i + span) { thBonus = c; break; }
          i += span;
        }
      }
    }
    if (!thBonus) return;

    // Paint the extender from BONUS header bottom to THEAD bottom (+ tiny bleed)
    const paint = () => {
      const theadRect = tbl.tHead.getBoundingClientRect();
      const hdrRect   = thBonus.getBoundingClientRect();
      const gap = Math.max(0, Math.ceil(theadRect.bottom - hdrRect.bottom)) + 2;
      tbl.style.setProperty('--bonus-gap', gap + 'px');

      thBonus.classList.add('bonus-header-extend');
      Object.assign(thBonus.style, {
        position: 'sticky',
        right: 'var(--finalW)',
        zIndex: 62,
        background: 'var(--bonus-bg)',
        backgroundClip: 'padding-box',
        overflow: 'visible'
      });
    };

    paint();
    // keep it correct on resizes/layout changes
    const ro = new ResizeObserver(paint);
    if (tbl.tHead) ro.observe(tbl.tHead);
    ro.observe(thBonus);
    window.addEventListener('resize', paint);
  });
})();
