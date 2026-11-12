import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { feedingValue,exportFeedingAmount,planMethods } from '../public/feeding-options.js';

test('显示和导出亲喂为未计量，旧记录不推断喂法',()=>{
  assert.equal(feedingValue({feeding_method:'direct',amount_ml:null}),'母乳亲喂 · 仅记时间');
  assert.equal(exportFeedingAmount({feeding_method:'direct',amount_ml:null}),'亲喂（未计量）');
  assert.equal(feedingValue({feeding_method:'breast_bottle',amount_ml:70}),'瓶喂母乳 · 70 毫升');
  assert.equal(feedingValue({feeding_method:'unknown',amount_ml:70}),'70 毫升');
  assert.deepEqual(planMethods('breast','direct'),['direct']);
  assert.deepEqual(planMethods('breast','bottle'),['breast_bottle']);
  assert.deepEqual(planMethods('mixed','bottle'),['breast_bottle','formula']);
});

test('旧数据库迁移保留奶量、时间、ID和自增序列，重启后亲喂仍无奶量',async()=>{
  const dataDir=await mkdtemp(join(tmpdir(),'babycare-migration-'));
  const old=new DatabaseSync(join(dataDir,'babycare.sqlite'));
  old.exec(`CREATE TABLE feedings (id INTEGER PRIMARY KEY AUTOINCREMENT,fed_at TEXT NOT NULL,amount_ml INTEGER NOT NULL CHECK (amount_ml>0 AND amount_ml<=2000),note TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    INSERT INTO feedings VALUES (7,'2026-11-11T00:30:00.000Z',70,'旧记录','2026-11-11 00:31:00');
    UPDATE sqlite_sequence SET seq=42 WHERE name='feedings';`);
  old.close();
  let child;
  async function start(){
    child=spawn(process.execPath,['--experimental-sqlite','server.js'],{cwd:new URL('..',import.meta.url),env:{...process.env,DATA_DIR:dataDir,PORT:'0'},stdio:['ignore','pipe','pipe']});
    let stderr='';child.stderr.on('data',chunk=>stderr+=chunk);
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error('启动超时 '+stderr)),10000);
      child.once('exit',()=>{clearTimeout(timer);reject(new Error(stderr));});
      child.stdout.on('data',chunk=>{const match=chunk.toString().match(/localhost:(\d+)/);if(match){clearTimeout(timer);resolve(`http://127.0.0.1:${match[1]}`);}});
    });
  }
  async function stop(){if(child?.exitCode===null){const stopped=once(child,'exit');child.kill('SIGTERM');await stopped;}}
  try {
    let base=await start();
    const records=(await (await fetch(base+'/api/records')).json()).records;
    assert.deepEqual(records[0],{id:7,fed_at:'2026-11-11T00:30:00.000Z',amount_ml:70,feeding_method:'unknown',note:'旧记录',created_at:'2026-11-11 00:31:00'});
    const response=await fetch(base+'/api/records',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({fedAt:'2026-11-11T01:30:00.000Z',feedingMethod:'direct'})});
    assert.equal(response.status,201);const saved=(await response.json()).record;assert.equal(saved.id,43);assert.equal(saved.amount_ml,null);
    await stop();base=await start();
    const after=(await (await fetch(base+'/api/records')).json()).records;
    assert.equal(after.find(row=>row.id===43).amount_ml,null);assert.equal(after.find(row=>row.id===7).amount_ml,70);
  } finally {await stop();await rm(dataDir,{recursive:true,force:true});}
});
