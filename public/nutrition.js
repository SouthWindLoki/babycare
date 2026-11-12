// 上海市卫健委，2019 年：人工喂养「奶量估计」、表 2、学龄前儿童膳食指导。
export const nutritionPdfUrl='https://wsjkw.sh.gov.cn/cmsres/3b/3bfc6a0d7ba246099e19bc8266491b5a/0ab6f390a2f617b0ed38efffb43f9cc7.pdf';

export function completedMonths(birthday, now=new Date()) {
  if(typeof birthday!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(birthday))return null;
  const [year,month,day]=birthday.split('-').map(Number);
  const birth=new Date(year,month-1,day);
  if(birth.getFullYear()!==year||birth.getMonth()!==month-1||birth.getDate()!==day||birth>now)return null;
  let months=(now.getFullYear()-year)*12+now.getMonth()-(month-1);
  const anniversary=new Date(now.getFullYear(),now.getMonth(),Math.min(day,new Date(now.getFullYear(),now.getMonth()+1,0).getDate()));
  if(now<anniversary)months--;
  return months;
}

export function milkReference(birthday, feedingType, now=new Date()) {
  const months=completedMonths(birthday,now);
  if(months===null)return {min:null,max:null,stage:'未配置生日',reason:'请先配置宝宝生日，再显示月龄参考量。'};
  if(months<7&&feedingType!=='formula')return {min:null,max:null,stage:feedingType==='mixed'?'混合喂养':'母乳喂养',reason:'本月龄奶量参考适用于配方奶作为主要营养来源的人工喂养；母乳或混合喂养不套用配方奶数值判断达标。',page:'正文第 4、9、13 页'};
  if(months<4)return {min:500,max:750,stage:'0～3 月龄 · 配方奶',page:'正文第 13 页',reason:months===0?'足月新生儿奶量逐步增加，不能把此范围当作出生起就必须达到的量。':'配方奶为主要营养来源时的一般估计量。'};
  if(months<7)return {min:800,max:1000,stage:'4～6 月龄 · 配方奶',page:'正文第 8、13 页',reason:'配方奶为主要营养来源时的一般估计量。'};
  if(months<13)return {min:500,max:700,stage:'7～12 月龄 · 奶类',page:'正文第 8～10 页',reason:'结合辅食安排，比较的是已记录的奶类总量。'};
  if(months<24)return {min:400,max:600,stage:'13～23 月龄 · 奶类',page:'正文第 8、10 页',reason:'原文 13～24 月龄约 400～600 毫升；满 2 岁后采用学龄前儿童章节。'};
  if(months<84)return {min:350,max:500,stage:'2～6 岁 · 奶及奶制品',page:'正文第 14、16 页',reason:'包含相当量奶制品；未记录的酸奶、奶酪等不会计入，状态仅反映此处奶量记录。'};
  return {min:null,max:null,stage:'超出规范年龄范围',reason:'本规范适用于 0～6 岁，不生成此年龄的参考量。'};
}

export function milkStatus(amount,reference,{period='today',directCount=0}={}) {
  if(directCount>0)return {level:'unknown',label:'亲喂未计量'};
  if(reference.min===null)return {level:'unknown',label:'暂不判断达标'};
  const prefix=period==='rolling'?'24小时':'今日';
  if(amount<reference.min)return {level:'pending',label:period==='rolling'?'24小时未达标':'今日暂未达标'};
  if(amount>reference.max)return {level:'above',label:`${prefix}超出参考量`};
  return {level:'within',label:`${prefix}达标`};
}
