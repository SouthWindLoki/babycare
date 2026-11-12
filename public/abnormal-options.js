export const abnormalCategories = [
  {id:'vomiting', label:'呕吐／腹胀', icon:'🤢', symptoms:['喝奶后吐','喷射样呕吐','肚子明显胀'], legacySymptoms:['反复呕吐','吐出绿色液体','肚子明显胀且伴呕吐'], urgent:['喷射样呕吐','肚子明显胀'], extra:'vomiting'},
  {id:'temperature', label:'体温', icon:'🌡️', symptoms:['体温偏高','体温偏低'], extra:'temperature'},
  {id:'jaundice', label:'黄疸变化', icon:'👶', symptoms:['首次发现发黄','比之前更黄','发黄范围扩大'], extra:'jaundice', urgent:['发黄范围扩大']},
  {id:'skin', label:'皮肤与肚脐', icon:'🩹', symptoms:['起疹子','皮疹范围扩大','皮肤破损','起脓疱','肚脐周围红肿','肚脐渗液','肚脐流脓','肚脐有异味'], legacySymptoms:['新出现的皮疹','皮肤破溃','肚脐有渗液或脓'], extra:'skin'},
  {id:'eyes', label:'眼睛与口腔', icon:'👀', symptoms:['眼睛发红','眼皮肿','眼部分泌物增多','持续流泪','口腔有白斑','口腔破溃'], legacySymptoms:['眼睛红肿','眼部分泌物明显增多','口腔出现白斑'], extra:'eyes'},
  {id:'activity', label:'精神与活动', icon:'🧸', symptoms:['明显难叫醒','反应比平时弱','活动明显减少','哭声变弱','持续哭闹难安抚','出现异常抽动'], legacySymptoms:['反应变弱'], extra:'activity', urgent:['明显难叫醒','反应比平时弱','活动明显减少','哭声变弱','出现异常抽动']},
  {id:'breathing', label:'呼吸与肤色', icon:'🫁', symptoms:['新出现咳嗽','呼吸明显费力','呼吸时鼻翼扇动','吸气时肋骨间凹进去','呼吸时有呻吟声','发现呼吸暂停','嘴唇发青','脸色明显发灰'], legacySymptoms:['呼吸费力','呼吸时有呻吟声'], extra:'breathing', urgent:['呼吸明显费力','呼吸时鼻翼扇动','吸气时肋骨间凹进去','呼吸时有呻吟声','发现呼吸暂停','嘴唇发青','脸色明显发灰']},
  {id:'other', label:'其他', icon:'📝', symptoms:[], extra:'other'}
];

export function abnormalDetails(observations) {
  return observations.map(item=>{
    const category=abnormalCategories.find(category=>category.id===item.category);
    let detail=item.symptoms.join('、');
    if(item.category==='vomiting') detail+=`${item.vomitingAppearance?' · 呕吐物：'+item.vomitingAppearance:''}${item.occurrenceCount?' · 发生次数：'+item.occurrenceCount+' 次':''}${item.minutesSinceFeeding!==undefined?' · 距上次喂奶：'+item.minutesSinceFeeding+' 分钟':''}`;
    if(item.category==='temperature') detail+=` · ${Number(item.temperatureC).toFixed(1)} °C · 测量部位：${item.measurementSite}`;
    if(item.category==='jaundice') detail+=`${item.jaundiceSites?.length?' · 部位：'+item.jaundiceSites.join('、'):''}${item.discoveredAt?' · 发现于：'+item.discoveredAt.replace('T',' '):''}${item.bilirubinValue!==undefined?' · 数值：'+Number(item.bilirubinValue).toFixed(1)+' '+(item.bilirubinUnit==='umol'?'微摩尔/升':'毫克/分升'):''}${item.phototherapy!==undefined?' · '+(item.phototherapy?'已照蓝光':'未照蓝光'):''}`;
    if(item.category==='skin') detail+=`${item.bodyPart?' · 部位：'+item.bodyPart:''}`;
    if(item.category==='eyes') detail+=`${item.eyeSide?' · '+item.eyeSide:''}${item.mouthLocation?' · 位置：'+item.mouthLocation:''}`;
    if(item.category==='activity') detail+=`${item.durationMinutes!==undefined?' · 持续：'+item.durationMinutes+' 分钟':''}${item.occurrenceCount?' · 发生次数：'+item.occurrenceCount+' 次':''}`;
    if(item.category==='breathing') detail+=`${item.breathingState?' · 当时：'+item.breathingState:''}${item.durationMinutes!==undefined?' · 持续：'+item.durationMinutes+' 分钟':''}`;
    if(item.category==='other') detail=item.description;
    return `${category.label}：${detail}`;
  });
}
