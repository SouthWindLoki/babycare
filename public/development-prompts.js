import { completedMonths } from './nutrition.js';
import { developmentAssessmentStages } from './development-assessment-data.js';

export const observationResponseLabels = { observed: '观察到了', not_yet: '这次没留意到', unsure: '不确定' };
const earlyPrompts = [
  { id: 'early-face', text: '宝宝清醒时，你留意过TA看向你的眼神或表情吗？' },
  { id: 'early-voice', text: '轻声和宝宝说话时，你留意到TA的表情或小动作了吗？' },
  { id: 'early-comfort', text: '抱着或轻抚宝宝时，你留意到TA的表情或声音变化了吗？' }
].map(prompt => ({ ...prompt, context: '日常互动随记', ageMonths: null }));

export function observationPrompts(birthday, day) {
  const months = completedMonths(birthday, new Date(`${day}T12:00:00`));
  if (months === null || months > 36) return [];
  if (months < 3) return earlyPrompts;
  const stage = developmentAssessmentStages.filter(item => item.ageMonths <= months).at(-1);
  return stage.domains.flatMap((domain, index) => domain.items.map(text => ({
    id: `milestone-${stage.ageMonths}-${index}`,
    text: `最近有没有留意到：${text}？`,
    context: `${stage.label}参考 · ${domain.name}`,
    ageMonths: stage.ageMonths
  })));
}

function dayNumber(day) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day ?? '');
  if (!match) return NaN;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return date.toISOString().slice(0, 10) === day ? Math.floor(date.getTime() / 86400000) : NaN;
}

export function homeObservation(birthday, day, observations = []) {
  const prompts = observationPrompts(birthday, day);
  if (!prompts.length) return null;
  const latest = observations.filter(item => Number.isFinite(dayNumber(item.observedOn)) && item.observedOn <= day)
    .sort((a, b) => b.observedOn.localeCompare(a.observedOn))[0];
  const previousIndex = prompts.findIndex(prompt => prompt.id === latest?.promptId);
  const prompt = prompts[(previousIndex + 1) % prompts.length];
  const nextOn = latest ? new Date((dayNumber(latest.observedOn) + 3) * 86400000).toISOString().slice(0, 10) : day;
  return { prompt, latest: latest ?? null, nextOn, ready: day >= nextOn };
}
