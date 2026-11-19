// 国家卫生健康委员会，2025 年：《婴幼儿营养喂养评估服务指南（试行）》。
export const nutritionPdfUrl='https://www.nhc.gov.cn/fys/c100078/202502/19903ff647694f3a85ed6fe332380b34.shtml';

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

// 首页与参考资料页共用同一组评估节点；24月龄沿用18～24月龄节点。
export const feedingReferenceRows = [
  {
    "label": "未满月",
    "startMonth": 0,
    "endMonth": 1,
    "min": 600,
    "max": 700,
    "frequency": "每2～3小时一次（可按需喂养）",
    "source": "应用展示规则",
    "stage": "未满月 · 沿用满月参考",
    "reason": "应用将满月的每日 600～700 毫升作为未满月参考展示；这不是指南对出生起的统一要求，奶量应逐步增加，按宝宝需求调整。",
    "page": "正文第三部分（一）1（2）"
  },
  {
    "label": "满月",
    "startMonth": 1,
    "endMonth": 3,
    "min": 600,
    "max": 700,
    "frequency": "每2～3小时一次（可按需喂养）",
    "source": "国家指南满月节点",
    "stage": "满月参考 · 混合或人工喂养",
    "reason": "国家指南在满月节点给出每日约 600～700 毫升；每次量可以有波动，不要刻板要求。",
    "page": "正文第三部分（一）（2）"
  },
  {
    "label": "3月龄",
    "startMonth": 3,
    "endMonth": 6,
    "min": 800,
    "max": 900,
    "frequency": "每3～4小时一次（可按需喂养）",
    "source": "国家指南3月龄节点",
    "stage": "3月龄参考 · 混合或人工喂养",
    "reason": "国家指南在 3 月龄节点给出每日约 800～900 毫升；每次量可以有波动，不要刻板要求。",
    "page": "正文第三部分（一）（2）"
  },
  {
    "label": "6月龄",
    "startMonth": 6,
    "endMonth": 8,
    "min": 800,
    "max": 1000,
    "frequency": "每日约5～6次",
    "source": "国家指南6月龄节点",
    "stage": "6月龄参考 · 奶类",
    "reason": "国家指南给出每日 5～6 次、800～1000 毫升；6 月龄起还要同步关注辅食。",
    "page": "正文第三部分（二）（3）"
  },
  {
    "label": "8月龄",
    "startMonth": 8,
    "endMonth": 12,
    "min": 700,
    "max": 800,
    "frequency": "每日约4～5次",
    "source": "国家指南8月龄节点",
    "stage": "8月龄参考 · 奶类",
    "reason": "国家指南给出每日 4～5 次、700～800 毫升；同时关注辅食种类和频次。",
    "page": "正文第三部分（二）（3）"
  },
  {
    "label": "12月龄",
    "startMonth": 12,
    "endMonth": 18,
    "min": 600,
    "max": 700,
    "frequency": "每日约2～3次",
    "source": "国家指南12月龄节点",
    "stage": "12月龄参考 · 奶类",
    "reason": "国家指南给出每日 2～3 次、600～700 毫升；同时关注辅食种类和频次。",
    "page": "正文第三部分（二）（3）"
  },
  {
    "label": "18～24月龄",
    "startMonth": 18,
    "endMonth": 25,
    "min": 400,
    "max": 600,
    "frequency": "每日约2～3次",
    "source": "国家指南18～24月龄节点",
    "stage": "18～24月龄参考 · 奶类",
    "reason": "国家指南给出每日 2～3 次、400～600 毫升；还应保证三餐和两次加餐。",
    "page": "正文第三部分（二）（3）"
  },
  {
    "label": "24月龄以上",
    "startMonth": 25,
    "endMonth": null,
    "min": null,
    "max": null,
    "frequency": "按需饮奶",
    "source": "国家指南24月龄后",
    "stage": "24月龄以上 · 按需饮奶",
    "reason": "国家指南在 24 月龄后强调家庭膳食和每日饮奶，没有给出统一的固定毫升范围。",
    "page": "正文第三部分（三）"
  }
];

export function feedingReferenceForMonth(month) {
  if (!Number.isInteger(month) || month < 0) return null;
  return feedingReferenceRows.find(row => month >= row.startMonth && (row.endMonth === null || month < row.endMonth));
}

export function milkReference(birthday, feedingType, now=new Date()) {
  const months=completedMonths(birthday,now);
  if(months===null)return {min:null,max:null,stage:'未配置生日',reason:'请先配置宝宝生日，再显示月龄参考量。'};
  if(feedingType==='breast')return {min:null,max:null,stage:'母乳喂养 · 按需喂养',reason:'国家指南强调回应性喂养，母乳按宝宝需求进行，不把亲喂换算成毫升判断达标。',page:'正文第二部分'};
  const {min,max,stage,reason,page}=feedingReferenceForMonth(months);
  return {min,max,stage,reason,page};
}

export function milkStatus(amount,reference,{period='today',directCount=0}={}) {
  if(directCount>0)return {level:'unknown',label:'亲喂未计量'};
  if(reference.min===null)return {level:'unknown',label:'暂不判断达标'};
  const prefix=period==='rolling'?'24小时':'今日';
  if(amount<reference.min)return {level:'pending',label:period==='rolling'?'24小时未达标':'今日暂未达标'};
  if(amount>reference.max)return {level:'above',label:`${prefix}超出参考量`};
  return {level:'within',label:`${prefix}达标`};
}
