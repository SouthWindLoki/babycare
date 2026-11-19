import test from 'node:test';
import assert from 'node:assert/strict';
import { formatDayLabel, formatDate } from '../public/shared.js';

test('今天昨天明天都带完整年月日，超出只显示日期，跨年与闰月正确', () => {
  const now = new Date(2027, 0, 1, 0, 5);
  assert.equal(formatDayLabel(new Date(2027,0,1,23,59), now), '今天 · 2027年1月1日');
  assert.equal(formatDayLabel('2026-12-31', now), '昨天 · 2026年12月31日');
  assert.equal(formatDayLabel('2027-01-02', now), '明天 · 2027年1月2日');
  assert.equal(formatDayLabel('2026-12-30', now), '2026年12月30日');
  assert.equal(formatDayLabel('2027-01-03', now), '2027年1月3日');
  assert.equal(formatDayLabel('2024-02-29', new Date(2024,2,1)), '昨天 · 2024年2月29日');
  assert.equal(formatDayLabel('无效日期', now), '');
  assert.equal(formatDate(new Date()), formatDayLabel(new Date()));
});
