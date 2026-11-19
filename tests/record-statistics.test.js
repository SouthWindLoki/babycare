import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { growthChange } from '../public/growth-changes.js';
import { stoolColor } from '../public/stool-colors.js';

let child, base, dataDir;
const headers = { 'Content-Type':'application/json', 'X-Today':'2026-11-13', 'X-Day-Start':'2026-11-12T16:00:00.000Z', 'X-Day-End':'2026-11-13T16:00:00.000Z' };
async function request(path, method='GET', body) {
  const response = await fetch(base+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
  assert(response.ok, `${method} ${path}: ${await (response.ok ? Promise.resolve('') : response.text())}`);
  return response.json();
}
before(async()=>{
  dataDir = await mkdtemp(join(tmpdir(),'babycare-record-statistics-'));
  child = spawn(process.execPath,['--experimental-sqlite','server.js'],{cwd:new URL('..',import.meta.url),env:{...process.env,PORT:'0',DATA_DIR:dataDir},stdio:['ignore','pipe','pipe']});
  let stderr='';child.stderr.on('data',c=>stderr+=c);
  base = await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error(`服务启动超时: ${stderr}`)),10000);
    child.once('exit',code=>{clearTimeout(timer);reject(new Error(`服务退出 ${code}: ${stderr}`));});
    child.stdout.on('data',chunk=>{const match=chunk.toString().match(/http:\/\/localhost:(\d+)/);if(match){clearTimeout(timer);resolve(`http://127.0.0.1:${match[1]}`);}});
  });
});
after(async()=>{
  if(child && child.exitCode===null){const exited=once(child,'exit');child.kill('SIGTERM');await exited;}
  if(dataDir)await rm(dataDir,{recursive:true,force:true});
});

test('最近24小时按实际相邻间隔平均，包含亲喂，排除窗口外与未来，不依赖自然日头信息',async()=>{
  assert.equal((await request('/api/records')).summary.last24HoursAverageIntervalHours,null);
  await request('/api/settings','PUT',{intervalHours:3,amountMl:70,feedingType:'mixed',breastMethod:'direct',formulaBrand:'',formulaStage:1});
  const now=Date.now(),ids=[];
  const add=async(hours,method='formula')=>{
    const saved=await request('/api/records','POST',{fedAt:new Date(now-hours*3600000).toISOString(),feedingMethod:method,...(method==='direct'?{}:{amountMl:70})});
    ids.push(saved.record.id);
  };
  try {
    await add(12);
    assert.equal((await request('/api/records')).summary.last24HoursAverageIntervalHours,null);
    await add(9.5,'direct');await add(6);await add(1);
    await add(25);await add(-1);
    const {summary}=await request('/api/records');
    assert.equal(summary.last24HoursCount,4);
    assert.equal(summary.last24HoursDirectCount,1);
    assert.equal(summary.last24HoursAverageIntervalHours,3.7);
    const otherHeaders={...headers,'X-Day-Start':'2026-01-01T00:00:00.000Z','X-Day-End':'2026-01-02T00:00:00.000Z'};
    const other=await (await fetch(base+'/api/records',{headers:otherHeaders})).json();
    assert.equal(other.summary.last24HoursAverageIntervalHours,3.7);
  } finally {for(const id of ids)await request(`/api/records/${id}`,'DELETE');}
});

test('亲喂左右时长与瓶喂分开统计，历史范围返回时长，旧亲喂不伪造0分钟',async()=>{
  const now=Date.now(),ids=[];
  try {
    for(const [hours,details] of [[2,{feedingMethod:'direct',leftDurationSeconds:600,rightDurationSeconds:300}],[3,{feedingMethod:'direct',rightDurationSeconds:120}],[4,{feedingMethod:'direct'}],[5,{feedingMethod:'formula',amountMl:70}],[6,{feedingMethod:'breast_bottle',amountMl:80}],[25,{feedingMethod:'direct',leftDurationSeconds:9000}],[-1,{feedingMethod:'direct',leftDurationSeconds:5000}]]){
      const {record}=await request('/api/records','POST',{fedAt:new Date(now-hours*3600000).toISOString(),...details});ids.push(record.id);
      if(hours===3){assert.equal(record.left_duration_seconds,0);assert.equal(record.right_duration_seconds,120);}
      if(hours===4){assert.equal(record.left_duration_seconds,null);assert.equal(record.right_duration_seconds,null);}
    }
    const {summary}=await request('/api/records');
    assert.equal(summary.last24HoursDirectCount,3);assert.equal(summary.last24HoursTimedDirectCount,2);
    assert.equal(summary.last24HoursLeftDurationSeconds,600);assert.equal(summary.last24HoursRightDurationSeconds,420);
    assert.equal(summary.last24HoursBottleCount,2);assert.equal(summary.last24HoursAmount,150);assert.equal(summary.last24HoursCount,5);
    const start=new Date(now-24*3600000),end=new Date(now);
    const logs=await request('/api/logs?'+new URLSearchParams({start:start.toISOString(),end:end.toISOString(),fromDay:start.toISOString().slice(0,10),toDay:end.toISOString().slice(0,10)}));
    assert.equal(logs.records.find(row=>row.id===ids[0]).left_duration_seconds,600);
    // 自然日通过显式窗口验证，与滚动24小时独立。
    const dayHeaders={...headers,'X-Day-Start':new Date(now-3.5*3600000).toISOString(),'X-Day-End':new Date(now+20.5*3600000).toISOString()};
    const daily=(await(await fetch(base+'/api/records',{headers:dayHeaders})).json()).summary;
    assert.equal(daily.todayDirectCount,2);assert.equal(daily.todayTimedDirectCount,2);assert.equal(daily.todayLeftDurationSeconds,600);assert.equal(daily.todayRightDurationSeconds,420);assert.equal(daily.todayBottleCount,0);
    for(const details of [{leftDurationSeconds:-1},{leftDurationSeconds:0.5},{leftDurationSeconds:'60'},{leftDurationSeconds:86401},{leftDurationSeconds:50000,rightDurationSeconds:50000},{feedingMethod:'formula',amountMl:70,leftDurationSeconds:60}]){
      const response=await fetch(base+'/api/records',{method:'POST',headers,body:JSON.stringify({fedAt:new Date(now).toISOString(),feedingMethod:'direct',...details})});assert.equal(response.status,400);
    }
  } finally {for(const id of ids)await request(`/api/records/${id}`,'DELETE');}
});

test('24小时平均不受最近50条限制，零间隔不会被当作缺少记录',async()=>{
  const now=Date.now(),ids=[];
  try {
    assert.equal((await request('/api/records')).summary.latestDirect,null);
    const previous=(await request('/api/records','POST',{fedAt:new Date(now-26*3600000).toISOString(),feedingMethod:'direct',leftDurationSeconds:600,rightDurationSeconds:0})).record;
    ids.push(previous.id);
    ids.push((await request('/api/records','POST',{fedAt:new Date(now+3600000).toISOString(),feedingMethod:'direct',leftDurationSeconds:900})).record.id);
    ids.push((await request('/api/records','POST',{fedAt:new Date(now-20*3600000).toISOString(),amountMl:70,feedingMethod:'formula'})).record.id);
    const fedAt=new Date(now-3600000).toISOString();
    for(let i=0;i<55;i++)ids.push((await request('/api/records','POST',{fedAt,amountMl:70,feedingMethod:'formula'})).record.id);
    const {records,summary}=await request('/api/records');
    assert.equal(records.some(row=>row.id===previous.id),false);
    assert.equal(summary.latestDirect.id,previous.id);
    assert.equal(summary.latestDirect.left_duration_seconds,600);
    assert.equal(summary.latestDirect.right_duration_seconds,0);
    assert.equal(records.length,50);assert.equal(summary.last24HoursCount,56);
    assert.equal(summary.last24HoursAverageIntervalHours,0.3);
    await request(`/api/records/${ids.splice(2,1)[0]}`,'DELETE');
    assert.equal((await request('/api/records')).summary.last24HoursAverageIntervalHours,0);
    ids.push((await request('/api/records','POST',{fedAt:new Date(now-1800000).toISOString(),feedingMethod:'direct'})).record.id);
    const untimed=(await request('/api/records')).summary.latestDirect;
    assert.equal(untimed.id,ids.at(-1));assert.equal(untimed.left_duration_seconds,null);assert.equal(untimed.right_duration_seconds,null);
  } finally {for(const id of ids)await request(`/api/records/${id}`,'DELETE');}
});

test('排泄记录统一取最近24小时，含跨夜记录、排除未来和窗口外，独立于自然日',async()=>{
  const now=Date.now(),saved=[];
  try {
    for(const route of ['stools','diapers'])for(const hours of [30,23,12,1,-1]) {
      const row=await request(`/api/${route}`,'POST',{occurredAt:new Date(now-hours*3600000).toISOString()});
      saved.push([route,row.id]);
    }
    const {summary}=await request('/api/records');
    assert.equal(summary.last24HoursStoolCount,3);assert.equal(summary.last24HoursWetDiaperCount,3);
    const changedHeaders={...headers,'X-Day-Start':'2026-01-01T00:00:00.000Z','X-Day-End':'2026-01-02T00:00:00.000Z'};
    const other=await(await fetch(base+'/api/records',{headers:changedHeaders})).json();
    assert.equal(other.summary.last24HoursStoolCount,3);assert.equal(other.summary.last24HoursWetDiaperCount,3);
  } finally {for(const [route,id] of saved)await request(`/api/${route}/${id}`,'DELETE');}
});

const query=(fromDay,toDay=fromDay)=>'/api/logs?'+new URLSearchParams({start:`${fromDay}T00:00:00.000Z`,end:`${toDay}T23:59:59.999Z`,fromDay,toDay});
test('体重和身长按测量日期找上一次，范围外也可对比；补录、同日改值和删除后重算',async()=>{
  for(const [day,grams,cm] of [['2026-10-10',3400,51],['2026-10-01',3300,50],['2026-10-20',3500,52]]){
    await request('/api/weights','PUT',{measuredOn:day,weightGrams:grams});
    await request('/api/lengths','PUT',{measuredOn:day,lengthCm:cm});
  }
  let logs=await request(query('2026-10-10'));
  assert.equal(logs.weights.length,1);assert.equal(logs.lengths.length,1);
  assert.equal(logs.weights[0].previous_weight_grams,3300);
  assert.equal(logs.lengths[0].previous_length_mm,500);
  assert.equal(logs.weights[0].previous_measured_on,'2026-10-01');
  assert.equal(growthChange(logs.weights[0],'weight').label,'比上次重 0.20 斤（100 克）');
  assert.equal(growthChange(logs.lengths[0],'length').label,'比上次长 1.0 厘米');
  // 后补的测量成为上一次，不能按保存顺序或用下一条较新的测量作比较。
  await request('/api/weights','PUT',{measuredOn:'2026-10-05',weightGrams:3450});
  await request('/api/lengths','PUT',{measuredOn:'2026-10-05',lengthCm:51.5});
  logs=await request(query('2026-10-10'));
  assert.equal(growthChange(logs.weights[0],'weight').label,'比上次轻 0.10 斤（50 克）');
  assert.equal(growthChange(logs.lengths[0],'length').label,'比上次短 0.5 厘米');
  await request('/api/weights','PUT',{measuredOn:'2026-10-05',weightGrams:3400});
  await request('/api/lengths','PUT',{measuredOn:'2026-10-05',lengthCm:51});
  logs=await request(query('2026-10-10'));
  assert.equal(growthChange(logs.weights[0],'weight').label,'与上次体重相同');
  assert.equal(growthChange(logs.lengths[0],'length').label,'与上次身长相同');
  const previous=await request(query('2026-10-05'));
  await request(`/api/weights/${previous.weights[0].id}`,'DELETE');
  await request(`/api/lengths/${previous.lengths[0].id}`,'DELETE');
  logs=await request(query('2026-10-10'));
  assert.equal(logs.weights[0].previous_weight_grams,3300);assert.equal(logs.lengths[0].previous_length_mm,500);
  const first=await request(query('2026-10-01'));
  assert.equal(first.weights[0].previous_weight_grams,null);assert.equal(first.lengths[0].previous_length_mm,null);
  assert.equal(growthChange(first.weights[0],'weight').comparable,false);
  assert.equal(growthChange(first.lengths[0],'length').comparable,false);
});

test('首条可见记录早于最近30条也能查到前次测量',async()=>{
  for(let i=1;i<=31;i++){
    const day=`2026-08-${String(i).padStart(2,'0')}`;
    await request('/api/weights','PUT',{measuredOn:day,weightGrams:3000+i});
    await request('/api/lengths','PUT',{measuredOn:day,lengthCm:49+i/10});
  }
  const logs=await request(query('2026-08-02'));
  assert.equal(logs.weights[0].previous_weight_grams,3001);
  assert.equal(logs.lengths[0].previous_length_mm,491);
  assert.equal(growthChange(logs.weights[0],'weight').label,'比上次重 0.002 斤（1 克）');
  assert.equal(growthChange(logs.lengths[0],'length').label,'比上次长 0.1 厘米');
});

test('便便颜色在保存、记录列表和历史查询中保持一致，有照片时也不丢失颜色',async()=>{
  const photo='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jH0YAAAAASUVORK5CYII=';
  for(const [index,color] of ['墨绿色','黄绿色','黄色','棕黄色','棕色','黑色','灰白色','红色','其他'].entries()) {
    const saved=await request('/api/stools','POST',{occurredAt:'2026-11-13T01:00:00.000Z',color,...(index%2?{photo}:{})});
    const row=(await request('/api/stools')).stools.find(row=>row.id===saved.id);
    const log=(await request(query('2026-11-13'))).stools.find(row=>row.id===saved.id);
    assert.equal(row.color,color);assert.equal(log.color,color);
    assert.equal(row.has_photo,index%2);
    assert.equal(stoolColor(color).label,`颜色：${color}`);
    assert.match(stoolColor(color).swatch,/^#[0-9a-f]{6}$/);
  }
  const old=await request('/api/stools','POST',{occurredAt:'2026-11-13T01:00:00.000Z'});
  const row=(await request('/api/stools')).stools.find(row=>row.id===old.id);
  assert.equal(row.color,'未记录');
  for(const value of ['未记录',undefined,'',null,'<script>'])assert.deepEqual(stoolColor(value),{label:'未记录颜色',swatch:null});
});
