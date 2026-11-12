import { $, api, showToast } from '/shared.js';
export function setupCommonMedicines(onSelect=()=>{}) {
  let medicines=[],editingId=null;
  const tags=$('#common-medicine-tags'),dialog=$('#common-medicine-dialog'),form=$('#common-medicine-form'),configured=$('#configured-common-medicines');
  const render=()=>{
    tags.replaceChildren();
    configured.replaceChildren();
    for(const medicine of medicines){
      const item=document.createElement('span');item.className='common-medicine-item';
      const choose=document.createElement('button');choose.type='button';choose.textContent=`${medicine.name}（${medicine.unit||'单位未配置'}）`;choose.addEventListener('click',()=>onSelect(medicine));
      const edit=document.createElement('button');edit.type='button';edit.className='edit-common-medicine';edit.textContent='修改';edit.setAttribute('aria-label',`修改${medicine.name}`);edit.addEventListener('click',()=>open(medicine));
      item.append(choose);tags.append(item);
      const setting=document.createElement('div');setting.className='configured-medicine-row';
      const name=document.createElement('span');name.textContent=`${medicine.name}（${medicine.unit||'单位未配置'}）`;
      setting.append(name,edit);configured.append(setting);
    }
  };
  const open=(medicine=null)=>{editingId=medicine?.id??null;form.reset();$('#common-medicine-title').textContent=medicine?'修改常用药':'添加常用药';$('#common-medicine-name').value=medicine?.name||'';$('#common-medicine-unit').value=medicine?.unit||'';$('#common-medicine-error').textContent='';if(!dialog.open)dialog.showModal();$('#common-medicine-name').focus();};
  async function load(){try{const data=await api('/api/common-medicines');medicines=data.medicines;render();$('#common-load-message').textContent='';$('#retry-common-medicines').hidden=true;document.dispatchEvent(new CustomEvent('common-medicines-updated',{detail:medicines}));}catch(error){$('#common-load-message').textContent=error.message;$('#retry-common-medicines').hidden=false;}}
  $('#retry-common-medicines').addEventListener('click',load);
  $('#add-common-medicine').addEventListener('click',()=>open());
  $('#cancel-common-medicine').addEventListener('click',()=>dialog.close());
  document.querySelector('.unit-shortcuts').addEventListener('click',event=>{if(event.target.matches('button'))$('#common-medicine-unit').value=event.target.textContent;});
  form.addEventListener('submit',async event=>{
    event.preventDefault();const save=form.querySelector('[type=submit]');save.disabled=true;$('#common-medicine-error').textContent='';
    try{const data=await api(editingId?`/api/common-medicines/${editingId}`:'/api/common-medicines',{method:editingId?'PUT':'POST',body:JSON.stringify({name:$('#common-medicine-name').value,unit:$('#common-medicine-unit').value})});medicines=data.medicines;render();dialog.close();showToast('常用药品已保存');document.dispatchEvent(new CustomEvent('common-medicines-updated',{detail:medicines}));}
    catch(error){$('#common-medicine-error').textContent=error.message;}finally{save.disabled=false;}
  });
  load();
  return {getMedicines:()=>medicines};
}
