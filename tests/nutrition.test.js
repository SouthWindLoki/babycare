import { test } from 'node:test';
import assert from 'node:assert/strict';
import { completedMonths, milkReference, milkStatus, nutritionPdfUrl } from '../public/nutrition.js';

test('国家卫健委指南按评估月龄节点取奶量参考，缺资料不判断',()=>{
  const now=new Date(2026,10,11,12);
  const cases=[['2026-11-11',600,700],['2026-10-12',600,700],['2026-10-11',600,700],['2026-08-11',800,900],['2026-05-11',800,1000],['2026-03-11',700,800],['2025-11-11',600,700],['2025-05-11',400,600],['2024-11-11',400,600]];
  for(const [birthday,min,max] of cases){const r=milkReference(birthday,'formula',now);assert.equal(r.min,min,birthday);assert.equal(r.max,max,birthday);}
  for(const birthday of [undefined,'2026-02-30','2026-11-12','2024-10-11'])assert.equal(milkReference(birthday,'formula',now).min,null);
  assert.equal(milkReference('2026-10-30','breast',now).min,null);
  assert.equal(milkReference('2026-10-30','mixed',now).min,600);
  assert.match(milkReference('2026-10-30','formula',now).reason,/不是指南对出生起的统一要求/);
  assert.equal(milkReference('2025-11-11','breast',now).min,null);
  assert.equal(completedMonths('2026-01-31',new Date(2026,1,28,12)),1);
  assert.equal(completedMonths('2024-02-29',new Date(2025,1,28,12)),12);
  assert.match(nutritionPdfUrl,/^https:\/\/www\.nhc\.gov\.cn\/fys\/c100078\/202502\//);
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
