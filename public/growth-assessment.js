import { assessmentTables } from './growth-assessment-data.js';

// 页面统一采用附录A百分位表；胖瘦仅作参考，不输出第4.3节的临床分级。
export function growthLevel(value, thresholds, method = 'percentile') {
  if (!Number.isFinite(value) || value <= 0 || !validThresholds(thresholds) || !['sd', 'percentile'].includes(method)) return null;
  const limits = method === 'sd' ? [thresholds[1], thresholds[2], thresholds[4], thresholds[5]] : [thresholds[0], thresholds[2], thresholds[4], thresholds[6]];
  return ['下', '中下', '中', '中上', '上'][limits.filter(limit => value >= limit).length];
}

function validThresholds(values) {
  return Array.isArray(values) && values.length === 7 && values.every((value, index) => Number.isFinite(value) && (index === 0 || value > values[index - 1]));
}

export const growthPercentilePoints = [3,10,25,50,75,90,97];

// 只在相邻官方分位节点间估算位置；不改变分级阈值，不插值月龄，不外推两端。
export function percentilePosition(value,thresholds) {
  if(!Number.isFinite(value)||value<=0||!validThresholds(thresholds))return null;
  if(value<thresholds[0])return {kind:'below',percentile:3,marker:2};
  if(value>thresholds[6])return {kind:'above',percentile:97,marker:98};
  const exact=thresholds.indexOf(value);
  if(exact!==-1)return {kind:'table',percentile:growthPercentilePoints[exact],marker:10+exact*80/6};
  const upper=thresholds.findIndex(limit=>limit>value),lower=upper-1;
  const fraction=(value-thresholds[lower])/(thresholds[upper]-thresholds[lower]);
  return {kind:'estimate',percentile:Math.round(growthPercentilePoints[lower]+fraction*(growthPercentilePoints[upper]-growthPercentilePoints[lower])),
    lower:growthPercentilePoints[lower],upper:growthPercentilePoints[upper],marker:10+(lower+fraction)*80/6};
}

export function nutritionFinding(value, thresholds, indicator, method = 'percentile') {
  if (!Number.isFinite(value) || value <= 0 || !validThresholds(thresholds)) return null;
  if(method==='percentile') {
    if(indicator==='weight')return value<thresholds[0]?'体重偏低':null;
    if(indicator==='length')return value<thresholds[0]?'身长偏低':null;
    if(indicator==='bmi'||indicator==='weightForLength')return value<thresholds[0]?'偏瘦':value>=thresholds[6]?'偏胖':null;
    return null;
  }
  if(method!=='sd')return null;
  if (indicator === 'weight' || indicator === 'length') {
    const label = indicator === 'weight' ? '低体重' : '生长迟缓';
    return value < thresholds[0] ? `重度${label}` : value < thresholds[1] ? label : null;
  }
  if (indicator !== 'bmi' && indicator !== 'weightForLength') return null;
  if (value < thresholds[0]) return '重度消瘦';
  if (value < thresholds[1]) return '消瘦';
  if (value >= thresholds[6]) return '重度肥胖';
  if (value >= thresholds[5]) return '肥胖';
  if (value >= thresholds[4]) return '超重';
  return null;
}

function calendarDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.toISOString().slice(0, 10) === value ? { year, month, day } : null;
}

// 月末出生按目标月最后一天满月；只用日历日期，不受浏览器时区影响。
export function measurementAgeMonths(birthday, measuredOn) {
  const birth = calendarDate(birthday), at = calendarDate(measuredOn);
  if (!birth || !at || measuredOn < birthday) return null;
  let months = (at.year - birth.year) * 12 + at.month - birth.month;
  const anniversaryDay = Math.min(birth.day, new Date(Date.UTC(at.year, at.month, 0)).getUTCDate());
  if (at.day < anniversaryDay) months--;
  return months;
}

export function assessmentThresholds(sex, month, indicator, method = 'percentile') {
  if (!['male', 'female'].includes(sex) || !Number.isInteger(month) || month < 0 || month >= 84 || !['sd', 'percentile'].includes(method)) return null;
  const number = { weight: 1, length: 3, bmi: 9 }[indicator];
  if (!number) return null;
  return assessmentTables[`${method === 'sd' ? 'B' : 'A'}.${number + (sex === 'female' ? 1 : 0)}`]?.[month] || null;
}

// 与首页共用已满月龄与官方表值。没有对应标准时不插值、不外推。
export function chartReferenceForDate(sex, birthday, measuredOn, indicator) {
  const month=measurementAgeMonths(birthday,measuredOn);
  if(month===null || !['weight','length'].includes(indicator))return null;
  const values=assessmentThresholds(sex,month,indicator);
  return values?{low:values[0],median:values[3],high:values[6],month}:null;
}

export function assessMeasurement(baby, row, indicator, method = 'percentile') {
  if (!row) return { available: false, reason: indicator === 'weight' ? '记下体重后显示生长水平' : '记下身长后显示生长水平' };
  if (!baby?.birthday) return { available: false, reason: '填写宝宝生日后评价' };
  if (!['male', 'female'].includes(baby.sex)) return { available: false, reason: '填写宝宝性别后评价' };
  const month = measurementAgeMonths(baby.birthday, row.measured_on);
  if (month === null) return { available: false, reason: '请核对生日与测量日期' };
  if (month >= 84) return { available: false, reason: '本标准仅适用于7岁以下儿童' };
  const thresholds = assessmentThresholds(baby.sex, month, indicator, method);
  if (!thresholds) return { available: false, reason: `官方表未列出${month}月龄评价数值`, month };
  const actual = indicator === 'weight' ? row.weight_grams / 1000 : row.length_mm / 10;
  const level = growthLevel(actual, thresholds, method);
  if (!level) return { available: false, reason: '请核对测量数值' };
  // 图示和文字共用同一方法、同一测量月龄的范围。
  const low = thresholds[method === 'sd' ? 1 : 0], high = thresholds[method === 'sd' ? 5 : 6];
  return { available: true, level, actual, month, low, high, measuredOn: row.measured_on, method,
    percentile: method==='percentile'?percentilePosition(actual,thresholds):null,
    finding: nutritionFinding(actual, thresholds, indicator, method) };
}

export function assessGrowth(baby, weights = [], lengths = []) {
  const sortedWeights = [...weights].sort((a, b) => b.measured_on.localeCompare(a.measured_on));
  const sortedLengths = [...lengths].sort((a, b) => b.measured_on.localeCompare(a.measured_on));
  const weight = assessMeasurement(baby, sortedWeights[0], 'weight');
  const length = assessMeasurement(baby, sortedLengths[0], 'length');
  const measuredOn = [sortedWeights[0]?.measured_on, sortedLengths[0]?.measured_on].filter(Boolean).sort().at(-1);
  // 身长测量频率通常低于体重：各取最近一次，不强制同日。
  const weightRow = sortedWeights[0];
  const lengthRow = sortedLengths[0];
  const assessments = [weight, length];
  const findings = assessments.filter(result => result.available && result.finding).map(result => result.finding);
  const month = measurementAgeMonths(baby?.birthday, measuredOn);
  const thresholds = assessmentThresholds(baby?.sex, month, 'bmi');
  const complete = assessments.every(result => result.available) && Boolean(thresholds);
  const gapDays = calendarDate(weightRow?.measured_on) && calendarDate(lengthRow?.measured_on)
    ? Math.abs(Date.parse(`${weightRow.measured_on}T00:00:00Z`) - Date.parse(`${lengthRow.measured_on}T00:00:00Z`)) / 86400000
    : null;
  let bmi = null;
  if (complete) {
    // 先与原始整数测量单位交叉相乘比较，不四舍五入 BMI；避免边界浮点误差。
    const scaledThresholds = thresholds.map(value => Math.round(value * 10) * lengthRow.length_mm ** 2);
    const finding = nutritionFinding(weightRow.weight_grams * 10000, scaledThresholds, 'bmi');
    if (finding) findings.push(finding);
    bmi = weightRow.weight_grams * 1000 / lengthRow.length_mm ** 2;
  }
  let hint;
  if (complete) {
    if (gapDays > 7) {
      const remeasure = weightRow.measured_on < lengthRow.measured_on ? '建议再称一次体重。' : '建议重新量一下身长。';
      hint = `体重和身长相隔 ${gapDays} 天测量，结果可能不够准确。${remeasure}`;
    if (findings.length) hint += ' 请儿保医生进一步评估。';
    } else hint = findings.length ? '建议再测一次，并请儿保医生进一步看看。' : '结果仅供参考，继续留意宝宝的生长变化。';
  }
  else if (!measuredOn) hint = '记下体重和身长，就能查看结果。';
  else if (assessments.some(result => !result.available && result.reason.includes('填写'))) hint = assessments.find(result => !result.available && result.reason.includes('填写')).reason;
  else if (assessments.some(result => !result.available && (result.reason.includes('官方表') || result.reason.includes('7岁') || result.reason.includes('核对')))) hint = assessments.find(result => !result.available && (result.reason.includes('官方表') || result.reason.includes('7岁') || result.reason.includes('核对'))).reason;
  else hint = `再记一次${weightRow ? '身长' : '体重'}，就能查看胖瘦情况。`;
  if (!complete && findings.length) hint += ' 已有异常提示，请复测并咨询儿保医生。';
  if (complete && month >= 24) hint += ' 2岁起请站着量身高。';
  return { weight, length, nutrition: { complete, findings, bmi, measuredOn, gapDays,
    weightMeasuredOn: weightRow?.measured_on, lengthMeasuredOn: lengthRow?.measured_on,
    method: 'percentile', label: findings.length ? findings.join('、') : complete ? '胖瘦适中' : '暂不能完整评价', hint } };
}
