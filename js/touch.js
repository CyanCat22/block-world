/* =========================================================
 *  touch.js — 触屏虚拟摇杆 / 视角拖动 / 动作按钮
 * =======================================================*/
(function () {
  'use strict';

  function isTouch() {
    return ('ontouchstart' in window) || (navigator.maxTouchPoints > 0) ||
      (window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
  }

  function init() {
    const game = window.__game;
    if (!game) return;
    if (!isTouch()) return;
    const wrap = document.getElementById('touch-controls');
    if (!wrap) return;
    wrap.classList.remove('hidden');
    document.body.classList.add('touch');
    game.touch = { active: true, x: 0, y: 0, lookX: 0, lookY: 0 };

    const stick = document.getElementById('touch-stick');
    const knob = document.getElementById('touch-knob');
    let stickId = null, stickCenter = { x: 0, y: 0 };

    const setStick = (dx, dy) => {
      const max = 52;
      const len = Math.hypot(dx, dy);
      const k = len > max ? max / len : 1;
      const kx = dx * k, ky = dy * k;
      knob.style.transform = `translate(${kx}px, ${ky}px)`;
      game.touch.x = kx / max;
      game.touch.y = ky / max;
    };
    const resetStick = () => {
      stickId = null;
      game.touch.x = 0; game.touch.y = 0;
      knob.style.transform = 'translate(0,0)';
    };
    const stickStart = (e) => {
      const t = e.changedTouches[0];
      stickId = t.identifier;
      const r = stick.getBoundingClientRect();
      stickCenter = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      setStick(t.clientX - stickCenter.x, t.clientY - stickCenter.y);
      e.preventDefault();
    };
    const stickMove = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier !== stickId) continue;
        setStick(t.clientX - stickCenter.x, t.clientY - stickCenter.y);
        e.preventDefault();
      }
    };
    const stickEnd = (e) => {
      for (const t of e.changedTouches) if (t.identifier === stickId) resetStick();
    };
    stick.addEventListener('touchstart', stickStart, { passive: false });
    stick.addEventListener('touchmove', stickMove, { passive: false });
    stick.addEventListener('touchend', stickEnd);
    stick.addEventListener('touchcancel', stickEnd);

    // 右侧拖动视角
    let lookId = null, lastX = 0, lastY = 0;
    const lookStart = (e) => {
      if (game.ui.modal || game.paused) return;
      const t = e.changedTouches[0];
      if (t.clientX < window.innerWidth * 0.42) return;
      lookId = t.identifier; lastX = t.clientX; lastY = t.clientY;
      e.preventDefault();
    };
    const lookMove = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier !== lookId) continue;
        game.touch.lookX += t.clientX - lastX;
        game.touch.lookY += t.clientY - lastY;
        lastX = t.clientX; lastY = t.clientY;
        e.preventDefault();
      }
    };
    const lookEnd = (e) => {
      for (const t of e.changedTouches) if (t.identifier === lookId) lookId = null;
    };
    document.getElementById('touch-look').addEventListener('touchstart', lookStart, { passive: false });
    document.getElementById('touch-look').addEventListener('touchmove', lookMove, { passive: false });
    document.getElementById('touch-look').addEventListener('touchend', lookEnd);
    document.getElementById('touch-look').addEventListener('touchcancel', lookEnd);

    // 动作按钮
    const press = (action, down) => {
      if (action === 'jump') {
        if (down) game.keys.add('Space'); else game.keys.delete('Space');
      } else if (action === 'run') {
        if (!down) return;
        if (game.keys.has('ShiftLeft')) game.keys.delete('ShiftLeft');
        else game.keys.add('ShiftLeft');
      } else if (action === 'attack') {
        if (down) { game.mouse.left = true; game.mouse.leftPressed = true; }
        else game.mouse.left = false;
      } else if (action === 'use') {
        if (down) { game.mouse.right = true; game.mouse.rightPressed = true; }
        else game.mouse.right = false;
      } else if (action === 'bag') {
        if (down) {
          if (game.ui.modal) game.closeModal();
          else if (game.started && !game.paused) game.openInventory();
        }
      }
    };
    wrap.querySelectorAll('[data-touch]').forEach(btn => {
      const action = btn.getAttribute('data-touch');
      const on = (e) => { press(action, true); e.preventDefault(); };
      const off = (e) => { press(action, false); e.preventDefault(); };
      btn.addEventListener('touchstart', on, { passive: false });
      btn.addEventListener('touchend', off);
      btn.addEventListener('touchcancel', off);
      btn.addEventListener('mousedown', on);
      btn.addEventListener('mouseup', off);
    });
    window.dispatchEvent(new CustomEvent('mc-touch-ready'));
  }

  window.addEventListener('load', () => setTimeout(init, 50));
  if (document.readyState === 'complete') setTimeout(init, 60);
})();