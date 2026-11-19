import test from 'node:test';
import assert from 'node:assert/strict';
import { setupMobileNavigation } from '../public/mobile-navigation.js';

function harness() {
  const listeners = {}, viewportListeners = {};
  let resize, current = 0, overlay = false, selectedText = '';
  const switches = [], placements = [];
  const buttons = [0, 1, 2].map(index => ({ click() { current = index; switches.push(index); } }));
  const mobile = { matches: true, addEventListener(type, listener) { resize = listener; } };
  const tabs = {
    before() {},
    querySelector: () => buttons[current],
    querySelectorAll: () => buttons
  };
  const shell = {
    querySelector: () => ({ after: () => placements.push('mobile') }),
    addEventListener(type, listener, options) { listeners[type] = listener; assert.equal(options.passive, true); }
  };
  const priorDocument = globalThis.document;
  globalThis.document = { createComment: () => ({ after: () => placements.push('desktop') }) };
  try {
    setupMobileNavigation({ shell, tabs, mobile,
      viewport: { innerWidth: 390, addEventListener(type, listener) { viewportListeners[type] = listener; } },
      blocked: () => overlay, selection: () => selectedText });
  } finally { globalThis.document = priorDocument; }
  const point = (x, y = 300, identifier = 1) => ({ clientX: x, clientY: y, identifier });
  const emit = (type, touches, changedTouches = [], excluded = false) => {
    listeners[type]({ touches, changedTouches, target: { closest: () => excluded } });
  };
  const swipe = (from, to, excluded = false) => {
    emit('touchstart', [point(from)], [], excluded);
    emit('touchmove', [point(to)]);
    emit('touchend', [], [point(to)]);
  };
  return { emit, point, swipe, switches, placements, viewportListeners,
    setCurrent: value => { current = value; },
    setOverlay: value => { overlay = value; },
    setSelection: value => { selectedText = value; },
    setMobile: value => { mobile.matches = value; resize(); } };
}

test('正文左右滑切换相邻页，首尾不循环，手机和桌面恢复各自导航位置', () => {
  const h = harness();
  h.swipe(260, 130); h.swipe(260, 130); h.swipe(260, 130);
  h.swipe(130, 260); h.swipe(130, 260); h.swipe(130, 260);
  assert.deepEqual(h.switches, [1, 2, 1, 0]);
  h.setMobile(false); h.swipe(260, 130);
  assert.equal(h.switches.length, 4);
  h.setMobile(true);
  assert.deepEqual(h.placements, ['mobile', 'desktop', 'mobile']);
});

test('两侧32像素边缘均不切页，向内和向外滑都交给浏览器', () => {
  const h = harness(); h.setCurrent(1);
  for (const start of [0, 16, 32, 358, 375, 390]) {
    h.swipe(start, 200); h.swipe(start, start < 100 ? 0 : 390);
  }
  assert.deepEqual(h.switches, []);
  h.swipe(240, 130);
  assert.deepEqual(h.switches, [2]);
});

test('纵向滚动、斜滑、短划和touchcancel不会误触切页', () => {
  const h = harness(), p = h.point;
  for (const [middle, end] of [
    [p(195, 340), p(80, 345)], // Initially vertical, then turns horizontal.
    [p(150, 350), p(100, 400)],
    [p(180, 300), p(150, 300)]
  ]) {
    h.emit('touchstart', [p(200)]); h.emit('touchmove', [middle]); h.emit('touchend', [], [end]);
  }
  h.emit('touchstart', [p(260)]); h.emit('touchcancel', []); h.emit('touchend', [], [p(100)]);
  assert.deepEqual(h.switches, []);
});

test('多指、不同触点、表单图表、弹窗和文字选择不切页', () => {
  const h = harness(), p = h.point;
  h.swipe(260, 100, true);
  h.setOverlay(true); h.swipe(260, 100); h.setOverlay(false);
  h.setSelection('selected'); h.swipe(260, 100); h.setSelection('');
  h.emit('touchstart', [p(260), p(240, 300, 2)]); h.emit('touchend', [], [p(100)]);
  h.emit('touchstart', [p(260)]); h.emit('touchmove', [p(250), p(240, 300, 2)]); h.emit('touchend', [], [p(100)]);
  h.emit('touchstart', [p(260)]); h.emit('touchend', [], [p(100, 300, 2)]);
  assert.deepEqual(h.switches, []);
});

test('滑动期间切页、改变屏幕宽度、打开弹窗，均取消本次手势', () => {
  const h = harness(), p = h.point;
  h.emit('touchstart', [p(260)]); h.viewportListeners.hashchange(); h.emit('touchend', [], [p(100)]);
  h.emit('touchstart', [p(260)]); h.setMobile(false); h.setMobile(true); h.emit('touchend', [], [p(100)]);
  h.emit('touchstart', [p(260)]); h.setOverlay(true); h.emit('touchend', [], [p(100)]);
  assert.deepEqual(h.switches, []);
});
