export const $ = selector => document.querySelector(selector);
let toastTimer;
export function localInputValue(date = new Date()) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
export function formatDate(value, options = {}) {
  return new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric', ...options }).format(new Date(value));
}
export function formatTime(value) { return new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(value)); }
export function showToast(message) {
  clearTimeout(toastTimer);
  const toast = $('#toast'); toast.textContent = message; toast.classList.add('show');
  toastTimer = setTimeout(() => toast.classList.remove('show'), 3500);
}
export async function api(path, options = {}) {
  const now = new Date();
  const headers = {
    'Content-Type': 'application/json',
    'X-Today': localInputValue(now).slice(0, 10),
    'X-Day-Start': new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString(),
    'X-Day-End': new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString()
  };
  try {
    const response = await fetch(path, { ...options, headers, signal: AbortSignal.timeout(10000) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || '操作失败，请稍后重试');
    return data;
  } catch (error) {
    if (error.name === 'TypeError' || error.name === 'TimeoutError') throw new Error('连接失败，请检查网络后重试');
    throw error;
  }
}

export function babyAge(birthday, date = new Date()) {
  if (!birthday) return '';
  const [year, month, day] = birthday.split('-').map(Number);
  const current = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  const birth = Date.UTC(year, month - 1, day);
  let months = (date.getFullYear() - year) * 12 + date.getMonth() - (month - 1);
  function anniversary(count) {
    const last = new Date(Date.UTC(year, month + count, 0)).getUTCDate();
    return Date.UTC(year, month - 1 + count, Math.min(day, last));
  }
  if (anniversary(months) > current) months--;
  const days = Math.floor((current - anniversary(months)) / 86400000);
  if (current < birth) return '生日尚未到来';
  return months > 0 ? `${months} 个月 ${days} 天` : `${days} 天`;
}
