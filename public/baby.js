import { $, api, localInputValue, babyAge, showToast } from '/shared.js';

const form = $('#profile-form');
const button = form.querySelector('button');
const planForm = $('#plan-form');
const planButton = planForm.querySelector('button');
$('#profile-birthday').max = localInputValue().slice(0, 10);
function preview(baby) {
  $('#brand-name').textContent = baby.name ? `${baby.name}日常` : '宝宝日常';
}
async function load() {
  $('#profile-message').textContent = '正在读取档案…';
  try {
    const { baby } = await api('/api/baby');
    $('#profile-name').value = baby.name;
    $('#profile-birthday').value = baby.birthday || '';
    preview(baby);
    const settings = await api('/api/settings');
    $('#plan-feeding-type').value = settings.feedingType;
    $('#plan-formula-brand').value = settings.formulaBrand || '';
    $('#plan-formula-stage').value = settings.formulaStage || 1;
    $('#plan-amount').value = settings.amountMl;
    $('#plan-interval').value = settings.intervalHours;
    togglePlanFields();
    button.disabled = false; planButton.disabled = false; $('#profile-message').textContent = '';
  } catch (error) { $('#profile-message').textContent = `${error.message}，请刷新页面重试`; }
}
form.addEventListener('submit', async event => {
  event.preventDefault(); button.disabled = true;
  $('#profile-message').textContent = '正在保存…';
  try {
    const { baby } = await api('/api/baby', { method:'PUT', body:JSON.stringify({ name:$('#profile-name').value, birthday:$('#profile-birthday').value }) });
    $('#profile-name').value = baby.name; preview(baby); $('#profile-message').textContent = ''; showToast('宝宝档案已保存');
  } catch (error) { $('#profile-message').textContent = error.message; }
  finally { button.disabled = false; }
});
function togglePlanFields() {
  const breast = $('#plan-feeding-type').value === 'breast';
  $('#plan-brand-field').hidden = breast;
  $('#plan-stage-field').hidden = breast;
  $('#plan-formula-brand').required = false;
  $('#plan-formula-stage').required = !breast;
}
$('#plan-feeding-type').addEventListener('change', togglePlanFields);
planForm.addEventListener('submit', async event => {
  event.preventDefault();
  if (!planForm.reportValidity()) return;
  planButton.disabled = true; $('#plan-message').textContent = '正在保存…';
  try {
    await api('/api/settings', { method:'PUT', body:JSON.stringify({ intervalHours:Number($('#plan-interval').value), amountMl:Number($('#plan-amount').value), feedingType:$('#plan-feeding-type').value, formulaBrand:$('#plan-formula-brand').value, formulaStage:Number($('#plan-formula-stage').value) }) });
    $('#plan-message').textContent = ''; showToast('喂奶计划已保存');
  } catch (error) { $('#plan-message').textContent = error.message; }
  finally { planButton.disabled = false; }
});
load();
