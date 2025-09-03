// qr.js — local QR rendering wrapper around qrcode.min.js
export function renderJoinQRCode(target, url, size = 180) {
  const el = typeof target === 'string' ? document.querySelector(target) : target;
  if (!el) return;
  el.innerHTML = '';

  if (typeof window !== 'undefined' && window.QRCode) {
    try {
      // Force SVG output to avoid CSP/data: issues
      // eslint-disable-next-line no-undef
      new QRCode(el, {
        text: url,
        width: size,
        height: size,
        // eslint-disable-next-line no-undef
        correctLevel: QRCode.CorrectLevel.M,
        useSVG: true,   // ✅ key: ensures QR renders as <svg>
      });
      console.log("✅ QR rendered successfully in SVG mode:", url);
    } catch (e) {
      console.error("❌ QR render failed, fallback to URL:", e);
      const p = document.createElement('p');
      p.textContent = url;
      el.appendChild(p);
    }
  } else {
    console.warn('⚠️ QRCode library missing. Showing URL instead.');
    const p = document.createElement('p');
    p.textContent = url;
    el.appendChild(p);
  }
}