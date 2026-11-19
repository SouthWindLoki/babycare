import { test } from 'node:test';
import assert from 'node:assert/strict';
import { medicationNextAt, medicationPlansForWindow } from '../public/medication-schedule.js';
const base={id:1,medicine_id:1,name:'维生素AD',enabled:true,mode:'daily',daily_time:'08:00',timezone_offset:-480,start_at:'2026-11-10T00:00:00.000Z'};
const record=(occurred_at,medicines=[{medicineId:1,name:'维生素AD'}])=>({occurred_at,medicines});
test('首页显示今天及未来24小时的并集，保留今天已到时间但未记录的计划',()=>{
 const now=new Date(2026,10,13,12);
 const at=(day,hour=0,minute=0)=>new Date(2026,10,day,hour,minute).toISOString();
 const plans=[
  {...base,id:1,nextAt:at(14)},
  {...base,id:2,nextAt:at(13,23,59)},
  {...base,id:3,nextAt:at(13)},
  {...base,id:4,nextAt:at(12,23,59)},
  {...base,id:5,nextAt:at(13,8),enabled:false},
  {...base,id:6,nextAt:null},
  {...base,id:7,nextAt:'无效时间'},
  {...base,id:8,nextAt:at(13,8)}
 ];
 assert.deepEqual(medicationPlansForWindow(plans,now).map(plan=>plan.id),[3,8,2,1]);
 assert.deepEqual(medicationPlansForWindow(plans,new Date(2026,10,14)).map(plan=>plan.id),[1]);
 assert.deepEqual(plans.map(plan=>plan.id),[1,2,3,4,5,6,7,8]);
});
test('今天零点与未来24小时分界包含、不重复，昨天和窗口外排除，午夜自动切换',()=>{
 const now = new Date(2026,11,31,23,30);
 const end = now.getTime()+86400000;
 const plans = [
  {...base,id:1,nextAt:new Date(2026,11,31).toISOString()},
  {...base,id:2,nextAt:new Date(2026,11,30,23,59,59,999).toISOString()},
  {...base,id:3,nextAt:now.toISOString()},
  {...base,id:4,nextAt:new Date(end).toISOString()},
  {...base,id:5,nextAt:new Date(end+1).toISOString()},
  {...base,id:6,nextAt:new Date(2027,0,1,8).toISOString()}
 ];
 assert.deepEqual(medicationPlansForWindow(plans,now).map(p=>p.id),[1,3,6,4]);
 assert.deepEqual(medicationPlansForWindow(plans,new Date(2027,0,1)).map(p=>p.id),[6,4,5]);
});
test('记录顺延到明天仍在未来窗口内，今天的待记计划到午夜后才移除',()=>{
 const now=new Date('2026-11-11T01:00:00.000Z');
 const plan={...base,nextAt:medicationNextAt(base,[record('2026-11-11T00:10:00.000Z')],now)};
 assert.equal(plan.nextAt,'2026-11-12T00:00:00.000Z');
 const before=new Date('2026-11-11T12:00:00.000Z');
 assert.deepEqual(medicationPlansForWindow([plan],before),[plan]);
 const after=new Date('2026-11-12T00:00:01.000Z');
 assert.equal(medicationPlansForWindow([plan],after).length,1);
 assert.equal(medicationPlansForWindow([plan],new Date(2026,10,13)).length,0);
});
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
test('创建计划前的实际用药也顺延间隔，未来首次时间仍作为最早参考时间',()=>{
 const plan={...base,mode:'interval',interval_hours:48,start_at:'2026-11-12T13:20:00.000Z'};
 const now=new Date('2026-11-13T01:00:00.000Z');
 assert.equal(medicationNextAt(plan,[record('2026-11-12T01:00:00.000Z')],now),'2026-11-14T01:00:00.000Z');
 assert.equal(medicationNextAt({...plan,start_at:'2026-11-15T01:00:00.000Z'},[record('2026-11-12T01:00:00.000Z')],now),'2026-11-15T01:00:00.000Z');
 assert.equal(medicationNextAt(plan,[record('2026-11-13T00:00:00.000Z'),record('2026-11-14T00:00:00.000Z')],now),'2026-11-15T00:00:00.000Z');
 assert.equal(medicationNextAt(plan,[record('2026-11-12T01:00:00.000Z',[{medicineId:2,name:'其他药'}])],now),plan.start_at);
});
