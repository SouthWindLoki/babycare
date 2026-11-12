// Keep recording within reach while making room to read on small screens.
export function setupQuickActions() {
  const actions = document.querySelector('#quick-actions');
  const toggle = document.querySelector('.quick-actions-toggle');
  if (!actions || !toggle) return;
  const mobile = window.matchMedia('(max-width: 620px)');
  let lastY = window.scrollY, upwardDistance = 0, idleTimer;
  function expand() {
    clearTimeout(idleTimer);
    document.body.classList.remove('quick-actions-collapsed');
    actions.inert = false;
    toggle.hidden = true;
    toggle.setAttribute('aria-expanded', 'true');
    upwardDistance = 0;
  }
  function collapse() {
    // Never move an action away from someone using the keyboard.
    if (actions.contains(document.activeElement) || document.querySelector('dialog[open]')) return;
    document.body.classList.add('quick-actions-collapsed');
    actions.inert = true;
    toggle.hidden = false;
    toggle.setAttribute('aria-expanded', 'false');
  }
  function measure() {
    document.body.style.setProperty('--quick-actions-height', `${actions.getBoundingClientRect().height}px`);
  }
  window.addEventListener('scroll', () => {
    const y = Math.max(0, window.scrollY), delta = y - lastY;
    lastY = y;
    if (!mobile.matches) return;
    if (delta > 0) {
      upwardDistance += delta;
      if (upwardDistance >= 12) collapse();
    } else if (delta < 0 || y === 0) expand();
    clearTimeout(idleTimer);
    // Restore after scrolling (including momentum) has stopped.
    idleTimer = setTimeout(expand, 900);
  }, {passive: true});
  toggle.addEventListener('click', () => {
    expand();
    actions.querySelector('a').focus({preventScroll: true});
  });
  actions.addEventListener('focusin', expand);
  mobile.addEventListener('change', () => { expand(); lastY = window.scrollY; measure(); });
  window.addEventListener('pageshow', expand);
  if ('ResizeObserver' in window) new ResizeObserver(measure).observe(actions);
  measure();
}
