import test from 'node:test';
import assert from 'node:assert/strict';
import { NursingTimer, formatNursingDuration } from '../public/nursing-timer.js';

test('左右切换、暂停、继续：同一时刻只累计一侧，保留不足一秒的时间',()=>{
  const timer=new NursingTimer();timer.start('left',1000);
  assert.deepEqual(timer.values(61500),{leftSeconds:60,rightSeconds:0});
  timer.start('right',61500);timer.pause(92000);
  assert.deepEqual(timer.values(999999),{leftSeconds:60,rightSeconds:30});
  timer.start('left',100000);timer.pause(100500);
  assert.deepEqual(timer.values(),{leftSeconds:61,rightSeconds:30});
  assert.equal(timer.startedAt,1000);
});
test('后台时间和刷新草稿按时间戳恢复，暂停后等待不增加时长',()=>{
  const timer=new NursingTimer();timer.start('right',1000);
  const restored=new NursingTimer(JSON.parse(JSON.stringify(timer.draft())),601000);
  assert.deepEqual(restored.values(601000),{leftSeconds:0,rightSeconds:600});
  restored.pause(601000);const paused=new NursingTimer(restored.draft(),999999);
  assert.deepEqual(paused.values(999999),{leftSeconds:0,rightSeconds:600});
});
test('补录、清空和损坏的草稿，24小时上限不会溢出或得到负时长',()=>{
  const timer=new NursingTimer();assert.equal(timer.setSeconds('left',600),true);assert.equal(timer.setSeconds('right',900),true);
  assert.equal(timer.setSeconds('right',86400),false);assert.equal(timer.setSeconds('left',-1),false);
  timer.start('left',1000);assert.deepEqual(timer.values(0),{leftSeconds:600,rightSeconds:900});
  timer.pause(86401000);assert.equal(timer.values().leftSeconds+timer.values().rightSeconds,86400);
  timer.start('right',86402000);assert.equal(timer.active,null);
  timer.reset();assert.deepEqual(timer.values(),{leftSeconds:0,rightSeconds:0});assert.equal(timer.startedAt,null);
  for(const draft of [{},{version:1,leftMs:-1,rightMs:0,active:null},{version:1,leftMs:0,rightMs:0,active:'left',since:'bad'}])assert.deepEqual(new NursingTimer(draft).values(),{leftSeconds:0,rightSeconds:0});
  assert.equal(formatNursingDuration(905),'15 分 5 秒');assert.equal(formatNursingDuration(0),'0 分');
});
