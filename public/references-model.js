import { completedMonths } from './nutrition.js';
import { assessmentThresholds, measurementAgeMonths } from './growth-assessment.js';
import { growthStandard } from './growth-standard-data.js';

// Half-month nodes use the midpoint between clamped calendar-month anniversaries.
// Date-only UTC differences avoid changing the stage with daylight-saving time.
export function ageInMonths(birthday, now = new Date()) {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) return null;
  const month = completedMonths(birthday, now);
  if (month === null) return null;
  const [year, birthMonth, day] = birthday.split('-').map(Number);
  function anniversary(count) {
    const lastDay = new Date(Date.UTC(year, birthMonth + count, 0)).getUTCDate();
    return Date.UTC(year, birthMonth - 1 + count, Math.min(day, lastDay));
  }
  const start = anniversary(month), end = anniversary(month + 1);
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return month + (today - start) / (end - start);
}

export function vaccineStageStates(rows, birthday, now = new Date()) {
  const age = ageInMonths(birthday, now);
  if (age === null) return rows.map(() => '');
  const timed = rows.map((row, index) => ({ index, age: row.ageMonths }))
    .filter(item => Number.isFinite(item.age) && !rows[item.index].recurrence)
    .sort((a, b) => a.age - b.age);
  const current = timed.filter(item => item.age <= age).at(-1)?.index;
  const next = timed.find(item => item.age > age)?.index;
  return rows.map((row, index) => index === current ? 'current' : index === next ? 'next'
    : !row.recurrence && Number.isFinite(row.ageMonths) && row.ageMonths < age ? 'past' : '');
}

export function growthReference({ baby, sex, kind, measurements = [], range = 'all', now = new Date() }) {
  const rows = growthStandard.male.map(({ month }) => ({ month, values: assessmentThresholds(sex, month, kind) }))
    .filter(row => row.values);
  const age = completedMonths(baby?.birthday, now);
  const matchesBaby = ['male', 'female'].includes(baby?.sex) && baby.sex === sex;
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const latest = matchesBaby && baby?.birthday ? [...measurements]
    .filter(row => row.measured_on <= today && measurementAgeMonths(baby.birthday, row.measured_on) !== null)
    .sort((a, b) => b.measured_on.localeCompare(a.measured_on))[0] : null;
  const measuredAge = latest ? measurementAgeMonths(baby.birthday, latest.measured_on) : null;
  const rowForAge = month => month !== null && month >= 0 && month < 84 ? rows.filter(row => row.month <= month).at(-1)?.month : null;
  const activeMonth = matchesBaby ? rowForAge(age) : null;
  const measuredMonth = rowForAge(measuredAge);
  const rawValue = kind === 'weight' ? latest?.weight_grams : latest?.length_mm;
  const actual = measuredMonth !== null && Number.isFinite(rawValue) && rawValue > 0
    ? rawValue / (kind === 'weight' ? 1000 : 10) : null;
  const limits = /^(0:12|12:24|24:48|48:84)$/.test(range) ? range.split(':').map(Number) : [0, 84];
  return { rows: rows.filter(row => row.month >= limits[0] && row.month < limits[1]), age, activeMonth, measuredMonth, measuredAge, latest, actual };
}
