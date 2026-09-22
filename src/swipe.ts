import type { Answer } from './game/types';

export function bindSwipe(surface: HTMLElement, canAnswer: () => boolean, answer: (choice: Answer) => void): () => void {
  let drag: { id: number; x: number; y: number; lastX: number; lastTime: number; velocity: number; dx: number; dy: number } | null = null;
  const reset = () => {
    if (drag && surface.hasPointerCapture(drag.id)) surface.releasePointerCapture(drag.id);
    drag = null;
    surface.classList.remove('dragging', 'intent-red', 'intent-green');
    surface.style.removeProperty('transform');
  };
  surface.addEventListener('pointerdown', (event) => {
    if (!canAnswer() || drag || !event.isPrimary || event.button !== 0) return;
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, lastX: event.clientX, lastTime: event.timeStamp, velocity: 0, dx: 0, dy: 0 };
    surface.setPointerCapture(event.pointerId);
    surface.classList.add('dragging');
  });
  surface.addEventListener('pointermove', (event) => {
    if (!drag || drag.id !== event.pointerId) return;
    if (!canAnswer()) { reset(); return; }
    const elapsed = event.timeStamp - drag.lastTime;
    drag.velocity = elapsed > 0 ? (event.clientX - drag.lastX) / elapsed : 0;
    drag.lastTime = event.timeStamp;
    drag.lastX = event.clientX;
    drag.dx = event.clientX - drag.x;
    drag.dy = event.clientY - drag.y;
    const visualDx = Math.max(-140, Math.min(140, drag.dx));
    surface.style.transform = `translateX(${visualDx}px) rotate(${visualDx / 17}deg)`;
    surface.classList.toggle('intent-red', drag.dx < -18);
    surface.classList.toggle('intent-green', drag.dx > 18);
  });
  surface.addEventListener('pointerup', (event) => {
    if (!drag || drag.id !== event.pointerId) return;
    const { dx, dy, velocity, lastTime } = drag;
    const horizontal = Math.abs(dx) > Math.abs(dy) * 1.15;
    const enough = Math.abs(dx) >= Math.min(90, surface.clientWidth * .25);
    const flick = Math.abs(dx) > 28 && Math.abs(velocity) > .55 && event.timeStamp - lastTime < 100;
    reset();
    if (canAnswer() && horizontal && (enough || flick)) answer(dx < 0 ? 'red' : 'green');
  });
  surface.addEventListener('pointercancel', reset);
  surface.addEventListener('lostpointercapture', () => { if (drag) reset(); });
  return reset;
}
