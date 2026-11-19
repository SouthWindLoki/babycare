import { completedMonths } from './nutrition.js';
import { developmentStages } from './development-data.js';

function milestoneDate(birthday, months) {
  const [year, month, day] = birthday.split('-').map(Number);
  const start = new Date(year, month - 1 + months, 1);
  const lastDay = new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate();
  return `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(Math.min(day, lastDay)).padStart(2, '0')}`;
}

// Each monitoring window lasts one completed month. Past windows are not overdue tasks.
export function developmentWindow(birthday, now = new Date()) {
  const months = Number.isFinite(now?.getTime()) ? completedMonths(birthday, now) : null;
  const due = developmentStages.find(stage => stage.ageMonths === months) ?? null;
  const next = months === null ? null : developmentStages.find(stage => stage.ageMonths > months) ?? null;
  return { months, due, next, nextOn: next ? milestoneDate(birthday, next.ageMonths) : null };
}

export function developmentAssessmentOutcome(responses = []) {
  const missing = responses.filter(response => response === 'no').length;
  const incomplete = responses.length !== 5 || responses.some(response => !['yes', 'no'].includes(response));
  if (missing >= 2) return { missing, incomplete, level: 'medical' };
  if (incomplete) return { missing, incomplete, level: 'incomplete' };
  if (missing === 1) return { missing, incomplete: false, level: 'consult' };
  return { missing: 0, incomplete: false, level: 'observed' };
}

const sessionSent = new Set();
// The existing browser permission flow owns consent; callers supply a granted notification API.
export function notifyDevelopment({ birthday, now = new Date(), storage, notify }) {
  const { due } = developmentWindow(birthday, now);
  if (!due || typeof notify !== 'function') return false;
  const key = `babycare:development:${birthday}:${due.ageMonths}`;
  if (sessionSent.has(key)) return false;
  try { if (storage?.getItem(key)) return false; } catch { /* Session dedup still works. */ }
  try {
    notify(`宝宝日常 · ${due.label}发育观察`, {
      body: `宝宝到了${due.label}观察节点，可查看${due.ageMonths <= 36 ? '5项发育标志与' : ''}4项预警征象；如有疑虑，请联系儿童保健门诊。`,
      tag: 'babycare-development'
    });
  } catch { return false; }
  sessionSent.add(key);
  try { storage?.setItem(key, 'sent'); } catch { /* Keep the page reminder available. */ }
  return true;
}
