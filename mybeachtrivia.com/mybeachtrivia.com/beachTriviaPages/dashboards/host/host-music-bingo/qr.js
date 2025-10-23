// qr.js — render QR code using whichever library is present
// Supports: soldair's `qrcode` (qrcode.toCanvas/ toString) and davidshim's `QRCode` class.

export function renderJoinQRCode(target, url, size = 200) {
  const el = typeof target === 'string' ? document.querySelector(target) : target;
  if (!el) return;
  el.innerHTML = '';

  // 1) soldair/qrcode (what you currently have: window.qrcode object)
  if (typeof window !== 'undefined' && window.qrcode && typeof window.qrcode.toCanvas === 'function') {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    el.appendChild(canvas);

    window.qrcode.toCanvas(
      canvas,
      url,
      { width: size, margin: 1, errorCorrectionLevel: 'M' },
      (err) => {
        if (err) {
          console.error('QR render (toCanvas) failed:', err);
          fallback(el, url);
        }
      }
    );
    return;
  }

  // 2) davidshimjs/QRCode (global constructor)
  if (typeof window !== 'undefined' && window.QRCode) {
    // eslint-disable-next-line no-undef
    new QRCode(el, {
      text: url,
      width: size,
      height: size,
      // eslint-disable-next-line no-undef
      correctLevel: QRCode.CorrectLevel?.M ?? 1, // 1 == M
    });
    return;
  }

  // 3) Fallback: show the URL (always works)
  fallback(el, url);
}

function fallback(container, url) {
  console.warn('QRCode library missing or failed; showing URL instead.');
  const p = document.createElement('p');
  p.className = 'qr-fallback-url';
  p.textContent = url;
  container.appendChild(p);
}