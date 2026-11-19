import { setupCommonMedicines } from '/common-medicines.js';
import { feedingMethodLabels, feedingMethodIcons } from '/feeding-options.js';
import { setupNursingTimer, formatNursingDuration } from '/nursing-timer.js';
import { $, api, localInputValue, formatDate, formatTime, showToast, setupFormValidation } from '/shared.js';
import { loadEventEdit, eventTimestamp, setupExistingPhoto } from '/event-edit.js';
const kind=document.body.dataset.operation;
function completedMonths(birthday){const [year,month,day]=birthday.split('-').map(Number),now=new Date();let count=(now.getFullYear()-year)*12+now.getMonth()-(month-1);if(now.getDate()<Math.min(day,new Date(year,month,0).getDate()))count--;return count;}
const form=$('#operation-form'), button=form.querySelector('button[type="submit"]'), message=$('#operation-message');
setupFormValidation(form, message);
let photoData=null, photoBusy=false, photoGeneration=0;
let nursingTimer=null;
if ($('#event-time')) $('#event-time').value=localInputValue();
const edit=await loadEventEdit(kind,form);
if(!edit?.failed){
if(edit)photoData=undefined;
api('/api/baby').then(({baby})=>{ if (baby?.name) { $('#brand-name').textContent=`${baby.name}日常`; document.title=`${document.querySelector('h1').textContent} · ${baby.name}日常`; } if(!edit&&baby?.birthday){const months=completedMonths(baby.birthday);if(kind==='diaper'&&months>=12){form.hidden=true;message.textContent='宝宝已满12月龄，无需继续记录湿尿布观察。便便请使用“记便便”。';}if(kind==='stool'&&months>=2){form.hidden=true;message.textContent='宝宝已满2月龄，便便记录入口已收起；如有异常请记异常。';}} }).catch(()=>{});
if (kind==='feeding') {
  nursingTimer=setupNursingTimer(form,startedAt=>{if(!edit)$('#event-time').value=localInputValue(new Date(startedAt));},edit);
  api('/api/records').then(({summary})=>{
    const previous=summary?.latestDirect;
    if(!previous){$('#previous-nursing-note').textContent='还没有亲喂记录';return;}
    $('#previous-nursing-date').textContent=`${formatDate(previous.fed_at)} · ${formatTime(previous.fed_at)}`;
    if(previous.left_duration_seconds==null||previous.right_duration_seconds==null){$('#previous-nursing-note').textContent='上次未记录左右侧时长';return;}
    $('#previous-nursing-left').textContent=formatNursingDuration(previous.left_duration_seconds);
    $('#previous-nursing-right').textContent=formatNursingDuration(previous.right_duration_seconds);
    $('#previous-nursing-durations').hidden=false;$('#previous-nursing-note').hidden=true;
  }).catch(()=>{$('#previous-nursing-note').textContent='上次亲喂记录读取失败，请刷新页面重试';});
  const slider=$('#amount-ml'); const output=$('#amount-output');
  const updateAmount=()=>{ output.textContent=`${slider.value} 毫升`; const percent=((Number(slider.value)-Number(slider.min))/(Number(slider.max)-Number(slider.min)))*100; slider.style.background=`linear-gradient(90deg,var(--coral) ${percent}%,#eadfd7 ${percent}%,#eadfd7 100%)`; };
  updateAmount(); slider.addEventListener('input',updateAmount);
  const methodOptions=$('#feeding-method-options');
  function updateFeedingMethod(){
    const direct=form.querySelector('[name="feedingMethod"]:checked')?.value==='direct';
    $('#feeding-amount-field').hidden=direct;slider.disabled=direct;slider.required=!direct;$('#direct-feeding-note').hidden=!direct;
    nursingTimer.setVisible(direct);
  }
  $('#feeding-methods').addEventListener('change',updateFeedingMethod);
  button.disabled=true;
  api('/api/settings').then(settings=>{
    if(edit){
      const amount=edit.record.amount_ml??settings.amountMl,min=amount%10||10;
      slider.min=String(min);slider.max=String(Math.floor((Math.max(300,amount)-min)/10)*10+min);slider.step='10';
      $('#feeding-amount-field .field-hint').textContent='按原记录带出奶量，每次滑动增减 10 毫升。';
    }
    slider.value=edit?.record.amount_ml??Math.min(300,Math.max(10,settings.amountMl));updateAmount();
    let methods=settings.feedingType==='formula'?['formula']:settings.feedingType==='breast'?[settings.breastMethod==='bottle'?'breast_bottle':'direct']:[settings.breastMethod==='bottle'?'breast_bottle':'direct',settings.breastMethod==='bottle'?'direct':'breast_bottle','formula'];
    if(edit)methods=[...new Set([edit.record.feeding_method,'direct','breast_bottle','formula'])];
    methodOptions.innerHTML=methods.map((method,index)=>`<label class="symptom-option feeding-method-option"><input type="radio" name="feedingMethod" value="${method}" ${index===0?'checked':''} required><span class="feeding-method-icon" aria-hidden="true">${feedingMethodIcons[method]||'🍼'}</span><span>${feedingMethodLabels[method]||'原记录未区分喂法'}</span></label>`).join('');
    if(!edit&&nursingTimer.hasDraft&&methods.includes('direct')){form.querySelector('[name="feedingMethod"][value="direct"]').checked=true;if(nursingTimer.startedAt)$('#event-time').value=localInputValue(new Date(nursingTimer.startedAt));}
    const mode=settings.feedingType==='mixed'?'混合喂养':settings.feedingType==='breast'?'母乳喂养':`奶粉 · ${settings.formulaBrand||'未配置'}`;
    $('#feeding-plan-note').textContent=`当前计划：${mode}，参考间隔 ${settings.intervalHours} 小时`;
    updateFeedingMethod();button.disabled=false;
  }).catch(error=>{$('#feeding-plan-note').textContent=error.message+'，请刷新后记录';});
}
if (kind==='weight') {
  const date=$('#measured-on'); date.value=localInputValue().slice(0,10); date.max=date.value;
  let weights=[];
  function fillWeight() {
    if(edit){$('#weight-notice').textContent='修改日期不会覆盖其他记录；一天只保留一条体重。';button.textContent='保存修改';return;}
    const existing=weights.find(w=>w.measured_on===date.value);
    $('#weight-grams').value=existing ? existing.weight_grams : '';
    $('#jin-preview').textContent=existing ? `相当于 ${(existing.weight_grams/500).toFixed(2)} 斤` : '例如：3500 克相当于 7.00 斤';
    $('#weight-notice').textContent=existing?'这一天已经称过体重，保存后会更新原记录。':'同一天再次保存，会更新当天的体重。';
    button.textContent=existing?'更新这一天的体重':'保存体重';
  }
  button.disabled=true; message.textContent='正在读取当天记录…';
  api('/api/weights').then(data=>{weights=data.weights;if(edit){date.value=edit.record.measured_on;$('#weight-grams').value=edit.record.weight_grams;$('#jin-preview').textContent=`相当于 ${(edit.record.weight_grams/500).toFixed(2)} 斤`;}fillWeight();message.textContent='';button.disabled=false;}).catch(error=>{message.textContent=error.message+'，请刷新页面重试';});
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
    if(edit){$('#length-notice').textContent='修改日期不会覆盖其他记录；一天只保留一条身长。';button.textContent='保存修改';return;}
    const existing=lengths.find(row=>row.measured_on===date.value);
    $('#length-cm').value=existing ? (existing.length_mm/10).toFixed(1) : '';
    $('#length-notice').textContent=existing?'这一天已经记过身长，保存后会更新原记录。':'同一天再次保存，会更新当天的身长。';
    button.textContent=existing?'更新这一天的身长':'保存身长';
  }
  button.disabled=true; message.textContent='正在读取当天记录…';
  api('/api/lengths').then(data=>{lengths=data.lengths;if(edit){date.value=edit.record.measured_on;$('#length-cm').value=(edit.record.length_mm/10).toFixed(1);}fillLength();message.textContent='';button.disabled=false;}).catch(error=>{message.textContent=error.message+'，请刷新页面重试';});
  date.addEventListener('change',fillLength);
}
async function preparePhoto(event) {
  const file=event.target.files[0]; if(!file)return;
  const generation=++photoGeneration;
  photoBusy=true; button.disabled=true; message.textContent='正在准备照片…';
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
if(kind==='stool'&&edit){const option=[...form.querySelectorAll('[name=stoolColor]')].find(input=>input.value===edit.record.color);if(option)option.checked=true;}
if((kind==='stool'||kind==='medication')&&edit)setupExistingPhoto(edit,$('#photo-preview'),$('#selected-photo'),()=>{photoData=null;photoGeneration++;photoBusy=false;button.disabled=false;});
if(kind==='medication') {
  const items=$('#medicine-items');
  const addRow=(name='',unit='',medicineId=null)=>{const row=document.createElement('div');row.className='medicine-row';if(medicineId)row.dataset.medicineId=medicineId;row.innerHTML=`<label>药品名称<input name="medicineName" type="text" maxlength="50" placeholder="填写药品名称" aria-label="药品名称" required></label><label>剂量（选填）<span class="medicine-dose-fields"><input name="medicineDose" type="text" inputmode="decimal" maxlength="50" placeholder="实际用量" aria-label="剂量（选填）"><input name="medicineUnit" type="text" maxlength="12" placeholder="单位" aria-label="计量单位"></span></label><button type="button" class="remove-medicine" aria-label="删除这项药品">移除</button>`;row.querySelector('[name="medicineName"]').value=name;row.querySelector('[name="medicineUnit"]').value=unit;row.querySelector('[name="medicineName"]').addEventListener('input',()=>{row.querySelector('[name="medicineUnit"]').value='';delete row.dataset.medicineId;});items.append(row);return row;};
  if(edit)for(const medicine of edit.record.medicines){const row=addRow(medicine.name,medicine.unit||'',medicine.medicineId);row.querySelector('[name=medicineDose]').value=medicine.dose||'';}else addRow();
  $('#add-medicine').addEventListener('click',()=>addRow());
  setupCommonMedicines(medicine=>{const empty=[...items.querySelectorAll('[name="medicineName"]')].find(input=>!input.value.trim());if(empty){empty.value=medicine.name;empty.closest('.medicine-row').dataset.medicineId=medicine.id;empty.closest('.medicine-row').querySelector('[name="medicineUnit"]').value=medicine.unit;}else addRow(medicine.name,medicine.unit,medicine.id);});
  const planId=new URLSearchParams(location.search).get('plan');
  if(planId&&!edit){button.disabled=true;api('/api/medication-plans').then(({plans})=>{const plan=plans.find(item=>item.id===Number(planId)&&item.enabled);if(!plan)throw new Error('用药计划未启用，请核对后手动填写');items.replaceChildren();const row=addRow(plan.name,plan.unit,plan.medicine_id);row.querySelector('[name="medicineDose"]').value=plan.dose;}).catch(error=>{message.textContent=error.message;}).finally(()=>{button.disabled=false;});}
  items.addEventListener('click',event=>{const remove=event.target.closest('.remove-medicine');if(!remove)return;const rows=items.querySelectorAll('.medicine-row');if(rows.length===1){rows[0].querySelector('[name="medicineName"]').value='';rows[0].querySelector('[name="medicineDose"]').value='';rows[0].querySelector('[name="medicineUnit"]').value='';delete rows[0].dataset.medicineId;}else remove.closest('.medicine-row').remove();});
}
form.addEventListener('submit',async event=>{
  event.preventDefault(); if(photoBusy)return;
  const data=new FormData(form); let path, method, payload;
  if(kind==='feeding'){path='/api/records';method='POST';payload={fedAt:eventTimestamp($('#event-time'),edit?.record.fed_at||edit?.record.occurred_at),feedingMethod:data.get('feedingMethod'),amountMl:data.get('feedingMethod')==='direct'?null:Number(data.get('amountMl')),note:data.get('note'),...(data.get('feedingMethod')==='direct'?nursingTimer.payload():{})};}
  if(kind==='weight'){path='/api/weights';method='PUT';payload={measuredOn:data.get('measuredOn'),weightGrams:Number(data.get('weightGrams'))};}
  if(kind==='length'){path='/api/lengths';method='PUT';payload={measuredOn:data.get('measuredOn'),lengthCm:Number(data.get('lengthCm'))};}
  if(kind==='stool'){path='/api/stools';method='POST';payload={occurredAt:eventTimestamp($('#event-time'),edit?.record.fed_at||edit?.record.occurred_at),note:data.get('note'),color:data.get('stoolColor')||'未记录',photo:photoData};}
  if(kind==='diaper'){path='/api/diapers';method='POST';payload={occurredAt:eventTimestamp($('#event-time'),edit?.record.fed_at||edit?.record.occurred_at),note:data.get('note')};}
  if(kind==='medication'){path='/api/medications';method='POST';payload={occurredAt:eventTimestamp($('#event-time'),edit?.record.fed_at||edit?.record.occurred_at),medicines:[...form.querySelectorAll('.medicine-row')].map(row=>({name:row.querySelector('[name="medicineName"]').value,dose:row.querySelector('[name="medicineDose"]').value,unit:row.querySelector('[name="medicineUnit"]').value,...(row.dataset.medicineId?{medicineId:Number(row.dataset.medicineId)}:{})})),note:data.get('note'),photo:photoData};}
  if(edit){path=edit.path;method='PUT';}
  button.disabled=true;message.textContent='正在保存，请稍等…';
  try {await api(path,{method,body:JSON.stringify(payload)});if(kind==='feeding'&&(edit||payload.feedingMethod==='direct'))nursingTimer.clear();location.href=edit?'/?updated='+kind+'#records':`/?saved=${kind}`;}
  catch(error){message.textContent=error.message;showToast(error.message);button.disabled=false;}
});

}
