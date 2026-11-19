import { test } from 'node:test';
import assert from 'node:assert/strict';
import { developmentReference, developmentStages } from '../public/development-data.js';
import { developmentAssessmentSource, developmentAssessmentStages } from '../public/development-assessment-data.js';
import { developmentAssessmentOutcome, developmentWindow, notifyDevelopment } from '../public/development.js';
import { homeObservation, observationPrompts } from '../public/development-prompts.js';

const localDate = value => new Date(`${value}T12:00:00`);
const storageFixture = () => {
  const values = new Map();
  return { values, getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) };
};

test('首页成长小观察按年龄使用日常互动或当前自评阶段条目，每次保存后间隔3天', () => {
  const newbornBirthday = '2026-10-29';
  const newborn = homeObservation(newbornBirthday, '2026-11-18');
  assert.equal(newborn.prompt.context, '日常互动随记');
  assert.equal(newborn.ready, true);
  assert.equal(observationPrompts('2026-10-29', '2026-10-28').length, 0);

  const currentBirthday = '2026-05-18';
  const first = homeObservation(currentBirthday, '2026-11-18');
  assert.match(first.prompt.context, /6月龄参考/);
  const saved = { promptId: first.prompt.id, observedOn: '2026-11-18' };
  const next = homeObservation(currentBirthday, '2026-11-19', [saved]);
  assert.equal(next.ready, false);
  assert.equal(next.nextOn, '2026-11-21');
  assert.notEqual(next.prompt.id, first.prompt.id);
  assert.equal(homeObservation(currentBirthday, '2026-11-21', [saved]).ready, true);
  assert.equal(homeObservation('2020-01-01', '2026-11-18'), null);
});

test('官方附件4完整保留8个月龄、五个领域各一项标志和来源', () => {
  assert.deepEqual(developmentAssessmentStages.map(stage => stage.ageMonths), [3, 6, 8, 12, 18, 24, 30, 36]);
  assert.ok(developmentAssessmentStages.every(stage => stage.domains.length === 5 && stage.domains.every(domain => domain.items.length === 1)));
  assert.equal(developmentAssessmentStages.reduce((count, stage) => count + stage.domains.reduce((n, domain) => n + domain.items.length, 0), 0), 40);
  assert.deepEqual(developmentAssessmentStages.map(stage => stage.domains.map(domain => domain.name)), Array(8).fill(['大运动', '精细动作', '语言', '认知', '社会交往']));
  assert.equal(developmentAssessmentStages[0].domains[0].items[0], '被竖抱时头可以稳稳地立着');
  assert.equal(developmentAssessmentStages[7].domains[4].items[0], '自己穿鞋子或袜子');
  assert.equal(developmentAssessmentSource.attachmentUrl, 'https://www.nhc.gov.cn/fys/c100078/202502/19c9c6dee0274d23822f313a99ae1779/files/1741749469944_58197.pdf');
});

test('自评建议只按未出现项数应用卫健委说明，未完成项目保持待记录', () => {
  assert.deepEqual(developmentAssessmentOutcome(['yes', 'yes', 'yes', 'yes', 'yes']), { missing: 0, incomplete: false, level: 'observed' });
  assert.equal(developmentAssessmentOutcome(['no', 'yes', 'yes', 'yes', 'yes']).level, 'consult');
  assert.equal(developmentAssessmentOutcome(['no', 'unsure', 'yes', 'yes', 'yes']).level, 'incomplete');
  assert.equal(developmentAssessmentOutcome(['no', 'no', 'unsure', 'yes', 'yes']).level, 'medical');
  assert.equal(developmentAssessmentOutcome(['yes']).level, 'incomplete');
  assert.equal(developmentAssessmentOutcome(Array(5).fill('unsure')).level, 'incomplete');
});

test('官方附件1结构化为11个年龄、44条征象，标识唯一并保留出处和转诊说明', () => {
  assert.deepEqual(developmentStages.map(stage => stage.ageMonths), [3, 6, 8, 12, 18, 24, 30, 36, 48, 60, 72]);
  const signs = developmentStages.flatMap(stage => stage.signs);
  assert.ok(developmentStages.every(stage => stage.signs.length === 4));
  assert.equal(new Set(signs.map(sign => sign.id)).size, 44);
  assert.ok(signs.every(sign => typeof sign.text === 'string' && sign.text.length > 0));
  assert.equal(developmentStages[0].signs[2].text, '不注视人脸，不追视移动人或物品');
  assert.equal(developmentStages[6].signs[0].text, '不会说2—3个字的短语');
  assert.equal(developmentStages.at(-1).signs[3].text, '不会奔跑');
  assert.match(developmentReference.source.url, /^https:\/\/www\.nhc\.gov\.cn\//);
  assert.match(developmentReference.guidance.positive, /任意一项.*不能据此诊断孤独症/);
  assert.match(developmentReference.guidance.regression, /任何年龄.*倒退/);
});

test('每个官方节点只在对应完整月龄提醒，前一天不提前、下个月不积压', () => {
  for (const stage of developmentStages) {
    const dueDate = new Date(2020, stage.ageMonths, 15, 12);
    const previous = new Date(2020, stage.ageMonths, 14, 12);
    const lastDay = new Date(2020, stage.ageMonths + 1, 14, 12);
    const after = new Date(2020, stage.ageMonths + 1, 15, 12);
    assert.equal(developmentWindow('2020-01-15', previous).next, stage);
    assert.equal(developmentWindow('2020-01-15', previous).due, null);
    assert.equal(developmentWindow('2020-01-15', dueDate).due, stage);
    assert.equal(developmentWindow('2020-01-15', lastDay).due, stage);
    assert.equal(developmentWindow('2020-01-15', after).due, null);
  }
});

test('新生儿只显示下个节点，超过最后监测窗口不会继续提示6岁到期', () => {
  const newborn = developmentWindow('2026-10-29', localDate('2026-11-17'));
  assert.equal(newborn.months, 0);
  assert.equal(newborn.due, null);
  assert.equal(newborn.next.ageMonths, 3);
  assert.equal(newborn.nextOn, '2027-01-29');
  assert.deepEqual(developmentWindow('2020-01-15', localDate('2026-02-15')), { months: 73, due: null, next: null, nextOn: null });
});

test('月末生日和闰年按本地日历收敛到当月最后一天，不受时分影响', () => {
  assert.equal(developmentWindow('2026-08-31', localDate('2026-11-29')).due, null);
  assert.equal(developmentWindow('2026-08-31', localDate('2026-11-30')).due.ageMonths, 3);
  assert.equal(developmentWindow('2026-08-31', new Date(2026, 10, 30, 0)).due.ageMonths, 3);
  assert.equal(developmentWindow('2024-02-29', localDate('2025-02-27')).nextOn, '2025-02-28');
  assert.equal(developmentWindow('2024-02-29', localDate('2025-02-28')).due.ageMonths, 12);
  assert.equal(developmentWindow('2026-11-30', localDate('2027-02-27')).nextOn, '2027-02-28');
});

test('无效、未来或缺失生日以及无效当前时间都不生成月龄提醒', () => {
  for (const birthday of [null, undefined, '', '2026-02-30', '2027-01-01', '2026-13-01']) {
    assert.deepEqual(developmentWindow(birthday, localDate('2026-11-17')), { months: null, due: null, next: null, nextOn: null });
  }
  assert.equal(developmentWindow('2026-01-01', new Date(NaN)).months, null);
});

test('同一宝宝同一节点通知去重，新节点和修改生日后独立处理', () => {
  const storage = storageFixture();
  const messages = [];
  const notify = (...args) => messages.push(args);
  const options = { birthday: '2025-01-16', now: localDate('2025-04-16'), storage, notify };
  assert.equal(notifyDevelopment(options), true);
  assert.equal(notifyDevelopment(options), false);
  assert.equal(messages.length, 1);
  assert.match(messages[0][0], /3月龄/);
  assert.match(messages[0][1].body, /儿童保健门诊/);
  assert.equal(storage.getItem('babycare:development:2025-01-16:3'), 'sent');
  assert.equal(notifyDevelopment({ ...options, now: localDate('2025-07-16') }), true);
  assert.equal(notifyDevelopment({ ...options, birthday: '2025-01-17', now: localDate('2025-04-17') }), true);
});

test('已持久化节点跨刷新跳过，未到节点不发，失败可重试，存储不可用仍做会话去重', () => {
  const storage = storageFixture();
  storage.setItem('babycare:development:2025-02-18:3', 'sent');
  const options = { birthday: '2025-02-18', now: localDate('2025-05-18'), storage, notify: () => assert.fail('should not notify') };
  assert.equal(notifyDevelopment(options), false);
  assert.equal(notifyDevelopment({ ...options, now: localDate('2025-04-18') }), false);
  assert.equal(notifyDevelopment({ ...options, birthday: '2025-02-19', notify: undefined }), false);
  const retry = { ...options, birthday: '2025-02-20', now: localDate('2025-05-20') };
  assert.equal(notifyDevelopment({ ...retry, notify: () => { throw new Error('unavailable'); } }), false);
  assert.equal(storage.getItem('babycare:development:2025-02-20:3'), undefined);
  assert.equal(notifyDevelopment({ ...retry, notify: () => {} }), true);
  const blocked = { birthday: '2025-02-21', now: localDate('2025-05-21'), storage: { getItem() { throw new Error(); }, setItem() { throw new Error(); } }, notify: () => {} };
  assert.equal(notifyDevelopment(blocked), true);
  assert.equal(notifyDevelopment(blocked), false);
});
