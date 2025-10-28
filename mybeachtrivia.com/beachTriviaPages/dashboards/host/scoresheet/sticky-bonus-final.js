(() => {
  const ready = (fn) => (document.readyState === 'loading')
    ? document.addEventListener('DOMContentLoaded', fn, { once: true })
    : fn();

  ready(() => {
    const tbl = document.querySelector('#teamTable') || document.querySelector('table');
    const thead = tbl?.tHead;
    if (!tbl || !thead) return;

    // FINAL width -> CSS var for sticky offsets
    const finals = tbl.querySelectorAll('td.sticky-right-final, th.sticky-right-final, td.sticky-col-right, th.sticky-col-right');
    const width = (el) => Math.ceil(el.getBoundingClientRect().width || el.offsetWidth || 0);
    const finalW = finals.length ? Math.max(...[...finals].map(width), 116) : 116;
    tbl.style.setProperty('--finalW', finalW + 'px');

    // BONUS background/width from a real body cell
    const bonusBody = tbl.querySelector('tbody td.sticky-right-bonus, tbody td.bonus-td');
    if (!bonusBody) return;

    // Normalize plain .bonus-td to sticky class
    tbl.querySelectorAll('tbody td.bonus-td').forEach(td => td.classList.add('sticky-right-bonus'));

    const bonusBG = getComputedStyle(bonusBody).backgroundColor || '#111';
    tbl.style.setProperty('--bonus-bg', bonusBG);
    const bonusW = width(bonusBody);
    if (bonusW) tbl.style.setProperty('--bonus-w', bonusW + 'px');

    // Find the visible BONUS header cell
    let thBonus = [...thead.querySelectorAll('th,td')]
      .find(h => /^(bonus)$/i.test((h.textContent || '').replace(/\s+/g, ' ').trim()));
    if (!thBonus) return;

    // Make BONUS header sticky and allow child mask to extend below it
    Object.assign(thBonus.style, {
      position: 'sticky',
      right: 'var(--finalW)',
      zIndex: 62,
      background: 'var(--bonus-bg)',
      backgroundClip: 'padding-box',
      overflow: 'visible'
    });

    // Create/attach/upsert the extender mask (fills the thead gap below BONUS)
    let mask = thBonus.querySelector('#bonus-gap-mask');
    if (!mask) {
      mask = document.createElement('div');
      mask.id = 'bonus-gap-mask';
      Object.assign(mask.style, {
        position: 'absolute',
        left: 0, right: 0,
        top: '100%',              // start at bottom of BONUS th
        height: '0px',            // set dynamically
        background: 'var(--bonus-bg)',
        pointerEvents: 'none',
        zIndex: 61                // under header text, above body cells
      });
      thBonus.appendChild(mask);
    }

    const repaint = () => {
      // Fill from bottom of BONUS th to bottom of THEAD (+2px bleed)
      const h = Math.max(0, Math.ceil(thead.getBoundingClientRect().bottom - thBonus.getBoundingClientRect().bottom)) + 2;
      mask.style.height = h + 'px';
    };

    repaint();
    // Keep correct on layout changes
    const ro = new ResizeObserver(repaint);
    ro.observe(thead);
    ro.observe(thBonus);
    window.addEventListener('resize', repaint, { passive: true });
    window.addEventListener('scroll', repaint, { passive: true });
  });
})();
