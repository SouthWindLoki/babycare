import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';

let child,base,dataDir;
const headers={'Content-Type':'application/json','X-Today':'2026-11-16'};
async function request(path,method='GET',body,status=200){
  const res=await fetch(base+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
  const data=await res.json();assert.equal(res.status,status,JSON.stringify(data));return data;
}
before(async()=>{
  dataDir=await mkdtemp(join(tmpdir(),'babycare-edit-'));
  child=spawn(process.execPath,['--experimental-sqlite','server.js'],{cwd:new URL('..',import.meta.url),env:{...process.env,PORT:'0',DATA_DIR:dataDir},stdio:['ignore','pipe','pipe']});
  base=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('启动超时')),10000);child.once('exit',()=>{clearTimeout(timer);reject(new Error('启动失败'));});child.stdout.on('data',chunk=>{const match=chunk.toString().match(/http:\/\/localhost:(\d+)/);if(match){clearTimeout(timer);resolve(`http://127.0.0.1:${match[1]}`);}});});
});
after(async()=>{if(child&&child.exitCode===null){const done=once(child,'exit');child.kill('SIGTERM');await done;}if(dataDir)await rm(dataDir,{recursive:true,force:true});});
const at='2026-11-16T00:00:42.123Z',changed='2026-11-15T23:00:12.000Z';
const photo='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jH0YAAAAASUVORK5CYII=';

test('喂奶编辑保持同一ID、精确时间和时长，统计随修改重算，非法修改不污染原记录',async()=>{
  const now=Date.now(),fedAt=new Date(now-3600000).toISOString();
  const {record}=await request('/api/records','POST',{fedAt,feedingMethod:'formula',amountMl:73,note:'原备注'},201);
  const path=`/api/records/${record.id}`;
  assert.equal((await request(path)).record.amount_ml,73);
  const result=await request(path,'PUT',{fedAt,feedingMethod:'direct',amountMl:null,leftDurationSeconds:601,rightDurationSeconds:0,note:'改为亲喂'});
  assert.equal(result.record.id,record.id);assert.equal(result.record.created_at,record.created_at);
  assert.equal(result.summary.last24HoursAmount,0);assert.equal(result.summary.last24HoursDirectCount,1);
  assert.equal(result.summary.latestDirect.left_duration_seconds,601);
  assert.equal((await request('/api/records')).records.length,1);
  await request(path,'PUT',{fedAt,feedingMethod:'direct',leftDurationSeconds:-1},400);
  assert.equal((await request(path)).record.left_duration_seconds,601);
  await request(path,'PUT',{fedAt:new Date(now-25*3600000).toISOString(),feedingMethod:'formula',amountMl:80});
  assert.equal((await request('/api/records')).summary.last24HoursCount,0);
  await request(path,'DELETE');await request(path,'GET',undefined,404);
  await request(path,'PUT',{fedAt,feedingMethod:'formula',amountMl:70},404);
});

test('体重和身长可修改日期与值，冲突不覆盖其他记录，前次变化按新日期计算',async()=>{
  for(const [route,field,value,stored] of [['weights','weightGrams',3500,'weight_grams'],['lengths','lengthCm',52.5,'length_mm']]){
    for(const [day,n] of [['2026-11-13',value],['2026-11-15',value+1]])await request(`/api/${route}`,'PUT',{measuredOn:day,[field]:n});
    const rows=(await request(`/api/${route}`))[route],id=rows.find(row=>row.measured_on==='2026-11-13').id,path=`/api/${route}/${id}`;
    await request(path,'PUT',{measuredOn:'2026-11-15',[field]:value+2},409);
    assert.equal((await request(path)).record.measured_on,'2026-11-13');
    await request(path,'PUT',{measuredOn:'2026-11-16',[field]:value+2});
    const result=(await request(path)).record;
    assert.equal(result.id,id);assert.equal(result.measured_on,'2026-11-16');assert.equal(result[stored],(value+2)*(route==='lengths'?10:1));
    assert.equal((await request(`/api/${route}`))[route].length,2);
    await request(path,'PUT',{measuredOn:'2026-11-17',[field]:value},400);
    const logs=await request('/api/logs?'+new URLSearchParams({start:'2026-11-13T00:00:00.000Z',end:'2026-11-17T00:00:00.000Z',fromDay:'2026-11-13',toDay:'2026-11-16'}));
    assert.equal(logs[route][0].previous_measured_on,'2026-11-15');
  }
});

test('照片类记录修改时保留原图、可替换与移除，读取原记录不暴露二进制',async()=>{
  for(const route of ['stools','medications','abnormalities']){
    const details=route==='stools'?{color:'黄色'}:route==='medications'?{medicines:[{name:'维生素D3',dose:'1',unit:'粒'}]}:{observations:[{category:'other',symptoms:[],description:'原描述'}]};
    const {id}=await request(`/api/${route}`,'POST',{occurredAt:at,...details,note:'原备注',photo},201),path=`/api/${route}/${id}`;
    const original=(await request(path)).record;
    assert.equal(original.has_photo,true);assert.equal(original.photo,undefined);assert.equal(original.photo_type,undefined);
    const before=Buffer.from(await(await fetch(base+path+'/photo')).arrayBuffer());
    await request(path,'PUT',{occurredAt:changed,...details,note:'修改备注'});
    const record=(await request(path)).record;assert.equal(record.id,id);assert.equal(record.note,'修改备注');assert.equal(record.occurred_at,changed);assert.equal(record.has_photo,true);
    assert.deepEqual(Buffer.from(await(await fetch(base+path+'/photo')).arrayBuffer()),before);
    await request(path,'PUT',{occurredAt:changed,...details,photo:'无效图片'},400);
    assert.equal((await request(path)).record.has_photo,true);
    await request(path,'PUT',{occurredAt:changed,...details,photo:null});
    assert.equal((await request(path)).record.has_photo,false);
    assert.equal((await fetch(base+path+'/photo')).status,404);
    await request(path,'PUT',{occurredAt:changed,...details,photo});assert.equal((await request(path)).record.has_photo,true);
    assert.equal((await request(`/api/${route}`))[route].length,1);
  }
});

test('湿尿布编辑只改时间与备注，类别保留；八类异常均支持回填后修改',async()=>{
  const {id}=await request('/api/diapers','POST',{occurredAt:at,note:'原备注'},201);
  const path=`/api/diapers/${id}`,original=(await request(path)).record;
  await request(path,'PUT',{occurredAt:changed,note:'更正'});
  const row=(await request(path)).record;assert.equal(row.diaper_type,original.diaper_type);assert.equal(row.occurred_at,changed);assert.equal(row.note,'更正');
  const observations=[{category:'vomiting',symptoms:['喝奶后吐'],occurrenceCount:2,minutesSinceFeeding:20,vomitingAppearance:'奶样'},
    {category:'temperature',symptoms:[],temperatureC:37.8,measurementSite:'腋下'},
    {category:'jaundice',symptoms:[],bilirubinValue:10,bilirubinUnit:'mg',phototherapy:false,discoveredAt:'2026-11-16T08:00'},
    {category:'skin',symptoms:['起疹子'],bodyPart:'脸部'},{category:'eyes',symptoms:['眼睛发红'],eyeSide:'左眼'},
    {category:'activity',symptoms:['活动明显减少'],durationMinutes:10},{category:'breathing',symptoms:['新出现咳嗽'],breathingState:'清醒'},
    {category:'other',symptoms:[],description:'描述'}];
  for(const item of observations){
    const created=await request('/api/abnormalities','POST',{occurredAt:at,observations:[item]},201),p=`/api/abnormalities/${created.id}`;
    await request(p,'PUT',{occurredAt:changed,observations:[item],note:'已核对'});
    const saved=(await request(p)).record;assert.equal(saved.note,'已核对');assert.equal(saved.observations[0].category,item.category);
  }
});

test('修改用药记录后，下一次间隔计划按改正的时间重新计算',async()=>{
  const medicine=(await request('/api/common-medicines','POST',{name:'测试计划用药',unit:'粒'},201)).medicines.find(m=>m.name==='测试计划用药'),now=Date.now();
  const startAt=new Date(now-4*3600000).toISOString();
  const result=await request('/api/medication-plans','POST',{medicineId:medicine.id,dose:'1',mode:'interval',intervalHours:24,startAt,enabled:true,timezoneOffset:-480},201);
  const planId=result.plans[0].id,medicines=[{name:medicine.name,medicineId:medicine.id,dose:'1',unit:medicine.unit}];
  const {id}=await request('/api/medications','POST',{occurredAt:new Date(now-2*3600000).toISOString(),medicines},201);
  const before=(await request('/api/medication-plans')).plans.find(p=>p.id===planId).nextAt;
  await request(`/api/medications/${id}`,'PUT',{occurredAt:new Date(now-3600000).toISOString(),medicines});
  const after=(await request('/api/medication-plans')).plans.find(p=>p.id===planId).nextAt;
  assert.equal(Date.parse(after)-Date.parse(before),3600000);
});
