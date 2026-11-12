import { $, api, localInputValue } from '/shared.js';
import { setupCommonMedicines } from '/common-medicines.js';
const id=new URLSearchParams(location.search).get('id'),form=$('#medication-plan-form'),save=$('#save-medication-plan');
let selectedId=null,plansReady=false,medicinesReady=false,loadedPlan=null;
api('/api/baby').then(({baby})=>{if(baby.name)$('#brand-name').textContent=`${baby.name}日常`;}).catch(()=>{});
function updateSelected(medicines){const medicine=medicines.find(item=>item.id===selectedId);if(loadedPlan&&medicine?.id===loadedPlan.medicine_id&&medicine.unit!==loadedPlan.unit){$('#medication-plan-dose').value='';$('#medication-plan-error').textContent=`原计划为每次 ${loadedPlan.dose} ${loadedPlan.unit}，常用药品单位已变为${medicine.unit}，请重新核对并填写用量。`;}$('#selected-plan-medicine').textContent=medicine?`已选择：${medicine.name} · ${medicine.unit||'单位未配置，请在“添加常用药”中修改'}`:'请点选一种常用药品';$('#plan-dose-unit').textContent=medicine?.unit||'请配置单位';document.querySelectorAll('.medicine-tags .common-medicine-item').forEach((item,index)=>{item.querySelector('button').setAttribute('aria-pressed',String(medicines[index].id===selectedId));});}
const common=setupCommonMedicines(medicine=>{selectedId=medicine.id;updateSelected(common.getMedicines());});
document.addEventListener('common-medicines-updated',event=>{medicinesReady=true;updateSelected(event.detail);save.disabled=!plansReady;});
const toggleMode=()=>{const interval=form.querySelector('[name=scheduleMode]:checked').value==='interval';$('#medication-interval-field').hidden=!interval;$('#medication-plan-interval').disabled=!interval;$('#medication-plan-interval').required=interval;$('#medication-mode-help').textContent=interval?'首次按所填时间参考，之后按该药品最近一次用药记录加上间隔计算。':'以后每天按首次参考时间中的时刻显示；当天已记录后，参考时间顺延至明天。';};
form.addEventListener('change',toggleMode);
$('#medication-plan-start').value=localInputValue();
async function load(){try{if(id){const {plans}=await api('/api/medication-plans');const plan=plans.find(item=>item.id===Number(id));if(!plan)throw new Error('用药计划不存在，请返回列表');loadedPlan=plan;selectedId=plan.medicine_id;$('#plan-title').textContent='修改用药计划';$('#medication-plan-dose').value=plan.dose;form.querySelector(`[name=scheduleMode][value=${plan.mode}]`).checked=true;$('#medication-plan-start').value=localInputValue(new Date(plan.start_at));$('#medication-plan-interval').value=plan.interval_hours||24;$('#medication-plan-enabled').checked=plan.enabled;updateSelected(common.getMedicines());toggleMode();}plansReady=true;save.disabled=!medicinesReady;}catch(error){$('#medication-plan-error').textContent=error.message;}}
load();
form.addEventListener('submit',async event=>{
 event.preventDefault();const medicine=common.getMedicines().find(item=>item.id===selectedId);
 if(!medicine?.unit){$('#medication-plan-error').textContent='请选择一种药品，并先为它填写计量单位。';return;}
 const start=new Date($('#medication-plan-start').value),mode=form.querySelector('[name=scheduleMode]:checked').value;
 save.disabled=true;$('#medication-plan-error').textContent='正在保存…';
 try{await api(id?`/api/medication-plans/${id}`:'/api/medication-plans',{method:id?'PUT':'POST',body:JSON.stringify({medicineId:selectedId,dose:$('#medication-plan-dose').value,mode,startAt:start.toISOString(),dailyTime:$('#medication-plan-start').value.slice(11,16),timezoneOffset:start.getTimezoneOffset(),intervalHours:Number($('#medication-plan-interval').value),enabled:$('#medication-plan-enabled').checked})});location.href='/baby.html?saved=medication-plan';}
 catch(error){$('#medication-plan-error').textContent=error.message;}finally{save.disabled=false;}
});
