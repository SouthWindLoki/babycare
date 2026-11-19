import { $, api, localInputValue } from './shared.js';

export const eventPaths={feeding:'records',weight:'weights',length:'lengths',stool:'stools',diaper:'diapers',medication:'medications',abnormal:'abnormalities'};
const names={feeding:'喂奶',weight:'体重',length:'身长',stool:'便便',diaper:'尿布',medication:'用药',abnormal:'异常'};

export async function loadEventEdit(kind,form){
  const id=new URLSearchParams(location.search).get('edit');
  if(id===null)return null;
  const button=form.querySelector('[type=submit]');button.disabled=true;
  $('.operation-heading h1').textContent=`编辑${names[kind]}记录`;
  $('.operation-heading>p:last-child').textContent='核对并修改这条记录，保存后返回事件列表。';
  $('.back-link').textContent='← 返回事件列表';$('.back-link').href='/#records';
  $('.operation-tip').textContent='保存只会修改这条记录。';
  try{
    if(!/^[1-9]\d*$/.test(id))throw new Error('记录编号无效，请返回列表重新选择');
    const path=`/api/${eventPaths[kind]}/${id}`,{record}=await api(path);
    button.textContent='保存修改';button.disabled=false;
    if($('#event-time'))$('#event-time').value=localInputValue(new Date(record.fed_at||record.occurred_at));
    const note=form.querySelector('[name=note]');if(note)note.value=record.note||'';
    return {id,path,record};
  }catch(error){
    $('#operation-message').textContent=error.message;button.textContent='无法保存';
    for(const element of form.elements)element.disabled=true;
    form.dataset.editFailed='true';return {failed:true};
  }
}

export function eventTimestamp(input,original){
  return original&&input.value===localInputValue(new Date(original))?original:new Date(input.value).toISOString();
}

export function setupExistingPhoto(edit,preview,image,onRemove){
  if(!edit?.record?.has_photo)return;
  image.src=`${edit.path}/photo`;preview.hidden=false;
  const button=document.createElement('button');button.type='button';button.className='secondary-button';button.textContent='移除照片';
  button.addEventListener('click',()=>{onRemove();preview.hidden=true;});preview.append(button);
}
