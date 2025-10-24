import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js';

(function mount(){
  const html = `
    <div id="auth-gate" class="hidden">
      <div class="card">
        <h3>Admin sign-in</h3>
        <input id="ag-email" type="email" placeholder="Email">
        <input id="ag-pass" type="password" placeholder="Password">
        <button id="ag-login">Sign in</button>
        <div class="hint">Access limited to admins. This UI is only on the generator page.</div>
      </div>
    </div>`;
  const t = document.createElement('template'); t.innerHTML = html.trim();
  const root = t.content.firstChild; document.body.appendChild(root);

  const show = () => root.classList.remove('hidden');
  const hide = () => root.classList.add('hidden');

  document.addEventListener('click', async e => {
    if (e.target && e.target.id === 'ag-login') {
      const email = document.getElementById('ag-email').value.trim();
      const pass  = document.getElementById('ag-pass').value;
      try { await window._signInEmail(email, pass); } catch (err) { alert((err && err.message) || err); }
    }
  });

  const waitForAuth = () => new Promise(res => {
    if (window.auth) return res(window.auth);
    const iv = setInterval(() => { if (window.auth) { clearInterval(iv); res(window.auth); } }, 50);
  });

  waitForAuth().then(auth => onAuthStateChanged(auth, u => u ? hide() : show()));
})();
