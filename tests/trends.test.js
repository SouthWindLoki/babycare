import { test } from 'node:test';
import assert from 'node:assert/strict';
import { trendKeys, trendQuery, trendValue, growthTrendDate } from '../public/trends.js';

test('月视图参考采用该指标最后实测日，体重身长日期独立，不误用月初年龄',()=>{
  const logs={weights:[{measured_on:'2026-10-29'},{measured_on:'2026-11-02'},{measured_on:'2026-11-13'}],lengths:[{measured_on:'2026-11-11'}]};
  const now=new Date(2026,10,13,12);
  assert.equal(growthTrendDate(logs,'weight','month','2026-11',now),'2026-11-13');
  assert.equal(growthTrendDate(logs,'length','month','2026-11',now),'2026-11-11');
  assert.equal(growthTrendDate(logs,'weight','month','2026-10',now),'2026-10-29');
  assert.equal(growthTrendDate(logs,'length','month','2026-10',now),'2026-10-31');
  assert.equal(growthTrendDate({weights:[]},'weight','month','2026-11',now),'2026-11-13');
  assert.equal(growthTrendDate(logs,'weight','day','2026-11-01',now),'2026-11-01');
});

test('趋势日期跨年、月末仍按本地自然日和自然月取范围',()=>{
  const now=new Date(2026,0,15,12);
  const days=trendKeys('day',now),months=trendKeys('month',now);
  assert.equal(days.length,30);assert.equal(days[0],'2025-12-17');assert.equal(days.at(-1),'2026-01-15');
  assert.equal(months.length,12);assert.equal(months[0],'2025-02');assert.equal(months.at(-1),'2026-01');
  const query=trendQuery('month',now);
  assert.equal(query.get('fromDay'),'2025-02-01');assert.equal(query.get('toDay'),'2026-01-15');
  assert.equal(new Date(query.get('end')).getDate(),16);
});
test('四类趋势按日月分组，体重用月底最后一次，缺记录留空',()=>{
  const at=new Date(2026,0,31,23,59).toISOString(),next=new Date(2026,1,1,0,0).toISOString();
  const logs={records:[{fed_at:at},{fed_at:at},{fed_at:next}],diapers:[{occurred_at:at}],stools:[{occurred_at:next}],weights:[{measured_on:'2026-01-31',weight_grams:3600},{measured_on:'2026-01-01',weight_grams:3500}]};
  assert.equal(trendValue(logs,'feeding','day','2026-01-31'),2);
  assert.equal(trendValue(logs,'feeding','month','2026-02'),1);
  assert.equal(trendValue(logs,'diaper','month','2026-01'),1);
  assert.equal(trendValue(logs,'stool','day','2026-01-31'),0);
  assert.equal(trendValue(logs,'weight','month','2026-01'),7.2);
  assert.equal(trendValue(logs,'weight','day','2026-01-01'),7);
  assert.equal(trendValue(logs,'weight','day','2026-01-02'),null);
});
test('身长趋势按厘米显示，按月取最后一次测量，未测量留空',()=>{
  const logs={lengths:[{measured_on:'2026-11-11',length_mm:527},{measured_on:'2026-11-01',length_mm:510},{measured_on:'2026-10-29',length_mm:503}]};
  assert.equal(trendValue(logs,'length','day','2026-11-11'),52.7);
  assert.equal(trendValue(logs,'length','month','2026-11'),52.7);
  assert.equal(trendValue(logs,'length','month','2026-10'),50.3);
  assert.equal(trendValue(logs,'length','day','2026-11-10'),null);
});
