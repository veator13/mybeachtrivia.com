const RADIUS = 52;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function setRing(el) {
  if (!el) return;
  el.style.strokeDasharray = `${CIRCUMFERENCE}`;
  el.style.strokeDashoffset = "0";
}

export function updateRing(el, remaining, total) {
  if (!el) return;
  const safeTotal = Math.max(total, 1);
  const percent = remaining / safeTotal;
  const offset = CIRCUMFERENCE * (1 - percent);
  el.style.strokeDashoffset = `${offset}`;
}

export function isWarningTime(seconds) {
  return seconds <= 5;
}