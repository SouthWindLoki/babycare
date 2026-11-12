import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { babyAge } from '../public/shared.js';

let child, base, dataDir;
const headers = { 'Content-Type':'application/json', 'X-Today':'2026-11-11', 'X-Day-Start':'2026-11-10T16:00:00.000Z', 'X-Day-End':'2026-11-11T16:00:00.000Z' };
async function start() {
  child = spawn(process.execPath, ['--experimental-sqlite', 'server.js'], { cwd: new URL('..', import.meta.url), env: { ...process.env, PORT:'0', DATA_DIR:dataDir }, stdio:['ignore','pipe','pipe'] });
  let stderr=''; child.stderr.on('data', c => {stderr+=c;});
  base = await new Promise((resolve, reject) => {
    const timer=setTimeout(()=>reject(new Error(`服务启动超时 ${stderr}`)),10000);
    child.once('exit', code => {clearTimeout(timer);reject(new Error(`服务退出 ${code}: ${stderr}`));});
    child.stdout.on('data', chunk => {const match=chunk.toString().match(/http:\/\/localhost:(\d+)/);if(match){clearTimeout(timer);resolve(`http://127.0.0.1:${match[1]}`);}});
  });
}
async function stop() { if(child && child.exitCode===null) {const exited=once(child,'exit');child.kill('SIGTERM');await exited;} }
async function request(path, method='GET', body) {
  const response=await fetch(base+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
  return {status:response.status, data:await response.json()};
}
before(async()=>{dataDir=await mkdtemp(join(tmpdir(),'babycare-test-'));await start();});
after(async()=>{await stop();await rm(dataDir,{recursive:true,force:true});});

test('档案校验、保存和月龄计算',async()=>{
  assert.equal((await request('/api/baby','PUT',{name:'小满',birthday:'2026-02-30'})).status,400);
  assert.equal((await request('/api/baby','PUT',{name:'小满',birthday:'2099-01-01'})).status,400);
  const saved=await request('/api/baby','PUT',{name:' 小满 ',birthday:'2026-10-30'});
  assert.equal(saved.data.baby.name,'小满');assert.equal(saved.data.baby.birthday,'2026-10-30');
  assert.equal(babyAge('2026-01-31',new Date(2026,1,28)),'1 个月 0 天');
  assert.equal(babyAge('2024-02-29',new Date(2025,1,28)),'12 个月 0 天');
});
test('出生体重和身长可选填、保存、校验、保留并清空',async()=>{
 const profile={name:'小满',birthday:'2026-10-30'};
 assert.equal((await request('/api/baby')).data.baby.birth_weight_grams,null);
 const result=await request('/api/baby','PUT',{...profile,birthWeightGrams:3200,birthLengthCm:50.2});
 assert.equal(result.status,200);assert.equal(result.data.baby.birth_weight_grams,3200);assert.equal(result.data.baby.birth_length_mm,502);
 assert.equal((await request('/api/baby','PUT',profile)).data.baby.birth_weight_grams,3200);
 for(const values of [{birthWeightGrams:3200.5},{birthWeightGrams:'3200'},{birthWeightGrams:0},{birthLengthCm:50.25},{birthLengthCm:'50'},{birthLengthCm:0}])assert.equal((await request('/api/baby','PUT',{...profile,...values})).status,400);
 await stop();await start();assert.equal((await request('/api/baby')).data.baby.birth_length_mm,502);
 const clear=await request('/api/baby','PUT',{...profile,birthWeightGrams:null,birthLengthCm:null});assert.equal(clear.status,200);assert.equal(clear.data.baby.birth_length_mm,null);
});
test('喂奶跨时区统计、补录排序、提醒间隔',async()=>{
  for (const [fedAt,amountMl] of [['2026-11-11T00:30:00.000Z',100],['2026-11-10T15:30:00.000Z',80],['2026-11-10T17:30:00.000Z',120]]) {
    assert.equal((await request('/api/records','POST',{fedAt,amountMl,note:'接口测试'})).status,201);
  }
  const {data}=await request('/api/records');
  assert.equal(data.summary.todayCount,2);assert.equal(data.summary.todayAmount,220);
  assert.equal(data.summary.todayAverageIntervalHours,7);
  assert.equal(data.summary.nextAt,'2026-11-11T03:30:00.000Z');assert.equal(data.records[0].amount_ml,100);
  const updated=await request('/api/settings','PUT',{intervalHours:2.5,amountMl:130,feedingType:'formula',formulaBrand:'测试奶粉',formulaStage:1});
  assert.equal(updated.data.summary.nextAt,'2026-11-11T03:00:00.000Z'); assert.equal(updated.data.amountMl,130); assert.equal(updated.data.feedingType,'formula'); assert.equal(updated.data.formulaBrand,'测试奶粉');
  assert.equal((await request('/api/settings','PUT',{intervalHours:0,amountMl:130,feedingType:'formula',formulaBrand:'测试奶粉',formulaStage:1})).status,400);
});
test('每日体重保持一条，补录日期正确排序',async()=>{
  await request('/api/weights','PUT',{measuredOn:'2026-11-11',weightGrams:3500});
  await request('/api/weights','PUT',{measuredOn:'2026-11-11',weightGrams:3550});
  await request('/api/weights','PUT',{measuredOn:'2026-11-10',weightGrams:3520});
  const {data}=await request('/api/weights');assert.equal(data.weights.length,2);assert.equal(data.weights[0].weight_grams,3550);
  assert.equal((await request('/api/weights','PUT',{measuredOn:'2026-11-12',weightGrams:3500})).status,400);
  assert.equal((await request('/api/weights','PUT',{measuredOn:'2026-02-30',weightGrams:3500})).status,400);
});
test('最近24小时与自然日分别统计，排除窗口外和未来记录且不受50条限制',async()=>{
  const baseline=(await request('/api/records')).data.summary;
  const now=Date.now(),ids=[];
  for(let index=0;index<55;index++){
    const saved=await request('/api/records','POST',{fedAt:new Date(now-3600000).toISOString(),amountMl:10});ids.push(saved.data.record.id);
  }
  for(const fedAt of [new Date(now-25*3600000).toISOString(),new Date(now+3600000).toISOString()]){
    const saved=await request('/api/records','POST',{fedAt,amountMl:70});ids.push(saved.data.record.id);
  }
  const {summary}= (await request('/api/records')).data;
  assert.equal(Date.parse(summary.last24HoursEnd)-Date.parse(summary.last24HoursStart),24*3600000);
  assert.equal(summary.last24HoursAmount,baseline.last24HoursAmount+550);
  assert.equal(summary.last24HoursCount,baseline.last24HoursCount+55);
  for(const id of ids)await request(`/api/records/${id}`,'DELETE');
  const freshNow=new Date(),localStart=new Date(freshNow.getFullYear(),freshNow.getMonth(),freshNow.getDate()),localEnd=new Date(freshNow.getFullYear(),freshNow.getMonth(),freshNow.getDate()+1);
  const windowHeaders={...headers,'X-Day-Start':localStart.toISOString(),'X-Day-End':localEnd.toISOString()};
  const before=(await (await fetch(base+'/api/records',{headers:windowHeaders})).json()).summary;
  const atZero=(await request('/api/records','POST',{fedAt:localStart.toISOString(),amountMl:30})).data.record;
  const future=(await request('/api/records','POST',{fedAt:new Date(freshNow.getTime()+3600000).toISOString(),amountMl:70})).data.record;
  const after=(await (await fetch(base+'/api/records',{headers:windowHeaders})).json()).summary;
  assert.equal(after.todayRecordedAmount,before.todayRecordedAmount+30);
  assert.equal(after.todayRecordedCount,before.todayRecordedCount+1);
  await request(`/api/records/${atZero.id}`,'DELETE');await request(`/api/records/${future.id}`,'DELETE');
});
const photo='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jH0YAAAAASUVORK5CYII=';
test('身长支持一位小数、每日更新、补记和历史范围筛选',async()=>{
  for(const lengthCm of [0,9.9,250.1,52.55,'52.5',null]) assert.equal((await request('/api/lengths','PUT',{measuredOn:'2026-11-11',lengthCm})).status,400);
  for(const measuredOn of ['2026-11-12','2026-02-30']) assert.equal((await request('/api/lengths','PUT',{measuredOn,lengthCm:52.5})).status,400);
  assert.equal((await request('/api/lengths','PUT',{measuredOn:'2026-11-11',lengthCm:52.5})).status,200);
  await request('/api/lengths','PUT',{measuredOn:'2026-11-11',lengthCm:52.7});
  await request('/api/lengths','PUT',{measuredOn:'2026-11-09',lengthCm:51.2});
  const saved=(await request('/api/lengths')).data.lengths;
  assert.equal(saved.length,2);assert.equal(saved[0].measured_on,'2026-11-11');assert.equal(saved[0].length_mm,527);
  const query=new URLSearchParams({start:'2026-11-10T16:00:00.000Z',end:'2026-11-11T16:00:00.000Z',fromDay:'2026-11-11',toDay:'2026-11-11'});
  const logs=(await request(`/api/logs?${query}`)).data;
  assert.equal(logs.lengths.length,1);assert.equal(logs.lengths[0].length_mm,527);
});
test('按设备时区查询历史范围，覆盖超过最近条数的记录和补录体重', async()=>{
  for(let index=0;index<55;index++) await request('/api/records','POST',{fedAt:'2026-11-11T02:00:00.000Z',amountMl:70});
  await request('/api/diapers','POST',{occurredAt:'2026-11-10T16:00:00.000Z'});
  await request('/api/diapers','POST',{occurredAt:'2026-11-11T16:00:00.000Z'});
  const query = new URLSearchParams({start:'2026-11-09T16:00:00.000Z',end:'2026-11-11T16:00:00.000Z',fromDay:'2026-11-10',toDay:'2026-11-11'});
  const result=await request(`/api/logs?${query}`);
  assert.equal(result.status,200); assert.equal(result.data.records.length,58);
  assert.equal(result.data.weights.length,2); assert.equal(result.data.diapers.length,1);
  const old=await request('/api/logs?'+new URLSearchParams({start:'2026-11-09T16:00:00.000Z',end:'2026-11-10T16:00:00.000Z',fromDay:'2026-11-10',toDay:'2026-11-10'}));
  assert.equal(old.data.records.length,1); assert.equal(old.data.records[0].amount_ml,80);
  assert.equal(old.data.weights[0].measured_on,'2026-11-10'); assert.equal(old.data.diapers.length,0);
  assert.equal((await request('/api/logs?'+new URLSearchParams({start:'invalid'}))).status,400);
  // Remove only the disposable entries created for this test.
  const added=result.data.records.filter(r=>r.fed_at==='2026-11-11T02:00:00.000Z');
  for(const row of added) await request(`/api/records/${row.id}`,'DELETE');
});
let stoolId;
test('照片和排便时间保存，读取图片字节一致',async()=>{
  assert.equal((await request('/api/stools','POST',{occurredAt:'2026-11-11T01:00:00.000Z',photo:'not-an-image'})).status,400);
  const saved=await request('/api/stools','POST',{occurredAt:'2026-11-11T01:00:00.000Z',note:'测试照片',photo});assert.equal(saved.status,201);stoolId=saved.data.id;
  const image=await fetch(`${base}/api/stools/${stoolId}/photo`);assert.equal(image.headers.get('content-type'),'image/png');
  assert.deepEqual(Buffer.from(await image.arrayBuffer()),Buffer.from(photo.split(',')[1],'base64'));
});
let stoolWithoutPhotoId;
test('便便照片选填，无图记录参与统计且不提供照片',async()=>{
  const at='2026-11-11T03:00:00.000Z';
  for(const photoFields of [{},{photo:null},{photo:''}]) {
    const saved=await request('/api/stools','POST',{occurredAt:at,note:'不拍照记录',...photoFields});
    assert.equal(saved.status,201);
    const row=(await request('/api/stools')).data.stools.find(row=>row.id===saved.data.id);
    assert.equal(row.has_photo,0);assert.equal(row.note,'不拍照记录');
    assert.equal((await fetch(`${base}/api/stools/${row.id}/photo`)).status,404);
    const query=new URLSearchParams({start:'2026-11-10T16:00:00.000Z',end:'2026-11-11T16:00:00.000Z',fromDay:'2026-11-11',toDay:'2026-11-11'});
    assert.equal((await request(`/api/logs?${query}`)).data.stools.find(item=>item.id===row.id).has_photo,0);
    assert.equal((await request('/api/records')).data.summary.todayStoolCount,2);
    await request(`/api/stools/${row.id}`,'DELETE');
  }
  stoolWithoutPhotoId=(await request('/api/stools','POST',{occurredAt:'2026-11-09T00:00:00.000Z',note:'无图持久化'})).data.id;
});
test('今日尿布和便便次数按设备本地零点统计',async()=>{
  const ids=[];
  for(const occurredAt of ['2026-11-10T15:59:59.000Z','2026-11-10T16:00:00.000Z','2026-11-11T16:00:00.000Z']) {
    const saved=await request('/api/stools','POST',{occurredAt,photo});ids.push(saved.data.id);
  }
  const {summary}= (await request('/api/records')).data;
  assert.equal(summary.todayDiaperCount,1);
  assert.equal(summary.todayStoolCount,2);
  for(const id of ids) await request(`/api/stools/${id}`,'DELETE');
});
let abnormalId;
test('亲喂只记时间，瓶喂母乳和奶粉计量，混合喂养独立保存本次喂法',async()=>{
  const original=(await request('/api/settings')).data;
  const settings={...original,feedingType:'breast',breastMethod:'direct'};
  delete settings.amountMl;
  assert.equal((await request('/api/settings','PUT',settings)).status,200);
  const occurred=new Date(Date.now()-60000).toISOString();
  const baseline=(await request('/api/records')).data.summary;
  const direct=await request('/api/records','POST',{fedAt:occurred});
  assert.equal(direct.status,201);assert.equal(direct.data.record.amount_ml,null);assert.equal(direct.data.record.feeding_method,'direct');
  assert.equal(direct.data.summary.last24HoursAmount,baseline.last24HoursAmount);
  assert.equal(direct.data.summary.last24HoursCount,baseline.last24HoursCount+1);
  assert.equal(direct.data.summary.last24HoursDirectCount,baseline.last24HoursDirectCount+1);
  assert.equal((await request('/api/records','POST',{fedAt:occurred,feedingMethod:'direct',amountMl:70})).status,400);
  await request('/api/settings','PUT',{...original,feedingType:'breast',breastMethod:'bottle'});
  assert.equal((await request('/api/records','POST',{fedAt:occurred})).status,400);
  const bottle=await request('/api/records','POST',{fedAt:occurred,amountMl:70});
  assert.equal(bottle.status,201);assert.equal(bottle.data.record.feeding_method,'breast_bottle');
  await request('/api/settings','PUT',{...original,feedingType:'mixed',breastMethod:'bottle'});
  assert.equal((await request('/api/settings')).data.breastMethod,'bottle');
  assert.equal((await request('/api/records','POST',{fedAt:occurred,amountMl:70})).status,400);
  const formula=await request('/api/records','POST',{fedAt:occurred,feedingMethod:'formula',amountMl:80});
  assert.equal(formula.status,201);assert.equal(formula.data.record.feeding_method,'formula');
  for(const payload of [{feedingMethod:'formula',amountMl:null},{feedingMethod:'breast_bottle',amountMl:0},{feedingMethod:'formula',amountMl:'70'},{feedingMethod:'wrong',amountMl:70}])assert.equal((await request('/api/records','POST',{fedAt:occurred,...payload})).status,400);
  const rangeStart=new Date(Date.parse(occurred)-1000).toISOString(),rangeEnd=new Date(Date.parse(occurred)+1000).toISOString();
  const query=new URLSearchParams({start:rangeStart,end:rangeEnd,fromDay:occurred.slice(0,10),toDay:occurred.slice(0,10)});
  const logs=(await request('/api/logs?'+query)).data.records;
  assert.equal(logs.find(row=>row.id===direct.data.record.id).amount_ml,null);
  assert.equal(logs.find(row=>row.id===bottle.data.record.id).feeding_method,'breast_bottle');
  assert.equal(formula.data.summary.last24HoursAmount,baseline.last24HoursAmount+150);
  await request('/api/settings','PUT',original);
  assert.equal((await request('/api/records')).data.records.find(row=>row.id===direct.data.record.id).feeding_method,'direct');
  for(const row of [direct,bottle,formula])await request(`/api/records/${row.data.record.id}`,'DELETE');
});
test('八类异常独立保存，黄疸数值、单位、蓝光和体温部位完整校验',async()=>{
  const at='2026-11-11T02:00:00.000Z';
  const entries=[
    {category:'vomiting',symptoms:['反复呕吐','喷射样呕吐']},
    {category:'temperature',symptoms:['体温偏高'],temperatureC:37.8,measurementSite:'腋下'},
    {category:'jaundice',symptoms:[],bilirubinValue:12.3,bilirubinUnit:'mg',phototherapy:false},
    {category:'skin',symptoms:['肚脐周围红肿']},
    {category:'eyes',symptoms:['口腔出现白斑']},
    {category:'activity',symptoms:['活动明显减少']},
    {category:'breathing',symptoms:['呼吸费力']},
    {category:'other',symptoms:[],description:'观察到的其他情况'}
  ];
  const ids=[];
  for(const [index,entry] of entries.entries()){const saved=await request('/api/abnormalities','POST',{occurredAt:at,observations:[entry],note:'补充描述',photo:index===0?photo:''});assert.equal(saved.status,201);ids.push(saved.data.id);}
  abnormalId=ids[2];
  const rows=(await request('/api/abnormalities')).data.abnormalities;
  assert.deepEqual(rows.find(row=>row.id===abnormalId).observations,[entries[2]]);
  assert.equal(rows.find(row=>row.id===ids[0]).has_photo,true);
  const abnormalImage=await fetch(`${base}/api/abnormalities/${ids[0]}/photo`);assert.equal(abnormalImage.headers.get('content-type'),'image/png');
  const badEntries=[{...entries[1],measurementSite:''},{...entries[1],temperatureC:'37.8'},{...entries[2],phototherapy:undefined},{...entries[2],bilirubinUnit:'unknown'},{...entries[2],bilirubinValue:12.34},{...entries[7],description:' '},{category:'skin',symptoms:['不存在']},{category:'skin',symptoms:[]}];
  for(const entry of badEntries)assert.equal((await request('/api/abnormalities','POST',{occurredAt:at,observations:[entry]})).status,400);
  assert.equal((await request('/api/abnormalities','POST',{occurredAt:'invalid',observations:[entries[0]]})).status,400);
  assert.equal((await request('/api/abnormalities','POST',{occurredAt:at,observations:entries.slice(0,2)})).status,400);
  const query=new URLSearchParams({start:'2026-11-10T16:00:00.000Z',end:'2026-11-11T16:00:00.000Z',fromDay:'2026-11-11',toDay:'2026-11-11'});
  assert.equal((await request(`/api/logs?${query}`)).data.abnormalities.length,8);
  for(const id of ids.filter(id=>id!==abnormalId))await request(`/api/abnormalities/${id}`,'DELETE');
});
test('常用药品名称和单位保存、查重、修改，计划支持两种时间与暂停，记录和计划保留原单位',async()=>{
  const defaults=(await request('/api/common-medicines')).data.medicines;
  assert.deepEqual(defaults.map(item=>item.name),['维生素AD','维生素D3']);
  assert.ok(defaults.every(item=>item.unit===''));
  for(const body of [{name:'',unit:'滴'},{name:'测试',unit:''},{name:'测试',unit:1},{name:'测试',unit:'字'.repeat(13)}])assert.equal((await request('/api/common-medicines','POST',body)).status,400);
  const added=await request('/api/common-medicines','POST',{name:' 测试药品 ',unit:' 滴 '});assert.equal(added.status,201);
  const medicine=added.data.medicines.find(item=>item.name==='测试药品');assert.equal(medicine.unit,'滴');
  assert.equal((await request('/api/common-medicines','POST',{name:'测试药品',unit:'粒'})).status,409);
  const body={medicineId:medicine.id,dose:'1.5',mode:'daily',dailyTime:'08:00',startAt:'2026-11-10T00:00:00.000Z',timezoneOffset:-480,enabled:true};
  const saved=await request('/api/medication-plans','POST',body);assert.equal(saved.status,201);
  const plan=saved.data.plans[0];assert.equal(plan.unit,'滴');assert.ok(plan.nextAt);
  assert.equal((await request('/api/medication-plans','POST',body)).status,409);
  for(const bad of [{...body,medicineId:9999},{...body,medicineId:defaults[0].id},{...body,dose:'0'},{...body,dose:'1滴'},{...body,enabled:'true'},{...body,mode:'other'},{...body,dailyTime:'09:00'},{...body,startAt:'invalid'},{...body,mode:'interval',intervalHours:0},{...body,mode:'interval',intervalHours:1.2}])assert.equal((await request(`/api/medication-plans/${plan.id}`,'PUT',bad)).status,400);
  assert.equal((await request(`/api/medication-plans/${plan.id}`,'PUT',{...body,mode:'interval',intervalHours:24})).status,200);
  assert.equal((await request(`/api/medication-plans/${plan.id}`,'PATCH',{enabled:false})).data.plans[0].nextAt,null);
  assert.equal((await request(`/api/medication-plans/${plan.id}`,'PATCH',{enabled:true})).data.plans[0].enabled,true);
  const log=await request('/api/medications','POST',{occurredAt:'2026-11-11T00:00:00.000Z',medicines:[{medicineId:medicine.id,name:medicine.name,dose:'1.5',unit:'滴'}]});assert.equal(log.status,201);
  assert.equal((await request(`/api/common-medicines/${medicine.id}`,'PUT',{name:'测试改名',unit:'毫升'})).status,200);
  await stop();await start();
  assert.equal((await request('/api/common-medicines')).data.medicines.find(item=>item.id===medicine.id).unit,'毫升');
  assert.equal((await request('/api/medication-plans')).data.plans[0].unit,'滴');
  assert.equal((await request('/api/medications')).data.medications.find(item=>item.id===log.data.id).medicines[0].unit,'滴');
  await request(`/api/medications/${log.data.id}`,'DELETE');
  await request(`/api/medication-plans/${plan.id}`,'PATCH',{enabled:false});
});
test('用药记录支持常用药、多种药品、照片和日期筛选',async()=>{
  const at='2026-11-11T09:21:00.000Z';
  const saved=await request('/api/medications','POST',{occurredAt:at,medicines:[{name:'维生素AD',dose:'1 滴'},{name:'维生素D3',dose:''}],note:'早餐后'});
  assert.equal(saved.status,201);
  const row=(await request('/api/medications')).data.medications.find(item=>item.id===saved.data.id);
  assert.deepEqual(row.medicines,[{name:'维生素AD',dose:'1 滴'},{name:'维生素D3',dose:''}]);
  const query=new URLSearchParams({start:'2026-11-10T16:00:00.000Z',end:'2026-11-11T16:00:00.000Z',fromDay:'2026-11-11',toDay:'2026-11-11'});
  assert.equal((await request(`/api/logs?${query}`)).data.medications.some(item=>item.id===saved.data.id),true);
  for(const payload of [{occurredAt:'invalid',medicines:[{name:'维生素AD'}]},{occurredAt:at,medicines:[]},{occurredAt:at,medicines:[null]},{occurredAt:at,medicines:[{name:'',dose:''}]},{occurredAt:at,medicines:[{name:'维生素AD',dose:1}]},{occurredAt:at,medicines:[{name:'维生素AD'}],photo:'invalid'}])assert.equal((await request('/api/medications','POST',payload)).status,400);
  assert.equal((await fetch(`${base}/api/medications/${saved.data.id}/photo`)).status,404);
  const withPhoto=await request('/api/medications','POST',{occurredAt:'2026-11-10T09:21:00.000Z',medicines:[{name:' 自定义药品 ',dose:' 按实际记录 '}],photo});
  assert.equal(withPhoto.status,201);
  assert.equal((await request(`/api/logs?${query}`)).data.medications.some(item=>item.id===withPhoto.data.id),false);
  await stop();await start();
  const persisted=(await request('/api/medications')).data.medications.find(item=>item.id===withPhoto.data.id);
  assert.deepEqual(persisted.medicines,[{name:'自定义药品',dose:'按实际记录'}]);assert.equal(persisted.has_photo,true);
  const image=await fetch(`${base}/api/medications/${withPhoto.data.id}/photo`);assert.equal(image.headers.get('content-type'),'image/png');assert.deepEqual(Buffer.from(await image.arrayBuffer()),Buffer.from(photo.split(',')[1],'base64'));
  await request(`/api/medications/${withPhoto.data.id}`,'DELETE');assert.equal((await fetch(`${base}/api/medications/${withPhoto.data.id}/photo`)).status,404);
  await request(`/api/medications/${saved.data.id}`,'DELETE');
});
test('重启服务后档案、体重、喂奶与照片持久保存',async()=>{
  await stop();await start();
  assert.equal((await request('/api/baby')).data.baby.name,'小满');
  assert.equal((await request('/api/weights')).data.weights[0].weight_grams,3550);
  assert.equal((await request('/api/lengths')).data.lengths[0].length_mm,527);
  assert.equal((await request('/api/abnormalities')).data.abnormalities[0].observations[0].phototherapy,false);
  assert.equal((await request('/api/records')).data.records.length,3);
  assert.equal((await request('/api/settings')).data.intervalHours,2.5); assert.equal((await request('/api/settings')).data.amountMl,130);
  assert.equal((await fetch(`${base}/api/stools/${stoolId}/photo`)).status,200);
  assert.equal((await request('/api/stools')).data.stools.find(row=>row.id===stoolWithoutPhotoId).has_photo,0);
});
test('删除日志及照片，非法请求和页面路由',async()=>{
  await request(`/api/abnormalities/${abnormalId}`,'DELETE');assert.equal((await request('/api/abnormalities')).data.abnormalities.length,0);
  await request(`/api/stools/${stoolId}`,'DELETE');assert.equal((await fetch(`${base}/api/stools/${stoolId}/photo`)).status,404);
  const weights=(await request('/api/weights')).data.weights;await request(`/api/weights/${weights[0].id}`,'DELETE');assert.equal((await request('/api/weights')).data.weights.length,1);
  const lengths=(await request('/api/lengths')).data.lengths;await request(`/api/lengths/${lengths[0].id}`,'DELETE');assert.equal((await request('/api/lengths')).data.lengths.length,1);
  const records=(await request('/api/records')).data.records;await request(`/api/records/${records[0].id}`,'DELETE');assert.equal((await request('/api/records')).data.records.length,2);
  assert.equal((await request('/api/baby','PUT',null)).status,400);
  for(const page of ['/','/baby.html','/feeding.html','/weight.html','/stool.html','/length.html','/abnormal.html','/medication.html'])assert.equal((await fetch(base+page)).status,200);
});
