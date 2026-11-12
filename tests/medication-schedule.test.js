import { test } from 'node:test';
import assert from 'node:assert/strict';
import { medicationNextAt } from '../public/medication-schedule.js';
const base={id:1,medicine_id:1,name:'维生素AD',enabled:true,mode:'daily',daily_time:'08:00',timezone_offset:-480,start_at:'2026-11-10T00:00:00.000Z'};
const record=(occurred_at,medicines=[{medicineId:1,name:'维生素AD'}])=>({occurred_at,medicines});
test('每天固定时刻按配置时区计算，提前记录顺延，未来记录不计，跨日重置',()=>{
 const now=new Date('2026-11-11T01:00:00.000Z');
 assert.equal(medicationNextAt(base,[],now),'2026-11-11T00:00:00.000Z');
 assert.equal(medicationNextAt(base,[record('2026-11-10T23:50:00.000Z')],now),'2026-11-12T00:00:00.000Z');
 assert.equal(medicationNextAt(base,[record('2026-11-11T02:00:00.000Z')],now),'2026-11-11T00:00:00.000Z');
 assert.equal(medicationNextAt(base,[record('2026-11-10T15:59:00.000Z')],now),'2026-11-11T00:00:00.000Z');
 assert.equal(medicationNextAt({...base,start_at:'2026-12-01T00:00:00.000Z'},[],now),'2026-12-01T00:00:00.000Z');
 assert.equal(medicationNextAt({...base,enabled:false},[],now),null);
 assert.equal(medicationNextAt({...base,daily_time:'23:30',timezone_offset:300,start_at:'2026-11-10T04:30:00.000Z'},[],new Date('2026-11-11T06:00:00.000Z')),'2026-11-12T04:30:00.000Z');
});
test('间隔计划按匹配药品最近记录计算，稳定标识支持药品改名，旧记录按原名匹配',()=>{
 const now=new Date('2026-11-11T10:00:00.000Z'),plan={...base,mode:'interval',interval_hours:24,name:'改名后的药品'};
 const rows=[record('2026-11-10T02:00:00.000Z'),record('2026-11-11T03:00:00.000Z',[{medicineId:2,name:'其他药'}]),record('2026-11-10T06:00:00.000Z')];
 assert.equal(medicationNextAt(plan,rows,now),'2026-11-11T06:00:00.000Z');
 assert.equal(medicationNextAt(plan,[],now),plan.start_at);
 assert.equal(medicationNextAt({...plan,interval_hours:2.5},[record('2026-11-11T01:00:00.000Z',[{name:plan.name}])],now),'2026-11-11T03:30:00.000Z');
});
