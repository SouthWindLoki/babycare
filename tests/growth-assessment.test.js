import test from 'node:test';
import assert from 'node:assert/strict';
import { assessmentTables } from '../public/growth-assessment-data.js';
import { growthStandard, weightStandard } from '../public/growth-standard-data.js';
import { growthLevel, nutritionFinding, measurementAgeMonths, assessmentThresholds, chartReferenceForDate, assessMeasurement, assessGrowth, percentilePosition, growthPercentilePoints } from '../public/growth-assessment.js';

test('趋势与首页在同一测量日使用相同官方范围，未满下一个月不插值',()=>{
  const at=(date,kind='weight',sex='male',birth='2026-01-01')=>chartReferenceForDate(sex,birth,date,kind);
  for(const [date,month] of [['2026-01-01',0],['2026-02-01',1],['2028-01-01',24],['2032-10-01',81]]) {
    const point=at(date),row=assessmentThresholds('male',month,'weight');
    assert.deepEqual(point,{low:row[0],median:row[3],high:row[6],month});
  }
  const start=at('2026-01-01'),middle=at('2026-01-16'),end=at('2026-02-01');
  assert.deepEqual(middle,start);assert.notDeepEqual(middle,end);
  assert.notEqual(middle.low,at('2026-01-16','weight','female').low);
  assert.deepEqual(at('2026-01-16','weight','female'),{low:2.7,median:3.3,high:4.1,month:0});
  assert.deepEqual(at('2026-01-16','length','female'),{low:46.8,median:50.3,high:53.8,month:0});
  assert.deepEqual(at('2026-02-01','weight','female'),{low:3.5,median:4.3,high:5.3,month:1});
  assert.equal(at('2026-01-16','weight',''),null);assert.equal(at('2026-01-16','weight','male',''),null);
  assert.equal(at('2025-12-31'),null);assert.equal(at('2032-11-01'),null);
  assert.deepEqual(at('2032-10-02'),at('2032-10-01'));
  assert.equal(at('2028-02-01'),null); // 官方表无25月行，不借用24月或27月。
  // 两岁切换量法时使用各自的官方表行。
  assert.deepEqual(at('2027-12-15','length'),at('2027-12-01','length'));
  assert.notDeepEqual(at('2028-01-01','length'),at('2027-12-01','length'));
  assert.equal(at('2026-02-28','weight','male','2026-01-31').month,1);
  assert.equal(assessMeasurement(baby,weight(3500,'2026-01-16'),'weight').month,0);
});

test('男女体重与身长，全部月龄及半月日期的趋势范围和首页逐项一致',()=>{
  for(const sex of ['male','female'])for(const indicator of ['weight','length'])for(let month=0;month<84;month++)for(const day of [1,15,28]) {
    const date=new Date(Date.UTC(2020,month,day)).toISOString().slice(0,10);
    const reference=chartReferenceForDate(sex,'2020-01-01',date,indicator);
    const row=indicator==='weight'?{measured_on:date,weight_grams:10000}:{measured_on:date,length_mm:900};
    const assessment=assessMeasurement({sex,birthday:'2020-01-01'},row,indicator);
    assert.equal(Boolean(reference),assessment.available,`${sex}/${indicator}/${date}`);
    if(reference)assert.deepEqual([reference.low,reference.high,reference.month],[assessment.low,assessment.high,assessment.month]);
  }
});

const baby = { birthday: '2026-01-01', sex: 'male' };
const weight = (grams, day='2026-01-10') => ({ weight_grams: grams, measured_on: day });
const length = (mm, day='2026-01-10') => ({ length_mm: mm, measured_on: day });

test('百分位尺标出全部官方节点，只在相邻节点内估算，极端数值不外推',()=>{
  assert.deepEqual(growthPercentilePoints,[3,10,25,50,75,90,97]);
  for(const [key,rows] of Object.entries(assessmentTables).filter(([key])=>key.startsWith('A.'))){
    for(const t of Object.values(rows)){
      assert.deepEqual(percentilePosition(t[0]-0.1,t),{kind:'below',percentile:3,marker:2});
      assert.deepEqual(percentilePosition(t[6]+100,t),{kind:'above',percentile:97,marker:98});
      for(const [index,value] of t.entries()){
        const result=percentilePosition(value,t);
        assert.equal(result.kind,'table');assert.equal(result.percentile,growthPercentilePoints[index]);
        assert.equal(result.marker,10+index*80/6);
      }
      for(let index=0;index<6;index++){
        let previous=percentilePosition(t[index],t).marker;
        for(const fraction of [0.1,0.5,0.9]){
          const result=percentilePosition(t[index]+(t[index+1]-t[index])*fraction,t);
          assert.equal(result.kind,'estimate',key);
          assert.deepEqual([result.lower,result.upper],[growthPercentilePoints[index],growthPercentilePoints[index+1]]);
          assert(result.percentile>=result.lower&&result.percentile<=result.upper);
          assert(result.marker>previous&&result.marker<10+(index+1)*80/6);previous=result.marker;
        }
      }
    }
  }
  for(const value of [NaN,Infinity,0,-1])assert.equal(percentilePosition(value,assessmentTables['A.1'][0]),null);
  assert.equal(percentilePosition(3,[]),null);
});

test('首页百分位位置使用该宝宝性别和测量时月龄，数值估算不改变原有等级或参考边界',()=>{
  const result=assessMeasurement(baby,weight(3620),'weight');
  assert.equal(result.percentile.kind,'estimate');assert.equal(result.percentile.percentile,65);
  assert.equal(result.level,'中');assert.equal(result.low,2.8);assert.equal(result.high,4.2);
  const changedSex=assessMeasurement({...baby,sex:'female'},weight(3620),'weight');
  assert.notEqual(changedSex.percentile.percentile,result.percentile.percentile);
  const changedAge=assessMeasurement(baby,weight(3620,'2026-02-01'),'weight');
  assert.equal(changedAge.percentile.kind,'below');
  assert.equal(assessMeasurement(baby,weight(3620),'weight','sd').percentile,null);
});

test('12张官方表的528行数据完整、递增，与已有百分位数据逐行一致', () => {
  assert.equal(Object.keys(assessmentTables).length, 12);
  const months = [...Array(25).keys(), ...Array.from({length:19}, (_, i) => 27+i*3)];
  for (const rows of Object.values(assessmentTables)) {
    assert.deepEqual(Object.keys(rows).map(Number), months);
    for (const values of Object.values(rows)) {
      assert.equal(values.length, 7);
      assert(values.every((value, index) => value > 0 && (index === 0 || value > values[index-1])));
    }
  }
  for (const [sex, offset] of [['male',0],['female',1]]) {
    for (const [data, number] of [[weightStandard,1],[growthStandard,3]]) {
      for (const point of data[sex]) {
        const row=assessmentTables[`A.${number+offset}`][point.month];
        assert.deepEqual([row[0],row[3],row[6]],[point.p3,point.p50,point.p97]);
      }
    }
  }
  assert.deepEqual(assessmentTables['B.1'][0],[2.4,2.7,3.1,3.5,3.9,4.3,4.7]);
  assert.deepEqual(assessmentTables['B.9'][0],[10.2,11.1,12.1,13.2,14.4,15.7,17.1]);
  assert.deepEqual(assessmentTables['B.10'][0],[10,10.9,12,13.1,14.2,15.4,16.7]);
});

test('4.1与4.2的所有官方分界值：等于、略低、略高；两种方法不混用', () => {
  for (const [key, rows] of Object.entries(assessmentTables)) {
    const method=key.startsWith('A')?'percentile':'sd';
    for (const values of Object.values(rows)) {
      const cuts=method==='sd'?[values[1],values[2],values[4],values[5]]:[values[0],values[2],values[4],values[6]];
      const labels=['下','中下','中','中上','上'];
      cuts.forEach((cut,index)=>{
        assert.equal(growthLevel(cut-1e-7,values,method),labels[index]);
        assert.equal(growthLevel(cut,values,method),labels[index+1]);
        assert.equal(growthLevel(cut+1e-7,values,method),labels[index+1]);
      });
    }
  }
  assert.equal(assessMeasurement(baby,weight(3750),'weight','percentile').level,'中上');
  assert.equal(assessMeasurement(baby,weight(3750),'weight','sd').level,'中');
});

test('4.3全部标准差表的低体重、生长迟缓、胖瘦边界，严格区分等号', () => {
  for (const [key, rows] of Object.entries(assessmentTables).filter(([key])=>key.startsWith('B'))) {
    const indicator=Number(key.split('.')[1])<=2?'weight':Number(key.split('.')[1])<=4?'length':'bmi';
    for (const t of Object.values(rows)) {
      if(indicator==='bmi') {
        for(const kind of ['bmi','weightForLength']) {
          for(const [value,expected] of [[t[0]-1e-7,'重度消瘦'],[t[0],'消瘦'],[t[1]-1e-7,'消瘦'],[t[1],null],[t[4]-1e-7,null],[t[4],'超重'],[t[5]-1e-7,'超重'],[t[5],'肥胖'],[t[6]-1e-7,'肥胖'],[t[6],'重度肥胖'],[t[6]+1,'重度肥胖']]) assert.equal(nutritionFinding(value,t,kind,'sd'),expected);
        }
      } else {
        const low=indicator==='weight'?'低体重':'生长迟缓';
        for(const [value,expected] of [[t[0]-1e-7,`重度${low}`],[t[0],low],[t[1]-1e-7,low],[t[1],null],[t[6]+10,null]]) assert.equal(nutritionFinding(value,t,indicator,'sd'),expected);
      }
    }
  }
});

test('月龄按测量日而非今天，兼容月末、闰年和两岁分界', () => {
  assert.equal(measurementAgeMonths('2026-01-31','2026-02-27'),0);
  assert.equal(measurementAgeMonths('2026-01-31','2026-02-28'),1);
  assert.equal(measurementAgeMonths('2024-02-29','2026-02-28'),24);
  assert.equal(measurementAgeMonths('2026-01-01','2025-12-31'),null);
  assert.equal(measurementAgeMonths('2026-02-30','2026-03-10'),null);
  assert.equal(assessMeasurement(baby,weight(3500),'weight').month,0);
  assert.equal(assessMeasurement(baby,weight(3500),'weight').level,'中');
  assert.notDeepEqual(assessmentThresholds('male',23,'length'),assessmentThresholds('male',24,'length'));
  assert.equal(assessGrowth(baby,[weight(12600,'2028-01-01')],[length(882,'2028-01-01')]).nutrition.hint.includes('站着'),true);
});

test('不把同龄体重“上”当肥胖；同时保留多种营养异常', () => {
  const result=assessGrowth(baby,[weight(4700)],[length(580)]);
  assert.equal(result.weight.level,'上');
  assert.deepEqual(result.nutrition.findings,[]);
  assert.equal(result.nutrition.complete,true);
  const abnormal=assessGrowth(baby,[weight(2000)],[length(400)]);
  assert(abnormal.nutrition.findings.includes('体重偏低'));
  assert(abnormal.nutrition.findings.includes('身长偏低'));
});

test('BMI用未舍入的整数测量值判断，恰好到达边界不能偏一档', () => {
  for(const [grams,label] of [[2799,'偏瘦'],[2800,null],[3874,null],[3875,'偏胖'],[4275,'偏胖']]) {
    const result=assessGrowth(baby,[weight(grams)],[length(500)]).nutrition;
    const findings=result.findings.filter(value=>!value.includes('体重偏低'));
    assert.deepEqual(findings,label?[label]:[]);
  }
});

test('缺性别、生日、测量记录、标准月龄时不输出完整正常结论', () => {
  for(const profile of [{}, {...baby,sex:''}, {...baby,birthday:''}]) {
    const result=assessGrowth(profile,[weight(3500)],[length(512)]);
    assert.equal(result.weight.available,false);
    assert.equal(result.nutrition.complete,false);
    assert.equal(result.nutrition.label,'暂不能完整评价');
  }
  const partial=assessGrowth(baby,[weight(2000)],[]).nutrition;
  assert.equal(partial.complete,false);
  assert.deepEqual(partial.findings,['体重偏低']);
  assert.match(partial.hint,/再记一次身长/);
  assert.match(assessGrowth(baby,[],[length(512)]).nutrition.hint,/再记一次体重/);
  for(const day of ['2028-02-01','2033-01-01']) {
    assert.equal(assessGrowth(baby,[weight(14000,day)],[length(900,day)]).nutrition.complete,false);
  }
  assert.equal(assessmentThresholds('male',25,'bmi'),null);
  assert.equal(assessmentThresholds('male',84,'weight'),null);
  assert.equal(growthLevel(NaN,assessmentTables['B.1'][0]),null);
  assert.equal(growthLevel(0,assessmentTables['B.1'][0]),null);
});

test('最近的体重与身长不要求同日，一周内直接估算，不提示日期差', () => {
  for (const lengthDay of ['2026-01-10','2026-01-09','2026-01-03']) {
    const result=assessGrowth(baby,[weight(3600)],[length(500,lengthDay)]).nutrition;
    assert.equal(result.complete,true);
    assert.equal(result.bmi,14.4);
    assert.deepEqual(result.findings,[]);
    assert.equal(result.lengthMeasuredOn,lengthDay);
    assert.equal(result.weightMeasuredOn,'2026-01-10');
    assert.doesNotMatch(result.hint,/相隔|不够准确|补记|同一/);
    assert.equal(result.label,'胖瘦适中');
  }
  assert.equal(assessGrowth(baby,[weight(3600)],[length(500,'2026-01-03')]).nutrition.gapDays,7);
});

test('相隔超过一周仍计算，用白话说明天数、不准确和建议更新较旧的测量', () => {
  const result=assessGrowth(baby,[weight(3500)],[length(512,'2026-01-02')]).nutrition;
  assert.equal(result.complete,true);
  assert.equal(result.gapDays,8);
  assert.equal(result.label,'胖瘦适中');
  assert.match(result.hint,/相隔 8 天.*可能不够准确.*重新量一下身长/);
  const reversed=assessGrowth(baby,[weight(3500,'2026-01-02')],[length(512)]).nutrition;
  assert.equal(reversed.complete,true);
  assert.match(reversed.hint,/相隔 8 天.*可能不够准确.*再称一次体重/);
  const abnormal=assessGrowth(baby,[weight(4275)],[length(500,'2026-01-02')]).nutrition;
  assert.equal(abnormal.label,'偏胖');
  assert.match(abnormal.hint,/相隔 8 天.*不够准确.*儿保医生/);
  assert.match(assessGrowth(baby,[weight(4700,'2026-02-20')],[length(512)]).nutrition.hint,/相隔 41 天/);
});

test('使用各自最近一次记录，不回退到旧配对；胖瘦按两次测量中较新的月龄查表', () => {
  const result=assessGrowth(baby,[weight(4000,'2026-02-02'),weight(3000)],[length(500)]).nutrition;
  assert.equal(result.complete,true);
  assert.equal(result.measuredOn,'2026-02-02');
  assert.equal(result.bmi,16);
  // 男童1月龄16低于P97的17.6；不能使用旧的0月龄P97的15.5。
  assert.deepEqual(result.findings,[]);
  const reversed=assessGrowth(baby,[weight(4000)],[length(500,'2026-02-02')]).nutrition;
  assert.equal(reversed.bmi,16);
  assert.equal(reversed.findings.includes('偏胖'),false);
});

test('跨月、跨年和闰年按日历天计算测量间隔', () => {
  const profile={birthday:'2023-01-01',sex:'male'};
  for(const [a,b,days] of [['2023-12-31','2024-01-07',7],['2024-02-28','2024-03-07',8]]) {
    assert.equal(assessGrowth(profile,[weight(10000,a)],[length(780,b)]).nutrition.gapDays,days);
  }
});

test('输入顺序不影响结果，不修改记录数组', () => {
  const rows=[weight(3500,'2026-01-09'),weight(3600)];
  const original=JSON.stringify(rows);
  assert.equal(assessGrowth(baby,rows,[length(500)]).weight.actual,3.6);
  assert.equal(JSON.stringify(rows),original);
});


test('页面默认百分位法，胖瘦参考只用P3/P97，全部官方行的等号与极端值',()=>{
 for(const sex of ['male','female'])for(const month of Object.keys(assessmentTables['A.9']).map(Number)) {
  for(const kind of ['weight','length','bmi']){
   const t=assessmentThresholds(sex,month,kind),index={weight:1,length:3,bmi:9}[kind]+(sex==='female'?1:0);
   assert.deepEqual(t,assessmentTables[`A.${index}`][month]);
   const low=kind==='weight'?'体重偏低':kind==='length'?'身长偏低':'偏瘦';
   assert.equal(nutritionFinding(t[0]-1e-7,t,kind),low);
   assert.equal(nutritionFinding(t[0],t,kind),null);
   assert.equal(nutritionFinding(t[6]-1e-7,t,kind),null);
   assert.equal(nutritionFinding(t[6],t,kind),kind==='bmi'?'偏胖':null);
   assert.equal(nutritionFinding(t[6]+100,t,kind),kind==='bmi'?'偏胖':null);
  }
 }
 const result=assessGrowth(baby,[weight(2000)],[length(400)]);
 assert.equal(result.weight.method,'percentile');assert.equal(result.nutrition.method,'percentile');
 assert.doesNotMatch(result.nutrition.label,/重度|肥胖|超重|消瘦|迟缓/);
 assert.equal(assessMeasurement(baby,weight(3750),'weight').level,'中上');
});
