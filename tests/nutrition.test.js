import { test } from 'node:test';
import assert from 'node:assert/strict';
import { completedMonths, milkReference, milkStatus, nutritionPdfUrl } from '../public/nutrition.js';

test('上海规范奶量按月龄和喂养方式取值，缺资料不判断',()=>{
  const now=new Date(2026,10,11,12);
  const cases=[['2026-11-11',500,750],['2026-08-11',500,750],['2026-07-11',800,1000],['2026-05-11',800,1000],['2026-04-11',500,700],['2025-11-11',500,700],['2025-10-11',400,600],['2024-11-12',400,600],['2024-11-11',350,500],['2020-11-11',350,500]];
  for(const [birthday,min,max] of cases){const r=milkReference(birthday,'formula',now);assert.equal(r.min,min,birthday);assert.equal(r.max,max,birthday);}
  for(const birthday of [undefined,'2026-02-30','2026-11-12','2019-11-11'])assert.equal(milkReference(birthday,'formula',now).min,null);
  assert.equal(milkReference('2026-10-30','breast',now).min,null);
  assert.equal(milkReference('2026-10-30','mixed',now).min,null);
  assert.equal(milkReference('2026-04-11','breast',now).min,500);
  assert.equal(completedMonths('2026-01-31',new Date(2026,1,28,12)),1);
  assert.equal(completedMonths('2024-02-29',new Date(2025,1,28,12)),12);
  assert.match(nutritionPdfUrl,/^https:\/\/wsjkw\.sh\.gov\.cn\/.*\.pdf$/);
});

test('今日状态区分低于、范围内、超出和不适用，不把超量标为达标',()=>{
  const reference={min:500,max:750};
  assert.equal(milkStatus(499,reference).label,'今日暂未达标');
  assert.equal(milkStatus(500,reference).label,'今日达标');
  assert.equal(milkStatus(750,reference).label,'今日达标');
  assert.equal(milkStatus(751,reference).label,'今日超出参考量');
  assert.equal(milkStatus(600,{min:null,max:null}).label,'暂不判断达标');
  assert.equal(milkStatus(600,reference,{directCount:1}).label,'亲喂未计量');
  assert.equal(milkStatus(600,reference,{period:'rolling'}).label,'24小时达标');
  assert.equal(milkStatus(400,reference,{period:'rolling'}).label,'24小时未达标');
  assert.equal(milkStatus(800,reference,{period:'rolling'}).label,'24小时超出参考量');
});
