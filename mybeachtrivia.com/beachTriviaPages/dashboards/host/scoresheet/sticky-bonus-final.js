(() => {
  const setupOnce = () => {
    const tbl = document.querySelector('#teamTable') || document.querySelector('table');
    const thead = tbl?.tHead;
    if (!tbl || !thead) return false;

    const finals = tbl.querySelectorAll('td.sticky-right-final, th.sticky-right-final, td.sticky-col-right, th.sticky-col-right');
    const getW = el => Math.ceil(el.getBoundingClientRect().width || el.offsetWidth || 0);
    const finalW = finals.length ? Math.max(...[...finals].map(getW), 116) : 116;
    tbl.style.setProperty('--finalW', finalW + 'px');

    const bonusBody = tbl.querySelector('tbody td.sticky-right-bonus, tbody td.bonus-td');
    if (!bonusBody) return false;
    // normalize plain .bonus-td to sticky
    tbl.querySelectorAll('tbody td.bonus-td').forEach(td => td.classList.add('sticky-right-bonus'));

    const bonusBG = getComputedStyle(bonusBody).backgroundColor || '#111';
    tbl.style.setProperty('--bonus-bg', bonusBG);

    // find BONUS header cell
    let thBonus = [...thead.querySelectorAll('th,td')]
      .find(h => /^(bonus)$/i.test((h.textContent||'').replace(/\s+/g,' ').trim()));
    if (!thBonus) return false;

    // sticky + allow extender
    Object.assign(thBonus.style, {
      position: 'sticky',
      right: 'var(--finalW)',
      zIndex: 62,
      background: 'var(--bonus-bg)',
      backgroundClip: 'padding-box',
      overflow: 'visible'
    });

    // add/update gap mask
    let mask = thBonus.querySelector('#bonus-gap-mask');
    if (!mask) {
      mask = document.createElement('div');
      mask.id = 'bonus-gap-mask';
      Object.assign(mask.style, {
        position: 'absolute', left: 0, right: 0, top: '100%',
        height: '0px', background: 'var(--bonus-bg)',
        pointerEvents: 'none', zIndex: 61
      });
      thBonus.appendChild(mask);
    }

    const repaint = () => {
      if (!document.body.contains(thBonus)) return; // will re-run via observer
      const h = Math.max(0, Math.ceil(thead.getBoundingClientRect().bottom - thBonus.getBoundingClientRect().bottom)) + 2;
      mask.style.height = h + 'px';
    };
    repaint();

    if (!thBonus.__bonusGapWired) {
      const ro = new ResizeObserver(repaint);
      ro.observe(thead); ro.observe(thBonus);
      window.addEventListener('resize', repaint, {passive:true});
      window.addEventListener('scroll', repaint, {passive:true});
      thBonus.__bonusGapWired = ro;
    }

    return true;
  };

  const trySetup = () => {
    if (setupOnce()) return true;
    return false;
  };

  // initial + a short retry loop (for async header builds)
  if (!trySetup()) {
    let n = 0;
    const iv = setInterval(() => {
      n++;
      if (trySetup() || n > 40) clearInterval(iv); // up to ~8s
    }, 200);

    // also watch DOM mutations for header re-renders and re-apply
    const mo = new MutationObserver(() => { trySetup(); });
    mo.observe(document.documentElement, {subtree:true, childList:true});
    setTimeout(() => mo.disconnect(), 120000); // stop after 2 minutes
  }
})();
