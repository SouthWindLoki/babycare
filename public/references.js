import { api, babyAge, showToast } from '/shared.js';
import { completedMonths, feedingReferenceRows, feedingReferenceForMonth } from '/nutrition.js';
import { vaccineStageStates, growthReference } from '/references-model.js';
import { developmentReference, developmentStages } from '/development-data.js';
import { developmentAssessmentSource, developmentAssessmentStages } from '/development-assessment-data.js';
import { developmentAssessmentOutcome, developmentWindow } from '/development.js';
import { observationResponseLabels } from '/development-prompts.js';

export function initReferences(root) {
const $ = selector => root.querySelector(selector);
const state = { baby: null, schedule: null, weights: [], lengths: [], growthKind: 'weight', growthSex: 'male', growthRange: 'all', developmentMonth: null, assessmentMonth: null, assessments: {}, assessmentSaves: {}, observations: [] };
const percentileLabels = ['第3百分位', '第10百分位', '第25百分位', '第50百分位', '第75百分位', '第90百分位', '第97百分位'];

function addText(parent, tag, text, className = '') {
  const node = document.createElement(tag);
  node.textContent = text;
  if (className) node.className = className;
  parent.append(node);
  return node;
}
function addCell(parent, label, value, heading = false) {
  const cell = addText(parent, 'span', value);
  cell.dataset.label = label;
  cell.setAttribute('role', heading ? 'columnheader' : 'cell');
  return cell;
}
function valueText(value, kind) { return Number.isFinite(value) ? kind === 'weight' ? value.toFixed(2) : String(Number(value.toFixed(2))) : '—'; }
function growthRowLabel(month) { return month === 0 ? '出生' : month < 24 ? `${month}月龄` : `${Math.floor(month / 12)}岁${month % 12 ? `${month % 12}个月` : ''}`; }
function currentMonth() { return completedMonths(state.baby?.birthday, new Date()); }
function babyStatus() {
  const month = currentMonth();
  if (!state.baby?.birthday) return '还没有配置宝宝生日；完整资料仍可查看，配置生日后会标记当前阶段。';
  if (month === null) return '宝宝生日无效或尚未到来；请在配置中心核对，当前不标记年龄阶段。';
  return `宝宝生日：${state.baby.birthday} · 当前年龄：${babyAge(state.baby.birthday)}`;
}
const doseNumbers = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九', '二十'];
function appendVaccineName(parent, name) {
  for (const part of name.split(/([①-⑳]+)/)) {
    if (!/^[①-⑳]+$/.test(part)) {
      parent.append(document.createTextNode(part));
      continue;
    }
    const badge = document.createElement('span');
    badge.className = 'vaccine-dose';
    const icon = addText(badge, 'span', '💉', 'vaccine-dose-icon');
    icon.setAttribute('aria-hidden', 'true');
    addText(badge, 'span', [...part].map(char => `第${doseNumbers[char.codePointAt(0) - 0x2460]}针`).join('、'));
    parent.append(badge);
  }
}
function appendVaccineItem(row, item) {
  if (typeof item === 'string') {
    appendVaccineName(row, item);
    return;
  }
  const name = document.createElement('strong');
  appendVaccineName(name, item.name);
  row.append(name);
  const price = item.priceYuan;
  const known = typeof price === 'number' ? Number.isFinite(price) && price >= 0 : typeof price === 'string' && price.trim().length > 0;
  addText(row, 'span', known ? `参考价格：${price}元` : '价格以门诊为准', 'vaccine-price');
  if (item.note) addText(row, 'small', item.note.replace(/^照片注明/, ''), 'vaccine-item-note');
}
function appendList(parent, title, items, className, groups = {}) {
  if (!items?.length) return;
  const section = document.createElement('section');
  section.className = `vaccine-list ${className}`;
  addText(section, 'h4', title);
  const list = document.createElement('ul');
  const renderedGroups = new Set();
  for (const item of items) {
    const groupId = item.alternativeGroup;
    const group = groups[groupId];
    if (group && renderedGroups.has(groupId)) continue;
    const row = document.createElement('li');
    if (group) {
      renderedGroups.add(groupId);
      row.className = 'vaccine-alternative-group';
      addText(row, 'strong', group.title, 'vaccine-choice-title');
      const options = document.createElement('ul');
      options.className = 'vaccine-options';
      for (const alternative of items.filter(option => option.alternativeGroup === groupId)) {
        const card = document.createElement('li');
        card.className = 'vaccine-option-card';
        appendVaccineItem(card, alternative);
        options.append(card);
      }
      row.append(options);
      addText(row, 'small', group.note, 'vaccine-choice-note');
    } else if (item.combinationChoices) {
      row.className = 'vaccine-alternative-group';
      addText(row, 'strong', '四联 / 五联 · 选择一种联合方案', 'vaccine-choice-title');
      const options = document.createElement('ul');
      options.className = 'vaccine-options';
      for (const choice of item.combinationChoices) {
        const card = document.createElement('li');
        card.className = 'vaccine-option-card';
        appendVaccineItem(card, choice);
        options.append(card);
      }
      row.append(options);
      if (item.additionalItems) {
        const additional = document.createElement('ul');
        additional.className = 'vaccine-additional-items';
        for (const extra of item.additionalItems) {
          const extraRow = document.createElement('li');
          appendVaccineItem(extraRow, extra);
          additional.append(extraRow);
        }
        row.append(additional);
      }
    } else appendVaccineItem(row, item);
    if (className === 'vaccine-free' && typeof item === 'string') {
      const replacement = /^※?百白破[①-④]/.test(item) ? '可由四联或五联替代'
        : /^※?脊灰疫苗（IPV）[①-④]/.test(item) ? '可由五联替代' : '';
      if (replacement) addText(row, 'small', replacement, 'vaccine-replacement');
    }
    list.append(row);
  }
  section.append(list);
  parent.append(section);
}
function addChevron(parent) {
  const chevron = addText(parent, 'span', '', 'vaccine-chevron');
  chevron.setAttribute('aria-hidden', 'true');
}
function renderVaccineSummary() {
  const summary = $('#vaccine-summary-lists');
  const expanded = new Set([...summary.querySelectorAll('details[open]')].map(card => card.dataset.category));
  summary.replaceChildren();
  for (const [key, title, className, preview] of [
    ['free', '免费疫苗', 'vaccine-summary-free', '乙肝、卡介苗、脊灰等'],
    ['selfPaid', '自费疫苗', 'vaccine-summary-paid', '肺炎、轮状病毒、联合疫苗等']
  ]) {
    const section = document.createElement('details');
    section.className = `vaccine-summary-card ${className}`;
    section.dataset.category = key;
    section.open = expanded.has(key);
    const head = document.createElement('summary');
    const label = document.createElement('span');
    addText(label, 'strong', title);
    addText(label, 'small', preview, 'vaccine-summary-preview');
    head.append(label);
    addChevron(head);
    section.append(head);
    const list = document.createElement('ul');
    for (const name of state.schedule?.summary?.[key] || []) addText(list, 'li', name);
    section.append(list);
    summary.append(section);
  }
}
function renderVaccines() {
  renderVaccineSummary();
  const route = $('#vaccine-route');
  route.replaceChildren();
  const rows = state.schedule?.rows || [];
  const statuses = vaccineStageStates(rows, state.baby?.birthday);
  $('#vaccine-baby-status').textContent = babyStatus();
  $('#vaccine-source').textContent = '参考：浙江省儿童疫苗接种表';
  $('#vaccine-legend').textContent = '※：该免费疫苗可由相应自费疫苗替代。四联、五联仅替代有效的对应剂次；四联不含脊灰，后续加强针仍按现行程序接种。';
  for (const [index, row] of rows.entries()) {
    const card = document.createElement('article');
    card.className = `vaccine-stage ${statuses[index]}`;
    const head = document.createElement('div');
    head.className = 'vaccine-stage-head';
    const label = document.createElement('div');
    label.className = 'vaccine-stage-label';
    addText(label, 'h4', row.age, 'vaccine-stage-age');
    if (statuses[index] === 'current') addText(label, 'span', '当前阶段', 'vaccine-state vaccine-state-current');
    if (statuses[index] === 'next') addText(label, 'span', '接下来', 'vaccine-state vaccine-state-next');
    if (row.recurrence) addText(label, 'span', '年度项目', 'vaccine-state');
    head.append(label);
    card.append(head);
    const columns = document.createElement('div');
    columns.className = 'vaccine-columns';
    appendList(columns, '免费疫苗', row.free, 'vaccine-free');
    appendList(columns, '自费疫苗', row.selfPaid, 'vaccine-paid', row.alternativeGroups);
    if (!row.free?.length && !row.selfPaid?.length) addText(columns, 'p', '此年龄节点暂无项目。', 'muted');
    card.append(columns);
    route.append(card);
  }
}
function renderFeeding() {
  $('#feeding-baby-status').textContent = babyStatus();
  const table = $('#feeding-reference-table');
  table.replaceChildren();
  const head = document.createElement('div');
  head.className = 'reference-table-row reference-table-head';
  head.setAttribute('role', 'row');
  for (const label of ['月龄', '最近24小时参考奶量', '参考频次', '说明']) addCell(head, label, label, true);
  table.append(head);
  const current = feedingReferenceForMonth(currentMonth());
  for (const row of feedingReferenceRows) {
    const line = document.createElement('div');
    line.className = `reference-table-row ${row === current ? 'reference-row-current' : ''}`;
    line.setAttribute('role', 'row');
    const amount = row.min === null ? '没有统一固定毫升范围' : `${row.min}～${row.max} 毫升`;
    for (const [value, label] of [[row.label, '月龄'], [amount, '最近24小时参考奶量'], [row.frequency, '参考频次'], [row.reason, '说明']]) addCell(line, label, value);
    table.append(line);
  }
}
function renderGrowth() {
  const { growthKind: kind, growthSex: sex } = state;
  const table = $('#growth-reference-table');
  table.replaceChildren();
  const unit = kind === 'weight' ? '千克' : '厘米';
  const data = growthReference({ baby: state.baby, sex, kind, range: state.growthRange, measurements: kind === 'weight' ? state.weights : state.lengths });
  const configuredSex = state.baby?.sex === 'male' ? '男孩' : state.baby?.sex === 'female' ? '女孩' : '性别未设置';
  $('#growth-baby-status').textContent = `${babyStatus()} · ${configuredSex}${data.age >= 84 ? ' · 已满7岁，超出本标准适用年龄' : ''}`;
  const measurement = $('#growth-measurement');
  measurement.hidden = data.actual === null;
  measurement.textContent = data.actual === null ? '' : `最近记录：${data.latest.measured_on} · ${data.measuredAge}月龄 · ${kind === 'weight' ? '体重' : '身长'} ${valueText(data.actual, kind)} ${unit}`;
  const head = document.createElement('div');
  head.className = 'growth-grid-row growth-grid-head';
  head.setAttribute('role', 'row');
  for (const label of ['月龄', ...percentileLabels]) addCell(head, label, label, true);
  table.append(head);
  for (const row of data.rows) {
    const measured = data.actual !== null && row.month === data.measuredMonth;
    const line = document.createElement('div');
    line.className = `growth-grid-row ${row.month === data.activeMonth ? 'growth-row-current' : ''} ${measured ? 'growth-row-measured' : ''}`;
    line.setAttribute('role', 'row');
    const label = `${growthRowLabel(row.month)}${row.month === data.activeMonth ? ' · 当前阶段' : ''}`;
    const ageCell = addCell(line, '月龄', label);
    if (measured) addText(ageCell, 'small', `记录：${valueText(data.actual, kind)} ${unit}（${data.latest.measured_on}）`, 'reference-measured-value');
    row.values.forEach((value, index) => addCell(line, percentileLabels[index], `${valueText(value, kind)} ${unit}`));
    table.append(line);
  }
}
function renderDevelopment() {
  const { months, due, next, nextOn } = developmentWindow(state.baby?.birthday);
  $('#development-baby-status').textContent = months === null ? '配置有效生日后，会在监测月龄提示；全部观察资料仍可查看。' : due ? `宝宝当前${babyAge(state.baby.birthday)} · 本月观察：${due.label}` : next ? `宝宝当前${babyAge(state.baby.birthday)} · 下一次：${next.label}（${nextOn.replaceAll('-', '/')}）` : '已超过本表最后一个监测月龄；有发育疑虑仍可咨询儿童保健门诊。';
  $('#development-newborn-note').hidden = months === null || months >= 3;
  $('#development-newborn-note').textContent = developmentReference.guidance.newborn;
  const recommended = due ?? next ?? (months === null ? developmentStages[0] : developmentStages.at(-1));
  const stage = developmentStages.find(item => item.ageMonths === state.developmentMonth) ?? recommended;
  $('#development-age').value = String(stage.ageMonths);
  $('#development-recommended').hidden = months === null || (!due && !next) || stage === recommended;
  $('#development-stage-title').textContent = `${stage.label}预警征象`;
  $('#development-stage-status').textContent = stage === due ? '本月观察' : stage === next ? '下一节点' : '参考节点';
  const list = $('#development-signs');
  list.replaceChildren();
  for (const sign of stage.signs) addText(list, 'li', sign.text);
}
function renderAssessment() {
  const { months } = developmentWindow(state.baby?.birthday);
  const due = developmentAssessmentStages.find(stage => stage.ageMonths === months);
  const next = developmentAssessmentStages.find(stage => stage.ageMonths > (months ?? 0));
  const completed = developmentAssessmentStages.filter(stage => stage.ageMonths <= (months ?? 0)).at(-1);
  const recommended = due ?? completed ?? next ?? developmentAssessmentStages.at(-1);
  const stage = developmentAssessmentStages.find(item => item.ageMonths === state.assessmentMonth) ?? recommended;
  const saved = state.assessments[stage.ageMonths] ?? Array(5).fill('unsure');
  $('#development-assessment-age').value = String(stage.ageMonths);
  $('#development-assessment-recommended').hidden = months === null || stage === recommended;
  $('#development-assessment-save-status').textContent = '';
  $('#development-assessment-age-note').dataset.context = months === stage.ageMonths ? 'current' : 'other-age';
  $('#development-assessment-age-note').textContent = months === null
    ? '先到配置中心填写生日，即可按月龄记录。'
    : months > 36
      ? '此自评表适用于0～3岁；宝宝已超过表内月龄，请按实际情况咨询儿童保健人员。'
      : stage.ageMonths === months
        ? `宝宝当前${babyAge(state.baby.birthday)}，按日常表现选择。`
        : months < stage.ageMonths
          ? `未到${stage.label}，先看看；到了月龄再记录。`
          : `正在查看${stage.label}历史阶段，请按当时的表现记录。`;
  const domains = $('#development-assessment-domains');
  domains.replaceChildren();
  let itemIndex = 0;
  for (const domain of stage.domains) {
    const section = document.createElement('section');
    section.className = 'development-assessment-domain';
    addText(section, 'h5', domain.name);
    const list = document.createElement('ol');
    for (const item of domain.items) {
      const row = document.createElement('li');
      addText(row, 'p', item);
      // Keep relevant precautions next to the specific activity, rather than a full-page preamble.
      if (/小丸|钮扣|扣子|串珠|小东西/.test(item)) addText(row, 'p', '只回想日常表现，不要拿小物品给宝宝测试。', 'development-item-hint');
      else if (/站|楼梯/.test(item)) addText(row, 'p', '按日常表现记录，不必专门练习或强迫尝试。', 'development-item-hint');
      const choices = document.createElement('div');
      choices.className = 'development-assessment-choices';
      choices.setAttribute('role', 'radiogroup');
      choices.setAttribute('aria-label', `${domain.name}：${item}`);
      for (const [value, label] of [['yes', '已出现'], ['no', '尚未出现'], ['unsure', '不确定']]) {
        const choice = document.createElement('label');
        const input = document.createElement('input');
        input.type = 'radio';
        input.name = `development-${stage.ageMonths}-${itemIndex}`;
        input.value = value;
        input.checked = saved[itemIndex] === value;
        input.disabled = months === null || months < stage.ageMonths || months > 36;
        input.dataset.assessmentIndex = String(itemIndex);
        const text = document.createElement('span');
        text.textContent = label;
        choice.append(input, text);
        choices.append(choice);
      }
      row.append(choices);
      list.append(row);
      itemIndex += 1;
    }
    section.append(list);
    domains.append(section);
  }
  updateAssessmentResult(stage, saved);
}
function renderObservationHistory() {
  const list = $('#development-observation-history');
  list.replaceChildren();
  $('#development-observation-count').textContent = state.observations.length ? `（${state.observations.length}）` : '';
  for (const observation of state.observations) {
    const item = document.createElement('li');
    const heading = document.createElement('div');
    addText(heading, 'strong', observation.observedOn.replaceAll('-', '/'));
    addText(heading, 'span', observationResponseLabels[observation.response]);
    addText(item, 'p', observation.promptText);
    if (observation.note) addText(item, 'p', observation.note);
    item.prepend(heading);
    list.append(item);
  }
  $('#development-observation-history-status').textContent = state.observations.length ? '显示最近30条随记。' : '首页的成长观察随记会按日期显示在这里。';
}
async function loadObservationHistory() {
  try {
    const data = await api('/api/development-observations');
    state.observations = data.observations;
    renderObservationHistory();
  } catch { $('#development-observation-history-status').textContent = '随记暂时未能读取，请稍后刷新。'; }
}
document.addEventListener('development-observation-saved', loadObservationHistory);
function updateAssessmentResult(stage, saved) {
  const { months } = developmentWindow(state.baby?.birthday);
  const outcome = developmentAssessmentOutcome(saved);
  const result = $('#development-assessment-result');
  result.dataset.level = outcome.level;
  result.dataset.context = months !== stage.ageMonths || (outcome.incomplete && outcome.missing === 0) ? 'idle' : 'result';
  result.textContent = outcome.level === 'medical'
    ? `目前记录${outcome.missing}项尚未出现。请带宝宝到医疗机构进行相关检查。`
    : outcome.level === 'consult'
      ? '目前记录1项尚未出现。请加强亲子交流与玩耍，并向医务人员寻求指导和帮助。'
      : outcome.level === 'incomplete' && outcome.missing === 1
        ? '目前记录1项尚未出现，且仍有项目未完成。请继续按日常表现记录，也可先向医务人员咨询。'
        : outcome.level === 'incomplete'
          ? '完成本阶段5项记录后，这里会显示对应的咨询建议。'
          : '本阶段5项发育标志均记录为已出现。继续提供回应性照护和亲子交流；自评不替代儿童保健随访。';
  if (months === null) result.textContent = '请先在配置中心填写有效生日，再按对应月龄记录。';
  else if (months < stage.ageMonths) result.textContent = `尚未到${stage.label}，本阶段条目仅供提前了解，不据此判断当前发育情况。`;
  else if (months > 36) result.textContent = '当前只查看既有记录与原表参考，不按此表评价3岁以上的发育情况。';
  else if (months !== stage.ageMonths) result.textContent = '当前查看的是历史监测月龄，请结合当时记录及儿童保健人员意见理解，不用旧节点评价当前发育情况。';
  if (months !== stage.ageMonths) result.dataset.level = 'incomplete';
}
for (const stage of developmentStages) {
  const option = addText($('#development-age'), 'option', stage.label);
  option.value = String(stage.ageMonths);
}
$('#development-age').addEventListener('change', event => { state.developmentMonth = Number(event.target.value); renderDevelopment(); });
$('#development-recommended').addEventListener('click', () => { state.developmentMonth = null; renderDevelopment(); });
for (const stage of developmentAssessmentStages) {
  const option = addText($('#development-assessment-age'), 'option', stage.label);
  option.value = String(stage.ageMonths);
}
$('#development-assessment-age').addEventListener('change', event => { state.assessmentMonth = Number(event.target.value); renderAssessment(); });
$('#development-assessment-recommended').addEventListener('click', () => { state.assessmentMonth = null; renderAssessment(); });
$('#development-assessment-domains').addEventListener('change', async event => {
  const input = event.target.closest('input[data-assessment-index]');
  if (!input) return;
  const ageMonths = Number($('#development-assessment-age').value);
  const responses = [...(state.assessments[ageMonths] ?? Array(5).fill('unsure'))];
  responses[Number(input.dataset.assessmentIndex)] = input.value;
  state.assessments[ageMonths] = responses;
  updateAssessmentResult(developmentAssessmentStages.find(stage => stage.ageMonths === ageMonths), responses);
  $('#development-assessment-save-status').textContent = `${ageMonths}月龄记录正在保存…`;
  const prior = state.assessmentSaves[ageMonths] ?? Promise.resolve();
  const save = prior.catch(() => {}).then(() => api(`/api/development-assessments/${ageMonths}`, { method: 'PUT', body: JSON.stringify({ birthday: state.baby?.birthday, responses }) }));
  state.assessmentSaves[ageMonths] = save;
  try {
    await save;
    if (state.assessmentSaves[ageMonths] === save && Number($('#development-assessment-age').value) === ageMonths) {
      $('#development-assessment-save-status').textContent = '已自动保存';
      showToast('观察已保存');
    }
  } catch (error) {
    if (state.assessmentSaves[ageMonths] === save && Number($('#development-assessment-age').value) === ageMonths) {
      $('#development-assessment-save-status').textContent = `${ageMonths}月龄记录保存失败：${error.message}。请检查连接后重新选择。`;
      showToast('这次没有保存成功，请检查连接后重新选择');
    }
  }
});
$('#development-positive-guidance').textContent = developmentReference.guidance.positive;
$('#development-regression-guidance').textContent = developmentReference.guidance.regression;
const sourceLink = addText($('#development-source'), 'a', `国家卫健委《${developmentReference.source.title}》附件1`);
sourceLink.href = developmentReference.source.url;
sourceLink.target = '_blank';
sourceLink.rel = 'noopener noreferrer';
const selfAssessmentLink = addText($('#development-assessment-source'), 'a', '查看卫健委指南与自评表原文');
selfAssessmentLink.href = developmentAssessmentSource.attachmentUrl;
selfAssessmentLink.target = '_blank';
selfAssessmentLink.rel = 'noopener noreferrer';
// Reference content remains available even if profile/data requests fail.
renderDevelopment();
renderAssessment();
renderObservationHistory();
loadObservationHistory();
function selectTab(tab, updateHash = true) {
  if (!['vaccines', 'feeding', 'growth', 'development'].includes(tab)) tab = 'vaccines';
  root.querySelectorAll('[data-reference-tab]').forEach(button => {
    const active = button.dataset.referenceTab === tab;
    button.setAttribute('aria-selected', String(active));
    button.tabIndex = active ? 0 : -1;
  });
  root.querySelectorAll('.reference-panel').forEach(panel => { panel.hidden = panel.id !== `${tab}-panel`; });
  if (updateHash && location.hash !== `#references/${tab}`) location.hash = `references/${tab}`;
}
root.querySelector('.reference-tabs').addEventListener('click', event => {
  const button = event.target.closest('[data-reference-tab]');
  if (button) selectTab(button.dataset.referenceTab);
});
root.querySelector('.reference-tabs').addEventListener('keydown', event => {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault();
  const buttons = [...root.querySelectorAll('[data-reference-tab]')];
  const current = buttons.indexOf(document.activeElement);
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (current + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length;
  buttons[next].focus();
  selectTab(buttons[next].dataset.referenceTab);
});
for (const [attribute, key] of [['growth-kind', 'growthKind'], ['growth-sex', 'growthSex']]) {
  root.querySelectorAll(`[data-${attribute}]`).forEach(button => button.addEventListener('click', () => {
    state[key] = button.dataset[key];
    root.querySelectorAll(`[data-${attribute}]`).forEach(item => item.setAttribute('aria-pressed', String(item === button)));
    renderGrowth();
  }));
}
$('#growth-age').addEventListener('change', event => { state.growthRange = event.target.value; renderGrowth(); });
selectTab(location.hash.split('/')[1], false);
async function load() {
  const message = $('#reference-load-status');
  try {
    const [profile, schedule, weights, lengths, assessments] = await Promise.all([api('/api/baby'), api('/api/references/vaccination-schedule'), api('/api/weights'), api('/api/lengths'), api('/api/development-assessments')]);
    state.baby = profile.baby;
    state.schedule = schedule.schedule;
    state.weights = weights.weights;
    state.lengths = lengths.lengths;
    state.assessments = assessments.assessments;
    state.growthSex = ['male', 'female'].includes(state.baby.sex) ? state.baby.sex : 'male';
    root.querySelectorAll('[data-growth-sex]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.growthSex === state.growthSex)));
    renderVaccines();
    renderFeeding();
    renderGrowth();
    renderDevelopment();
    renderAssessment();
    message.hidden = true;
  } catch (error) {
    message.textContent = `${error.message}，请刷新页面重试。`;
    message.hidden = false;
    for (const id of ['vaccine-baby-status', 'feeding-baby-status', 'growth-baby-status']) $(`#${id}`).textContent = '资料暂未加载，请刷新重试。';
  }
}
// Refresh date-based highlights after midnight and when returning to the page.
let renderedDate = new Date().toDateString();
function refreshDate() {
  const today = new Date().toDateString();
  if (today === renderedDate || !state.schedule) return;
  renderedDate = today;
  renderVaccines(); renderFeeding(); renderGrowth(); renderDevelopment();
  renderAssessment();
}
setInterval(refreshDate, 60000);
window.addEventListener('focus', refreshDate);
document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshDate(); });
load();

return { selectTab };
}
