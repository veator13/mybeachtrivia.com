(() => {
  if (window.__FINAL_NEG_GUARD_V2__) return; window.__FINAL_NEG_GUARD_V2__ = 1;

  function bind(el){
    if (!el || el.__negBound) return;
    el.__negBound = true;

    // Allow negatives at attribute level
    el.removeAttribute('min');
    el.step = '1';
    el.inputMode = 'numeric';
    el.setAttribute('pattern','-?[0-9]*');

    // Instance-level hook of the value property (prevents clobbering)
    const proto = Object.getPrototypeOf(el);
    const desc  = Object.getOwnPropertyDescriptor(proto, 'value');
    if (!desc) return;
    const get   = desc.get.bind(el);
    const set   = desc.set.bind(el);

    if (!el.__negHooked) {
      Object.defineProperty(el, 'value', {
        configurable: true,
        get(){ return get(); },
        set(v){
          if (this.__negReentry) return set(v);
          // If user intends a negative, enforce it against programmatic writes
          if (this.__negWant && String(v) !== this.__negWant) {
            this.__negReentry = true; set(this.__negWant); this.__negReentry = false; return;
          }
          set(v);
        }
      });
      el.__negHooked = true;
    }

    const sanitize = () => {
      let s = String(get() ?? '');
      s = s.replace(/[^\d-]/g,'').replace(/(?!^)-/g,'');        // digits + single leading '-'
      if (s === '' || s === '-') { el.__negWant = s; return; }  // transient '-'
      const n = String(Number(s));                               // canonical int
      el.__negWant = n.startsWith('-') ? n : '';                 // remember only negatives
      if (get() !== n) { el.__negReentry = true; set(n); el.__negReentry = false; }
    };

    // Block sci-notation/plus/decimal; let arrows work for table-nav
    el.addEventListener('keydown', e => {
      if (['e','E','+','.'].includes(e.key)) e.preventDefault();
      if (e.key === '-') el.__negWant = '-';
    }, true);

    // Sanitize real user edits; ignore synthetic events
    el.addEventListener('input',  e => { if (!e.isTrusted) return; sanitize(); }, true);
    const finish = () => {
      sanitize();
      const v = get();
      if (v === '' || v === '-') { el.__negWant = ''; el.__negReentry = true; set('0'); el.__negReentry = false; }
    };
    el.addEventListener('change', e => { if (!e.isTrusted) return; finish(); }, true);
    el.addEventListener('blur',   e => { if (!e.isTrusted) return; finish(); }, true);
  }

  // Bind current and future Final Question inputs
  const run = () => document.querySelectorAll('input.finalquestion-input').forEach(bind);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run, { once:true }); else run();
  new MutationObserver(run).observe(document.documentElement, { childList:true, subtree:true });
})();
