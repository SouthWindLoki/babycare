export function trendDay(value) {
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}
function trendMonth(value) { return trendDay(value).slice(0,7); }
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
