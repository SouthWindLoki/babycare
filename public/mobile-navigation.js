// Observe content swipes without consuming native scrolling or edge navigation.
export function setupMobileNavigation({ shell, tabs, mobile = window.matchMedia('(max-width: 620px)'), viewport = window, blocked = () => document.querySelector('dialog[open], .settings-drawer[aria-hidden="false"]'), selection = () => window.getSelection()?.toString() }) {
  const desktopPosition = document.createComment('desktop navigation position');
  tabs.before(desktopPosition);
  const placeTabs = () => {
    if (mobile.matches) shell.querySelector('.topbar').after(tabs);
    else desktopPosition.after(tabs);
  };
  const excluded = 'a, button, input, select, textarea, label, summary, [contenteditable]:not([contenteditable="false"]), [role="slider"], [role="tablist"], .reference-table-wrap, .trend-chart, .settings-drawer, dialog, [data-no-swipe]';
  let gesture = null;
  const cancel = () => { gesture = null; };
  const unavailable = () => !mobile.matches || blocked() || selection();
  shell.addEventListener('touchstart', event => {
    cancel();
    if (unavailable() || event.touches.length !== 1 || event.target.closest(excluded)) return;
    const touch = event.touches[0];
    // Reserve both edges for the browser, including a wider buffer on large phones.
    const edge = Math.max(32, viewport.innerWidth * 0.08);
    if (touch.clientX <= edge || touch.clientX >= viewport.innerWidth - edge) return;
    gesture = { id: touch.identifier, x: touch.clientX, y: touch.clientY, tab: tabs.querySelector('[aria-selected="true"]') };
  }, { passive: true });
  shell.addEventListener('touchmove', event => {
    if (!gesture) return;
    if (unavailable() || event.touches.length !== 1) return cancel();
    const touch = event.touches[0];
    const dx = Math.abs(touch.clientX - gesture.x), dy = Math.abs(touch.clientY - gesture.y);
    // Once the gesture becomes a scroll, it cannot later become a tab switch.
    if (touch.identifier !== gesture.id || (dy > 12 && dy > dx)) cancel();
  }, { passive: true });
  shell.addEventListener('touchend', event => {
    const start = gesture;
    cancel();
    if (!start || unavailable() || event.touches.length) return;
    const touch = [...event.changedTouches].find(item => item.identifier === start.id);
    if (!touch || tabs.querySelector('[aria-selected="true"]') !== start.tab) return;
    const dx = touch.clientX - start.x, dy = touch.clientY - start.y;
    if (Math.abs(dx) < 64 || Math.abs(dx) < Math.abs(dy) * 1.8) return;
    const buttons = [...tabs.querySelectorAll('[data-home-view]')];
    const index = buttons.indexOf(start.tab);
    if (index < 0) return;
    buttons[index + (dx < 0 ? 1 : -1)]?.click();
  }, { passive: true });
  shell.addEventListener('touchcancel', cancel, { passive: true });
  mobile.addEventListener('change', () => { cancel(); placeTabs(); });
  viewport.addEventListener('hashchange', cancel);
  placeTabs();
}
