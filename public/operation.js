import { setupCommonMedicines } from '/common-medicines.js';
import { feedingMethodLabels, feedingMethodIcons } from '/feeding-options.js';
import { $, api, localInputValue, showToast, setupFormValidation } from '/shared.js';
const kind=document.body.dataset.operation;
const form=$('#operation-form'), button=form.querySelector('button[type="submit"]'), message=$('#operation-message');
setupFormValidation(form, message);
let photoData=null, photoBusy=false, photoGeneration=0;
if ($('#event-time')) $('#event-time').value=localInputValue();
api('/api/baby').then(({baby})=>{ if (baby?.name) { $('#brand-name').textContent=`${baby.name}日常`; document.title=`${document.querySelector('h1').textContent} · ${baby.name}日常`; } }).catch(()=>{});
if (kind==='feeding') {
  const slider=$('#amount-ml'); const output=$('#amount-output');
  const updateAmount=()=>{ output.textContent=`${slider.value} 毫升`; const percent=((Number(slider.value)-10)/(300-10))*100; slider.style.background=`linear-gradient(90deg,var(--coral) ${percent}%,#eadfd7 ${percent}%,#eadfd7 100%)`; };
  updateAmount(); slider.addEventListener('input',updateAmount);
  const methodOptions=$('#feeding-method-options');
  function updateFeedingMethod(){
    const direct=form.querySelector('[name="feedingMethod"]:checked')?.value==='direct';
    $('#feeding-amount-field').hidden=direct;slider.disabled=direct;slider.required=!direct;$('#direct-feeding-note').hidden=!direct;
  }
  $('#feeding-methods').addEventListener('change',updateFeedingMethod);
  button.disabled=true;
  api('/api/settings').then(settings=>{
    slider.value=Math.min(300,Math.max(10,settings.amountMl));updateAmount();
    let methods=settings.feedingType==='formula'?['formula']:settings.feedingType==='breast'?[settings.breastMethod==='bottle'?'breast_bottle':'direct']:[settings.breastMethod==='bottle'?'breast_bottle':'direct',settings.breastMethod==='bottle'?'direct':'breast_bottle','formula'];
    methodOptions.innerHTML=methods.map((method,index)=>`<label class="symptom-option feeding-method-option"><input type="radio" name="feedingMethod" value="${method}" ${index===0?'checked':''} required><span class="feeding-method-icon" aria-hidden="true">${feedingMethodIcons[method]}</span><span>${feedingMethodLabels[method]}</span></label>`).join('');
    const mode=settings.feedingType==='mixed'?'混合喂养':settings.feedingType==='breast'?'母乳喂养':`奶粉 · ${settings.formulaBrand||'未配置'}`;
    $('#feeding-plan-note').textContent=`当前计划：${mode}，参考间隔 ${settings.intervalHours} 小时`;
    updateFeedingMethod();button.disabled=false;
  }).catch(error=>{$('#feeding-plan-note').textContent=error.message+'，请刷新后记录';});
}
if (kind==='weight') {
  const date=$('#measured-on'); date.value=localInputValue().slice(0,10); date.max=date.value;
  let weights=[];
  function fillWeight() {
    const existing=weights.find(w=>w.measured_on===date.value);
    $('#weight-grams').value=existing ? existing.weight_grams : '';
    $('#jin-preview').textContent=existing ? `相当于 ${(existing.weight_grams/500).toFixed(2)} 斤` : '例如：3500 克相当于 7.00 斤';
    $('#weight-notice').textContent=existing?'这一天已经称过体重，保存后会更新原记录。':'同一天再次保存，会更新当天的体重。';
    button.textContent=existing?'更新这一天的体重':'保存体重';
  }
  button.disabled=true; message.textContent='正在读取当天记录…';
  api('/api/weights').then(data=>{weights=data.weights;fillWeight();message.textContent='';button.disabled=false;}).catch(error=>{message.textContent=error.message+'，请刷新页面重试';});
  date.addEventListener('change',fillWeight);
  $('#weight-grams').addEventListener('input',()=>{
    const grams=Number($('#weight-grams').value);
    $('#jin-preview').textContent=grams>=100 ? `相当于 ${(grams/500).toFixed(2)} 斤` : '请输入秤上显示的克数';
  });
}
if (kind==='length') {
  const date=$('#length-measured-on'); date.value=localInputValue().slice(0,10); date.max=date.value;
  let lengths=[];
  function fillLength() {
    const existing=lengths.find(row=>row.measured_on===date.value);
    $('#length-cm').value=existing ? (existing.length_mm/10).toFixed(1) : '';
    $('#length-notice').textContent=existing?'这一天已经记过身长，保存后会更新原记录。':'同一天再次保存，会更新当天的身长。';
    button.textContent=existing?'更新这一天的身长':'保存身长';
  }
  button.disabled=true; message.textContent='正在读取当天记录…';
  api('/api/lengths').then(data=>{lengths=data.lengths;fillLength();message.textContent='';button.disabled=false;}).catch(error=>{message.textContent=error.message+'，请刷新页面重试';});
  date.addEventListener('change',fillLength);
}
async function preparePhoto(event) {
  const file=event.target.files[0]; if(!file)return;
  const generation=++photoGeneration;
  photoBusy=true; button.disabled=true; photoData=null; $('#photo-preview').hidden=true; message.textContent='正在准备照片…';
  const url=URL.createObjectURL(file);
  try {
    if (file.size>25_000_000) throw new Error('照片太大，请换一张较小的照片');
    const image=new Image();
    await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(new Error('无法读取这张照片，请重新拍照或换一张照片'));image.src=url;});
    const scale=Math.min(1,1600/Math.max(image.naturalWidth,image.naturalHeight));
    const canvas=document.createElement('canvas'); canvas.width=Math.max(1,Math.round(image.naturalWidth*scale)); canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
    const context=canvas.getContext('2d'); context.fillStyle='#ffffff'; context.fillRect(0,0,canvas.width,canvas.height); context.drawImage(image,0,0,canvas.width,canvas.height);
    const compressed=canvas.toDataURL('image/jpeg',0.82);
    if(compressed.length>2_600_000)throw new Error('处理后照片仍然过大，请换一张照片');
    if(generation!==photoGeneration)return;
    photoData=compressed; $('#selected-photo').src=photoData; $('#photo-preview').hidden=false; message.textContent='';
  } catch(error) {if(generation===photoGeneration)message.textContent=error.message;}
  finally {URL.revokeObjectURL(url);if(generation===photoGeneration){photoBusy=false;button.disabled=false;}}
}
if(kind==='stool'||kind==='medication') {$('#camera-photo').addEventListener('change',preparePhoto);$('#gallery-photo').addEventListener('change',preparePhoto);}
if(kind==='medication') {
  const items=$('#medicine-items');
  const addRow=(name='',unit='',medicineId=null)=>{const row=document.createElement('div');row.className='medicine-row';if(medicineId)row.dataset.medicineId=medicineId;row.innerHTML=`<label>药品名称<input name="medicineName" type="text" maxlength="50" placeholder="填写药品名称" aria-label="药品名称" required></label><label>剂量（选填）<span class="medicine-dose-fields"><input name="medicineDose" type="text" inputmode="decimal" maxlength="50" placeholder="实际用量" aria-label="剂量（选填）"><input name="medicineUnit" type="text" maxlength="12" placeholder="单位" aria-label="计量单位"></span></label><button type="button" class="remove-medicine" aria-label="删除这项药品">移除</button>`;row.querySelector('[name="medicineName"]').value=name;row.querySelector('[name="medicineUnit"]').value=unit;row.querySelector('[name="medicineName"]').addEventListener('input',()=>{row.querySelector('[name="medicineUnit"]').value='';delete row.dataset.medicineId;});items.append(row);return row;};
  addRow();
  $('#add-medicine').addEventListener('click',()=>addRow());
  setupCommonMedicines(medicine=>{const empty=[...items.querySelectorAll('[name="medicineName"]')].find(input=>!input.value.trim());if(empty){empty.value=medicine.name;empty.closest('.medicine-row').dataset.medicineId=medicine.id;empty.closest('.medicine-row').querySelector('[name="medicineUnit"]').value=medicine.unit;}else addRow(medicine.name,medicine.unit,medicine.id);});
  const planId=new URLSearchParams(location.search).get('plan');
  if(planId){button.disabled=true;api('/api/medication-plans').then(({plans})=>{const plan=plans.find(item=>item.id===Number(planId)&&item.enabled);if(!plan)throw new Error('用药计划未启用，请核对后手动填写');items.replaceChildren();const row=addRow(plan.name,plan.unit,plan.medicine_id);row.querySelector('[name="medicineDose"]').value=plan.dose;}).catch(error=>{message.textContent=error.message;}).finally(()=>{button.disabled=false;});}
  items.addEventListener('click',event=>{const remove=event.target.closest('.remove-medicine');if(!remove)return;const rows=items.querySelectorAll('.medicine-row');if(rows.length===1){rows[0].querySelector('[name="medicineName"]').value='';rows[0].querySelector('[name="medicineDose"]').value='';rows[0].querySelector('[name="medicineUnit"]').value='';delete rows[0].dataset.medicineId;}else remove.closest('.medicine-row').remove();});
}
form.addEventListener('submit',async event=>{
  event.preventDefault(); if(photoBusy)return;
  const data=new FormData(form); let path, method, payload;
  if(kind==='feeding'){path='/api/records';method='POST';payload={fedAt:new Date(data.get('occurredAt')).toISOString(),feedingMethod:data.get('feedingMethod'),amountMl:data.get('feedingMethod')==='direct'?null:Number(data.get('amountMl')),note:data.get('note')};}
  if(kind==='weight'){path='/api/weights';method='PUT';payload={measuredOn:data.get('measuredOn'),weightGrams:Number(data.get('weightGrams'))};}
  if(kind==='length'){path='/api/lengths';method='PUT';payload={measuredOn:data.get('measuredOn'),lengthCm:Number(data.get('lengthCm'))};}
  if(kind==='stool'){path='/api/stools';method='POST';payload={occurredAt:new Date(data.get('occurredAt')).toISOString(),note:data.get('note'),photo:photoData};}
  if(kind==='diaper'){path='/api/diapers';method='POST';payload={occurredAt:new Date(data.get('occurredAt')).toISOString(),note:data.get('note')};}
  if(kind==='medication'){path='/api/medications';method='POST';payload={occurredAt:new Date(data.get('occurredAt')).toISOString(),medicines:[...form.querySelectorAll('.medicine-row')].map(row=>({name:row.querySelector('[name="medicineName"]').value,dose:row.querySelector('[name="medicineDose"]').value,unit:row.querySelector('[name="medicineUnit"]').value,...(row.dataset.medicineId?{medicineId:Number(row.dataset.medicineId)}:{})})),note:data.get('note'),photo:photoData};}
  button.disabled=true;message.textContent='正在保存，请稍等…';
  try {await api(path,{method,body:JSON.stringify(payload)});location.href=`/?saved=${kind}`;}
  catch(error){message.textContent=error.message;showToast(error.message);button.disabled=false;}
});
