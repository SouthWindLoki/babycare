export const feedingMethodLabels={direct:'母乳亲喂',breast_bottle:'瓶喂母乳',formula:'奶粉',unknown:'喂法未记录'};
// Separate visual cues make direct feeding and bottle feeding easy to distinguish.
export const feedingMethodIcons={direct:'🤱',breast_bottle:'🍼',formula:'🍼',unknown:'🍼'};
export function planMethods(feedingType,breastMethod='direct') {
  const breast=breastMethod==='bottle'?'breast_bottle':'direct';
  return feedingType==='mixed'?[breast,'formula']:feedingType==='breast'?[breast]:['formula'];
}
export function feedingValue(row) {
  if(row.feeding_method==='direct')return '母乳亲喂 · 仅记时间';
  const amount=`${row.amount_ml} 毫升`;
  return row.feeding_method&&row.feeding_method!=='unknown'?`${feedingMethodLabels[row.feeding_method]} · ${amount}`:amount;
}
export function exportFeedingAmount(row) {
  return row.feeding_method==='direct'?'亲喂（未计量）':`${row.amount_ml} 毫升`;
}
export function getPlanFeedingType(id) {
  return document.getElementById(id).querySelector('input:checked').value;
}
export function setPlanFeedingType(id,value) {
  document.getElementById(id).querySelectorAll('input[type="radio"]').forEach(input=>{input.checked=input.value===value;});
}
export function updatePlanControls(ids) {
  const get=key=>document.getElementById(ids[key]);
  const type=getPlanFeedingType(ids.type),breast=type!=='formula',formula=type!=='breast';
  const directOnly=type==='breast'&&get('method').value==='direct';
  get('methodField').hidden=!breast;get('method').disabled=!breast;
  for(const field of ['brandField','stageField']) {
    get(field).hidden=!formula;
    get(field).querySelectorAll('input,select').forEach(input=>{input.disabled=!formula;});
  }
  get('amountField').hidden=directOnly;
  get('amountField').querySelector('input').disabled=directOnly;
  get('hint').textContent=directOnly?'母乳亲喂只记录时间，不设置毫升数。':'瓶喂默认奶量，每次滑动增加 10 毫升；记录时可按实际奶量调整。';
}
