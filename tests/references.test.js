import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ageInMonths, vaccineStageStates, growthReference } from '../public/references-model.js';
import { feedingReferenceForMonth, feedingReferenceRows, milkReference } from '../public/nutrition.js';

const schedule = JSON.parse(readFileSync(new URL('../docs/vaccination-schedule.json', import.meta.url)));
const localDate = value => new Date(`${value}T12:00:00`);
const stage = (birthday, date) => {
  const states = vaccineStageStates(schedule.rows, birthday, localDate(date));
  return ['current', 'next'].map(value => schedule.rows[states.indexOf(value)]?.age ?? null);
};

test('疫苗路线在出生、满月、半月龄、周岁和6岁边界切换，并排除年度项目', () => {
  for (const [at, current, next] of [
    ['2026-01-01', '出生时', '1月龄（满月）'],
    ['2026-01-31', '出生时', '1月龄（满月）'],
    ['2026-02-01', '1月龄（满月）', '1.5月龄'],
    ['2026-02-14', '1月龄（满月）', '1.5月龄'],
    ['2026-02-15', '1.5月龄', '2月龄'],
    ['2026-12-31', '11月龄', '12～15月龄'],
    ['2027-01-01', '12～15月龄', '15月龄'],
    ['2027-07-01', '18～19月龄', '2周岁'],
    ['2028-01-01', '2周岁', '3周岁'],
    ['2031-12-31', '3周岁', '6周岁'],
    ['2032-01-01', '6周岁', null]
  ]) assert.deepEqual(stage('2026-01-01', at), [current, next], at);
  const states = vaccineStageStates(schedule.rows, '2026-01-01', localDate('2032-01-01'));
  assert.equal(states.at(-1), '');
  assert.equal(states[0], 'past');
});

test('月末出生、闰年和跨年使用相邻满月日期定位半月龄', () => {
  assert.equal(ageInMonths('2026-01-31', localDate('2026-02-28')), 1);
  assert.ok(ageInMonths('2026-01-31', localDate('2026-03-15')) < 1.5);
  assert.ok(ageInMonths('2026-01-31', localDate('2026-03-16')) >= 1.5);
  assert.deepEqual(stage('2026-01-31', '2026-03-16'), ['1.5月龄', '2月龄']);
  assert.equal(ageInMonths('2024-02-29', localDate('2025-02-28')), 12);
  assert.equal(ageInMonths('2025-12-31', localDate('2026-01-31')), 1);
});

test('生日缺失、无效、未来日期不会错误标记疫苗年龄', () => {
  for (const birthday of [null, '', '2026-02-30', '2027-01-01']) {
    assert.equal(ageInMonths(birthday, localDate('2026-11-17')), null);
    assert.ok(vaccineStageStates(schedule.rows, birthday, localDate('2026-11-17')).every(value => value === ''));
  }
  assert.equal(ageInMonths('2026-01-01', new Date(NaN)), null);
});

test('23个疫苗节点保留原表52条项目、原始简称、组合价格、未知价格和年龄范围', () => {
  assert.equal(schedule.rows.length, 23);
  assert.equal(schedule.rows.reduce((count, row) => count + row.free.length + row.selfPaid.length, 0), 52);
  assert.ok(schedule.rows.every(row => Number.isFinite(row.ageMonths)));
  assert.equal(schedule.rows.find(row => row.age === '12～15月龄').ageEndMonths, 15);
  assert.equal(schedule.rows.find(row => row.age === '18～19月龄').ageEndMonths, 19);
  const paid = schedule.rows.flatMap(row => row.selfPaid);
  assert.equal(paid.find(item => item.name === '13价肺炎TT①').priceYuan, 621);
  assert.equal(paid.find(item => item.name === '13价肺炎197①').priceYuan, 721);
  assert.equal(paid.find(item => item.name === '五价轮状病毒① / 六价轮状病毒①').priceYuan, '303 / 321');
  assert.equal(paid.find(item => item.name === '流感疫苗').priceYuan, null);
});

test('喂养资料与首页在每个月龄边界共用奶量，亲喂不使用毫升判断', () => {
  assert.equal(feedingReferenceRows.length, 8);
  for (const months of [0, 1, 2, 3, 5, 6, 7, 8, 11, 12, 17, 18, 24, 25, 36]) {
    const now = new Date(2023 + Math.floor(months / 12), months % 12, 1, 12);
    const row = feedingReferenceForMonth(months);
    const home = milkReference('2023-01-01', 'formula', now);
    assert.deepEqual([row.min, row.max], [home.min, home.max], `${months} months`);
    assert.equal(milkReference('2023-01-01', 'breast', now).min, null);
  }
  assert.equal(feedingReferenceForMonth(null), null);
  assert.equal(feedingReferenceForMonth(-1), null);
});

test('成长标准按宝宝性别标记并显示真实测量，不在另一性别表制造标记', () => {
  const options = { baby: { birthday: '2026-01-31', sex: 'male' }, sex: 'male', kind: 'weight', now: localDate('2026-03-01'), measurements: [
    { measured_on: '2026-02-28', weight_grams: 4610 },
    { measured_on: '2027-01-01', weight_grams: 9000 }
  ] };
  const result = growthReference(options);
  assert.equal(result.activeMonth, 1);
  assert.equal(result.measuredMonth, 1);
  assert.equal(result.actual, 4.61);
  assert.equal(result.latest.measured_on, '2026-02-28');
  const other = growthReference({ ...options, sex: 'female' });
  assert.equal(other.activeMonth, null);
  assert.equal(other.actual, null);
  assert.equal(growthReference({ ...options, measurements: [] }).actual, null);
  assert.equal(growthReference({ ...options, baby: { birthday: '2026-01-31' } }).activeMonth, null);
});

test('成长表筛选保留七个官方百分位，6岁可标记，7岁不外推', () => {
  const options = { baby: { birthday: '2020-11-17', sex: 'female' }, sex: 'female', kind: 'length', now: localDate('2026-11-17') };
  const result = growthReference(options);
  assert.equal(result.activeMonth, 72);
  assert.ok(result.rows.every(row => row.values.length === 7));
  assert.ok(growthReference({ ...options, range: '48:84' }).rows.every(row => row.month >= 48 && row.month < 84));
  assert.equal(growthReference({ ...options, now: localDate('2027-11-17') }).activeMonth, null);
  assert.equal(growthReference({ ...options, now: localDate('2019-11-17') }).activeMonth, null);
});
