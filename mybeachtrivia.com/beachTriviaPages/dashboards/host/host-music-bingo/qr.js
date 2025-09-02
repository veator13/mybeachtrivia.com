// qr.js — local QR rendering wrapper around qrcode.min.js
export function renderJoinQRCode(target, url, size = 180) {
    const el = typeof target === 'string' ? document.querySelector(target) : target;
    if (!el) return;
    el.innerHTML = '';
  
    if (typeof window !== 'undefined' && window.QRCode) {
      // eslint-disable-next-line no-undef
      new QRCode(el, {
        text: url,
        width: size,
        height: size,
        // eslint-disable-next-line no-undef
        correctLevel: QRCode.CorrectLevel.M,
      });
    } else {
      console.warn('QRCode library missing. Showing URL instead.');
      const p = document.createElement('p');
      p.textContent = url;
      el.appendChild(p);
    }
  }