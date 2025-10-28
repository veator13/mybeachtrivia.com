(() => {
  const tbl = document.querySelector('#teamTable') || document.querySelector('table');
  if (!tbl) return;

  // Find a Final cell for width; support either class name you use
  const finals = tbl.querySelectorAll(
    'td.sticky-right-final, th.sticky-right-final, td.sticky-col-right, th.sticky-col-right'
  );
  const finalW = finals.length
    ? Math.max(...[...finals].map(el => Math.ceil(el.getBoundingClientRect().width || el.offsetWidth)), 116)
    : 116;
  tbl.style.setProperty('--finalW', finalW + 'px');

  // Find a Bonus body cell for width/paint; also tag plain .bonus-td as sticky if present
  const bonusBody = tbl.querySelector('tbody td.sticky-right-bonus, tbody td.bonus-td');
  if (!bonusBody) return;
  tbl.querySelectorAll('tbody td.bonus-td').forEach(td => td.classList.add('sticky-right-bonus'));
  const bonusW = Math.ceil(bonusBody.getBoundingClientRect().width || bonusBody.offsetWidth);
  if (bonusW) tbl.style.setProperty('--bonus-w', bonusW + 'px');

  const bonusBG = getComputedStyle(bonusBody).backgroundColor || '#111';
  tbl.style.setProperty('--bonus-bg', bonusBG);

  // Find the visible BONUS header cell
  const thBonus = [...(tbl.tHead?.querySelectorAll('th,td') || [])]
    .find(h => /bonus/i.test((h.textContent || '').replace(/\s+/g, ' ').trim()));
  if (!thBonus) return;

  // Compute gap from bottom of BONUS th to bottom of THEAD (small bleed)
  const theadBox = tbl.tHead.getBoundingClientRect();
  const hdrBox   = thBonus.getBoundingClientRect();
  const gap = Math.max(0, Math.ceil(theadBox.bottom - hdrBox.bottom)) + 2;
  tbl.style.setProperty('--bonus-gap', gap + 'px');

  // Activate the extender
  thBonus.classList.add('bonus-header-extend');
})();
