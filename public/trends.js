export function trendDay(value) {
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}
function trendMonth(value) { return trendDay(value).slice(0,7); }
// 月视图的范围必须对应当月采用的那次测量，而不是月初或今天的月龄。
export function growthTrendDate(logs, kind, mode, key, now = new Date()) {
  if(mode==='day')return key;
  const rows=(kind==='length'?logs.lengths:logs.weights)||[];
  const measuredOn=rows.filter(row=>row.measured_on.startsWith(`${key}-`)).map(row=>row.measured_on).sort().at(-1);
  if(measuredOn)return measuredOn;
  const [year,month]=key.split('-').map(Number);
  const monthEnd=trendDay(new Date(year,month,0)),today=trendDay(now);
  return monthEnd<today?monthEnd:today;
}
export function trendKeys(mode, now = new Date()) {
  const keys=[];
  if (mode === 'day') {
    for (let offset=29; offset>=0; offset--) keys.push(trendDay(new Date(now.getFullYear(),now.getMonth(),now.getDate()-offset)));
  } else {
    for (let offset=11; offset>=0; offset--) keys.push(trendMonth(new Date(now.getFullYear(),now.getMonth()-offset,1)));
  }
  return keys;
}
export function trendQuery(mode, now = new Date()) {
  const from = mode === 'day' ? new Date(now.getFullYear(),now.getMonth(),now.getDate()-29) : new Date(now.getFullYear(),now.getMonth()-11,1);
  const to = new Date(now.getFullYear(),now.getMonth(),now.getDate()+1);
  return new URLSearchParams({start:from.toISOString(),end:to.toISOString(),fromDay:trendDay(from),toDay:trendDay(now)});
}
export function trendValue(logs, kind, mode, key) {
  if (kind === 'feeding') return logs.records.filter(row => (mode==='day'?trendDay(row.fed_at):trendMonth(row.fed_at))===key).length;
  if (kind === 'diaper') return logs.diapers.filter(row => (mode==='day'?trendDay(row.occurred_at):trendMonth(row.occurred_at))===key).length;
  if (kind === 'stool') return logs.stools.filter(row => (mode==='day'?trendDay(row.occurred_at):trendMonth(row.occurred_at))===key).length;
  const rows=(kind==='length' ? logs.lengths : logs.weights).filter(row => (mode==='day'?row.measured_on:row.measured_on.slice(0,7))===key).sort((a,b)=>a.measured_on.localeCompare(b.measured_on));
  return rows.length ? kind==='length' ? Number(rows.at(-1).length_mm)/10 : Number(rows.at(-1).weight_grams)/500 : null;
}
