// Calculate references only; recording a dose never implies a dose recommendation.
export function medicationNextAt(plan, records, now=new Date()) {
  if(!plan.enabled)return null;
  const current=now.getTime(),start=Date.parse(plan.start_at);
  const times=records.filter(row=>Date.parse(row.occurred_at)<=current&&row.medicines.some(item=>item.medicineId?item.medicineId===plan.medicine_id:item.name===plan.name)).map(row=>Date.parse(row.occurred_at)).sort((a,b)=>b-a);
  if(plan.mode==='interval') {
    const latest=times.find(time=>time>=start);
    return new Date(latest===undefined?start:latest+plan.interval_hours*3600000).toISOString();
  }
  const offset=plan.timezone_offset*60000;
  const localNow=new Date(current-offset);
  const dayStart=Date.UTC(localNow.getUTCFullYear(),localNow.getUTCMonth(),localNow.getUTCDate())+offset;
  const [hours,minutes]=plan.daily_time.split(':').map(Number);
  let target=dayStart+(hours*60+minutes)*60000;
  if(target<start)target=start;
  // A record earlier than the reference time on the same day also counts.
  const targetLocal=new Date(target-offset);
  const targetDayStart=Date.UTC(targetLocal.getUTCFullYear(),targetLocal.getUTCMonth(),targetLocal.getUTCDate())+offset;
  if(times.some(time=>time>=targetDayStart&&time<targetDayStart+86400000))target+=86400000;
  return new Date(target).toISOString();
}
