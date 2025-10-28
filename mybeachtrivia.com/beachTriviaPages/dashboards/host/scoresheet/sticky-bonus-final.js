(() => {
  const ready = (fn) => (document.readyState === 'loading')
    ? document.addEventListener('DOMContentLoaded', fn, { once: true })
    : fn();

  ready(() => {
    const tbl = document.querySelector('#teamTable') || document.querySelector('table');
    const thead = tbl?.tHead;
    if (!tbl || !thead) return;

    const width = (el) => Math.ceil(el.getBoundingClientRect().width || el.offsetWidth || 0);

    // Set --finalW for sticky offsets
    const finals = tbl.querySelectorAll('td.sticky-right-final, th.sticky-right-final, td.sticky-col-right, th.sticky-col-right');
    const finalW = finals.length ? Math.max(...[...finals].map(width), 116) : 116;
    tbl.style.setProperty('--finalW', finalW + 'px');

    // Find a BONUS body cell for background/width, normalize .bonus-td to sticky class
    const bonusBody = tbl.querySelector('tbody td.sticky-right-bonus, tbody td.bonus-td');
    if (!bonusBody) return;
    tbl.querySelectorAll('tbody td.bonus-td').forEach(td => td.classList.add('sticky-right-bonus'));

    const bonusBG = getComputedStyle(bonusBody).backgroundColor || '#111';
    tbl.style.setProperty('--bonus-bg', bonusBG);
    const bonusW = width(bonusBody);
    if (bonusW) tbl.style.setProperty('--bonus-w', bonusW + 'px');

    // Locate the visible BONUS header cell
    const thBonus = [...thead.querySelectorAll('th,td')]
      .find(h => /^(bonus)$/i.test((h.textContent || '').replace(/\s+/g,' ').trim()));
    if (!thBonus) return;

    // Make BONUS header sticky + allow the extender to paint below
    Object.assign(thBonus.style, {
      position: 'sticky',
      right: 'var(--finalW)',
      zIndex: 62,
      background: 'var(--bonus-bg)',
      backgroundClip: 'padding-box',
      overflow: 'visible'
    });

    // Create/upsert the extender element that fills the THEAD gap below BONUS
    let mask = thBonus.querySelector('#bonus-gap-mask');
    if (!mask) {
      mask = document.createElement('div');
      mask.id = 'bonus-gap-mask';
      Object.assign(mask.style, {
        position: 'absolute',
        left: 0, right: 0,
        top: '100%',
        height: '0px',
        background: 'var(--bonus-bg)',
        pointerEvents: 'none',
        zIndex: 61
      });
      thBonus.appendChild(mask);
    }

    const repaint = () => {
      const h = Math.max(0, Math.ceil(thead.getBoundingClientRect().bottom - thBonus.getBoundingClientRect().bottom)) + 2;
      mask.style.height = h + 'px';
    };

    repaint();
    new ResizeObserver(repaint).observe(thead);
    new ResizeObserver(repaint).observe(thBonus);
    window.addEventListener('resize', repaint, { passive: true });
    window.addEventListener('scroll', repaint, { passive: true });
  });
})();
