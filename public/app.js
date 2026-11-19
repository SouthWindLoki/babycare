import { setupQuickActions } from '/quick-actions.js';
import { setupMobileNavigation } from '/mobile-navigation.js';
import { initReferences } from '/references.js';
import { developmentWindow, notifyDevelopment } from '/development.js';
import { homeObservation } from '/development-prompts.js';
import { feedingValue, exportFeedingAmount, feedingMethodIcons, updatePlanControls, getPlanFeedingType, setPlanFeedingType } from '/feeding-options.js';
import { abnormalCategories, abnormalDetails } from '/abnormal-options.js';
import { milkReference, completedMonths } from '/nutrition.js';
import { trendKeys, trendQuery, trendValue, growthTrendDate } from '/trends.js';
import { assessGrowth, chartReferenceForDate, growthPercentilePoints } from '/growth-assessment.js';
import { medicationPlansForWindow } from '/medication-schedule.js';
import { growthChange } from '/growth-changes.js';
import { formatNursingDuration } from '/nursing-timer.js';
import { stoolColor } from '/stool-colors.js';
import { $, localInputValue, formatDate, formatDayLabel, formatTime, showToast, api, babyAge } from '/shared.js';
const state = { records: [], stools: [], diapers: [], medications: [], medicationPlans: [], weights: [], lengths: [], summary: null, intervalHours: 3, amountMl: 120, feedingType: 'formula', breastMethod:'direct', formulaBrand: '', formulaStage: 1, baby: null, filter: 'all', logs: { records: [], weights: [], lengths: [], abnormalities: [], stools: [], diapers: [], medications: [] } };
let notifiedAt = null;
let selectedMedicationPlanId = null;
let homeObservations = [];
let observationBirthday = null;
let observationPrompt = null;
let observationSaving = false;
const localDay = () => { const date = new Date(); return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`; };
function activeMedicationPlans() {
  return medicationPlansForWindow(state.medicationPlans);
}
function renderMedicationReference() {
  const plans=activeMedicationPlans(), list=$('#next-medication-list');
  list.replaceChildren();
  let index=plans.findIndex(plan=>plan.id===selectedMedicationPlanId);
  if(index<0)index=0;
  selectedMedicationPlanId=plans[index]?.id??null;
  $('#medication-plan-count').hidden=plans.length>0;
  $('#medication-plan-count').textContent=plans.length?'':'今天及未来24小时暂无待执行计划';
  $('.medication-reference-body').hidden=!plans.length;
  $('#medication-plan-switch').hidden=plans.length<2;
  $('#medication-plan-position').textContent=plans.length?`${index+1} / ${plans.length}`:'';
  if(!plans.length)return;
  for(const [planIndex,plan] of plans.entries()){
  const item=document.createElement('div');item.className='next-medication-item';
  const active=planIndex===index;item.classList.toggle('is-active',active);item.inert=!active;item.setAttribute('aria-hidden',String(!active));
  const name=document.createElement('strong');name.textContent=plan.name;
  const dose=document.createElement('p');dose.className='medication-reference-dose';dose.textContent=`每次 ${plan.dose} ${plan.unit}`;
  const time=document.createElement('p');time.className='medication-reference-time';
  const date=document.createElement('span');date.textContent=formatDayLabel(plan.nextAt);
  const clock=document.createElement('strong');clock.textContent=formatTime(plan.nextAt);time.append(date,clock);
  const status=document.createElement('p');status.className='muted';status.textContent=Date.parse(plan.nextAt)<=Date.now()?'参考时间已到，请核对用药记录':'时间仅作参考，按医嘱用药';
  item.append(time,name,dose,status);list.append(item);
  }
}
for(const [id,direction] of [['#previous-medication-plan',-1],['#next-medication-plan',1]]){
  $(id).addEventListener('click',()=>{
    const plans=activeMedicationPlans();if(plans.length<2)return;
    const index=Math.max(0,plans.findIndex(plan=>plan.id===selectedMedicationPlanId));
    selectedMedicationPlanId=plans[(index+direction+plans.length)%plans.length].id;
    renderMedicationReference();
  });
}
setupQuickActions();
let referencesController = null;
let lastReferenceTab = 'vaccines';
function renderHomeView() {
  const [requestedView, requestedCategory] = location.hash.slice(1).split('/');
  const view = ['overview', 'records', 'references'].includes(requestedView) ? requestedView : 'overview';
  document.body.dataset.homeView = view;
  for (const name of ['overview', 'records', 'references']) $(`#${name}-panel`).hidden = name !== view;
  document.querySelectorAll('[data-home-view]').forEach(button => {
    const active = button.dataset.homeView === view;
    button.setAttribute('aria-selected', String(active));
    button.tabIndex = active ? 0 : -1;
  });
  if (view === 'references') {
    if (['vaccines', 'feeding', 'growth', 'development'].includes(requestedCategory)) lastReferenceTab = requestedCategory;
    referencesController ??= initReferences($('#references-panel'));
    referencesController.selectTab(lastReferenceTab, false);
  }
}
$('.home-tabs').addEventListener('click', event => {
  const button = event.target.closest('[data-home-view]');
  if (!button) return;
  location.hash = button.dataset.homeView === 'references' ? `references/${lastReferenceTab}` : button.dataset.homeView;
  renderHomeView();
});
$('.home-tabs').addEventListener('keydown',event=>{
  if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
  event.preventDefault();
  const buttons=[...document.querySelectorAll('[data-home-view]')];
  const current=buttons.indexOf(document.activeElement);
  const index=event.key==='Home'?0:event.key==='End'?buttons.length-1:(current+(event.key==='ArrowRight'?1:-1)+buttons.length)%buttons.length;
  const target=buttons[index];target.focus();if(target.dataset.homeView)target.click();
});
window.addEventListener('hashchange',renderHomeView);renderHomeView();
setupMobileNavigation({ shell: $('.shell'), tabs: $('.home-tabs') });
function escapeHtml(value) { return value.replace(/[&<>'"]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char])); }
function relativeHours(ms) { const mins = Math.max(1, Math.round(ms / 60000)); return mins < 60 ? `${mins} 分钟` : `${Math.floor(mins / 60)} 小时${mins % 60 ? ` ${mins % 60} 分钟` : ''}`; }
function feedingInterval(ms) {
  let minutes = Math.round(ms / 60000);
  if (minutes < 1) return '不到 1 分钟';
  const hours = Math.floor(minutes / 60); minutes %= 60;
  return hours ? `${hours} 小时${minutes ? ` ${minutes} 分钟` : ''}` : `${minutes} 分钟`;
}
function render() {
  const { summary, baby, weights, lengths } = state;
  renderDevelopmentReminder();
  const assessment=assessGrowth(baby,weights,lengths);
  const renderGrowthPosition=(id,result)=>{
    const element=$(id); element.replaceChildren();
    if(!result.available){element.hidden=true;return;}
    const {actual,low,high,level,percentile}=result;
    const position=actual<low?'below':actual>=high?'above':'within';
    const title=document.createElement('p'); title.className='growth-range-title';
    const label=document.createElement('span');label.textContent='生长水平';
    const conclusion=document.createElement('strong');conclusion.textContent=level;title.append(label,conclusion);
    const scaleLabel=document.createElement('span');scaleLabel.className='growth-percentile-scale-label';scaleLabel.textContent='百分位';title.append(scaleLabel);
    const comparison=document.createElement('p');comparison.className='growth-percentile-comparison';
    const isWeight=id==='#weight-range-visual',peer=`同月龄${baby.sex==='male'?'男':'女'}宝宝`;
    comparison.textContent=percentile.kind==='below'?`低于第3百分位，比超过97%的${peer}${isWeight?'轻':'短'}`:
      percentile.kind==='above'?`超过第97百分位，比至少97%的${peer}${isWeight?'重':'长'}`:
      `${percentile.kind==='estimate'?'估算：':''}比约${percentile.percentile}%的${peer}${isWeight?'重':'长'}`;
    const track=document.createElement('div'); track.className='growth-range-track growth-percentile-track';
    for(let index=0;index<6;index++){
      const segment=document.createElement('span');segment.className='growth-percentile-segment';segment.dataset.segment=String(index);
      segment.style.left=`${10+index*80/6}%`;segment.style.width=`${80/6}%`;track.append(segment);
    }
    track.setAttribute('role','img');track.setAttribute('aria-label',`生长水平${level}，${comparison.textContent}`);
    const markerNode=document.createElement('span'); markerNode.className='growth-range-marker'; markerNode.style.left=`${percentile.marker}%`; track.append(markerNode);
    const ticks=document.createElement('div');ticks.className='growth-percentile-ticks';ticks.setAttribute('aria-hidden','true');
    for(const [index,point] of growthPercentilePoints.entries()){
      const tick=document.createElement('span');tick.textContent=point;tick.style.left=`${10+index*80/6}%`;ticks.append(tick);
    }
    element.dataset.position=position;
    element.dataset.percentileKind=percentile.kind;
    element.append(title,track,ticks,comparison); element.hidden=false;
  };
  renderMedicationReference();

  $('#today-label').textContent = new Intl.DateTimeFormat('zh-CN', {year:'numeric',month:'long',day:'numeric',weekday:'long'}).format(new Date());
  $('#dashboard-title').textContent = baby?.name ? `${baby.name}的今天` : '宝宝的今天';
  $('#brand-name').textContent = baby?.name ? `${baby.name}日常` : '宝宝日常';
  $('#baby-age').textContent = baby?.birthday ? `出生 ${babyAge(baby.birthday)} · 一天一点，小小成长。` : '在宝宝档案里填上名字和生日，开启专属记录。';
  const averageInterval=summary?.last24HoursAverageIntervalHours;
  $('#today-average').textContent = Number.isFinite(averageInterval) ? `平均每 ${averageInterval.toFixed(1)} 小时喂一次` : '记录两次喂奶后显示平均间隔';
  $('#last24-amount').textContent=summary?.last24HoursAmount??0;
  $('#last24-count').textContent=summary?.last24HoursCount??0;
  const reference=milkReference(baby?.birthday,state.feedingType);
  const directPlan=state.feedingType==='breast'&&state.breastMethod==='direct';
  {
    const id='last24',prefix='last24Hours',count=summary?.last24HoursCount??0,directId='rolling-direct';
    const direct=summary?.[prefix+'DirectCount']??0,bottles=summary?.[prefix+'BottleCount']??Math.max(0,count-direct);
    const left=summary?.[prefix+'LeftDurationSeconds']??0,right=summary?.[prefix+'RightDurationSeconds']??0,timed=summary?.[prefix+'TimedDirectCount']??0;
    document.getElementById(directId).hidden=!(directPlan||state.feedingType==='mixed'||direct>0);
    document.getElementById(id+'-direct-count').textContent=direct;
    document.getElementById(id+'-direct-duration').textContent=timed?`合计 ${formatNursingDuration(left+right)}`:direct?'时长未记录':'还没有亲喂记录';
    document.getElementById(id+'-direct-sides').textContent=timed?`左 ${formatNursingDuration(left)} · 右 ${formatNursingDuration(right)}`:'';
    document.getElementById(id+'-direct-missing').textContent=timed&&direct>timed?`另有 ${direct-timed} 次未记时长`:'';
    document.getElementById(id+'-bottle').hidden=directPlan&&bottles===0;
    document.getElementById(id+'-bottle-count').textContent=`瓶喂 ${bottles} 次`;
    document.getElementById(id+'-count').parentElement.hidden=!(direct>0&&bottles>0);
  }
  $('#milk-stage').textContent=reference.stage;
  $('#milk-range').textContent=directPlan?'亲喂按需进行，时长不换算奶量':reference.min===null?'亲喂与瓶喂分开记录，结合生长观察':`每日参考 ${reference.min}～${reference.max} 毫升`;
  const babyMonths=baby?.birthday?completedMonths(baby.birthday):null;
  const wetVisible=babyMonths===null||babyMonths<12;
  const stoolVisible=babyMonths===null||babyMonths<2;
  $('#wet-diaper-action').hidden=!wetVisible;$('#wet-diaper-card').hidden=!wetVisible;
  $('#stool-action').hidden=!stoolVisible;$('#stool-card').hidden=!stoolVisible;
  $('#excretion-card').hidden=!wetVisible&&!stoolVisible;
  $('#today-diaper-count').textContent = summary?.last24HoursWetDiaperCount ?? 0;
  $('#today-stool-count').textContent = summary?.last24HoursStoolCount ?? 0;
  const wetReference=$('#wet-diaper-reference');
  const today=new Date(),babyDays=baby?.birthday?(Date.UTC(today.getFullYear(),today.getMonth(),today.getDate())-Date.parse(`${baby.birthday}T00:00:00Z`))/86400000:null;
  if(wetReference){wetReference.textContent=babyDays===null?'配置生日后显示参考指标。':babyDays<4?'出生前4天：湿尿布数通常逐日增加。':babyMonths<4?'出生第5天起：每24小时通常至少6片较沉的湿尿布。':'12月龄内：湿尿布记录可作为摄入情况观察指标。';}
  if (weights.length) {
    $('#latest-weight').innerHTML = `<span class="weight-main">${(weights[0].weight_grams / 500).toFixed(2)}<small>斤</small></span><span class="weight-conversion">（${weights[0].weight_grams} 克）</span>`;
    const change = weights.length > 1 ? weights[0].weight_grams - weights[1].weight_grams : null;
    const weightChange = $('#weight-change');
    weightChange.textContent = change === null ? '暂无上次体重可对比' : change === 0 ? '与上次体重相同' : `比上次${change > 0 ? '重' : '轻'} ${(Math.abs(change) / 500).toFixed(2)} 斤（${Math.abs(change)} 克）`;
    weightChange.classList.toggle('has-comparison', change !== null);
    $('#weight-helper').textContent = `${formatDayLabel(`${weights[0].measured_on}T12:00:00`)}记录`;
  } else { $('#latest-weight').textContent = '—'; $('#weight-change').textContent = ''; $('#weight-change').classList.remove('has-comparison'); $('#weight-helper').textContent = '今天称了吗？记一下吧'; }
  renderGrowthPosition('#weight-range-visual',assessment.weight);
  if (lengths.length) {
    $('#latest-length').innerHTML = `${(lengths[0].length_mm / 10).toFixed(1)}<small>厘米</small>`;
    const change = lengths.length > 1 ? lengths[0].length_mm - lengths[1].length_mm : null;
    const lengthChange = $('#length-change');
    lengthChange.textContent = change === null ? '暂无上次身长可对比' : change === 0 ? '与上次身长相同' : `比上次${change > 0 ? '长' : '短'} ${(Math.abs(change)/10).toFixed(1)} 厘米`;
    lengthChange.classList.toggle('has-comparison', change !== null);
    $('#length-helper').textContent = `${formatDayLabel(`${lengths[0].measured_on}T12:00:00`)}测量`;
  } else { $('#latest-length').textContent = '—'; $('#length-change').textContent = ''; $('#length-change').classList.remove('has-comparison'); $('#length-helper').textContent = '量一量，记下宝宝的成长'; }
  renderGrowthPosition('#length-range-visual',assessment.length);
  const nutrition=assessment.nutrition;
  const nutritionConclusion=document.createElement('span');
  nutritionConclusion.textContent=nutrition.label;
  $('#growth-nutrition-result').replaceChildren(nutritionConclusion);
  $('#growth-nutrition').dataset.state=nutrition.findings.length?'attention':nutrition.complete?'within':'incomplete';
  $('#growth-nutrition-date').textContent=nutrition.complete?'按最近记录估算':'';
  $('#growth-nutrition-hint').textContent=nutrition.hint;
  if (summary?.nextAt) {
    const next = new Date(summary.nextAt), now = new Date();
    $('#next-time').textContent = formatTime(next);
    $('#next-date').hidden = false;
    $('#next-date').textContent = formatDayLabel(next);
    const elapsed = summary.latest?.fed_at ? `距上次喂奶 ${relativeHours(now - new Date(summary.latest.fed_at))}` : '';
    $('#next-helper').textContent = elapsed;
    $('#next-card').classList.remove('is-due');
    if (next <= now && 'Notification' in window && Notification.permission === 'granted' && notifiedAt !== summary.nextAt) {
      try { new Notification('宝宝日常 · 喂奶时间参考', {body:'按当前计划估算的时间已到，仅供参考，请按宝宝状态和需要喂奶。',tag:'babycare-feeding'}); notifiedAt = summary.nextAt; } catch { /* Keep page reminder. */ }
    }
  } else { $('#next-date').hidden = true; $('#next-time').textContent = '等待第一笔'; $('#next-helper').textContent = '记下喂奶后，显示距上次喂奶的时间'; $('#next-card').classList.remove('is-due'); }
  renderLogs();
}
function renderDevelopmentReminder() {
  const { due, next, nextOn } = developmentWindow(state.baby?.birthday);
  const reminder = $('#development-reminder');
  const observation = observationBirthday === state.baby?.birthday ? homeObservation(state.baby?.birthday, localDay(), homeObservations) : null;
  reminder.hidden = !observation && !due && !next;
  if (reminder.hidden) return;
  reminder.dataset.state = due ? 'due' : 'upcoming';
  $('#development-reminder-status').textContent = due ? '本月发育观察' : '下一次发育观察';
  $('#development-reminder-title').textContent = due ? `${due.label} · 发育观察` : `${next.label} · ${nextOn.replaceAll('-', '/')}`;
  $('#development-reminder-description').textContent = due
    ? '结合日常表现查看对应阶段的发育标志与预警征象。'
    : `下次观察为${next.label}，${nextOn.replaceAll('-', '/')}开始记录；也可以提前了解本阶段内容。`;
  const openButton = $('#development-observation-open');
  openButton.hidden = !observation?.ready;
  if (observation) {
    observationPrompt = observation.prompt;
    reminder.dataset.state = observation.ready ? 'observe' : 'recorded';
    $('#development-reminder-status').textContent = observation.ready ? `成长小观察 · ${observation.prompt.context}` : '成长小观察 · 已记录';
    $('#development-reminder-title').textContent = observation.ready ? observation.prompt.text : '这次的小变化，已经记下了';
    $('#development-reminder-description').textContent = observation.ready
      ? `每隔3天来一条，顺着日常互动随手记，不用专门测试。${due ? `本月也是${due.label}发育观察节点，可查看完整自评。` : ''}`
      : `上次记录于${observation.latest.observedOn.replaceAll('-', '/')}，下次${observation.nextOn.replaceAll('-', '/')}再来看看。${due ? `本月也是${due.label}发育观察节点。` : ''}`;
    if (!observation.ready && !observationSaving) {
      $('#development-observation-form').hidden = true;
      openButton.setAttribute('aria-expanded', 'false');
    }
  } else observationPrompt = null;
  if ('Notification' in window && Notification.permission === 'granted') {
    let storage;
    try { storage = window.localStorage; } catch { /* Use session dedup if unavailable. */ }
    notifyDevelopment({ birthday: state.baby?.birthday, storage, notify: (title, options) => {
      const notification = new Notification(title, options);
      notification.onclick = () => { window.focus(); location.hash = 'references/development'; notification.close(); };
    } });
  }
}
$('#development-observation-open').addEventListener('click', () => {
  $('#development-observation-form').hidden = false;
  $('#development-observation-open').setAttribute('aria-expanded', 'true');
  $('#development-observation-form input').focus();
});
$('#development-observation-cancel').addEventListener('click', () => {
  $('#development-observation-form').hidden = true;
  $('#development-observation-open').setAttribute('aria-expanded', 'false');
  $('#development-observation-open').focus();
});
$('#development-observation-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (observationSaving || !observationPrompt) return;
  const response = event.currentTarget.querySelector('input[name="observation-response"]:checked')?.value;
  if (!response) return;
  observationSaving = true;
  const submit = event.currentTarget.querySelector('[type=submit]');
  submit.disabled = true;
  $('#development-observation-save-status').textContent = '正在保存…';
  try {
    const data = await api('/api/development-observations', { method: 'POST', body: JSON.stringify({ birthday: state.baby.birthday, promptId: observationPrompt.id, response, note: $('#development-observation-note').value }) });
    homeObservations = data.observations;
    observationBirthday = data.birthday;
    $('#development-observation-form').reset();
    $('#development-observation-form').hidden = true;
    $('#development-observation-open').setAttribute('aria-expanded', 'false');
    $('#development-observation-save-status').textContent = '';
    document.dispatchEvent(new Event('development-observation-saved'));
    showToast('成长观察已保存，可在“发育观察”查看');
  } catch (error) { $('#development-observation-save-status').textContent = `${error.message}，这次还没有保存，请重试。`; }
  finally { observationSaving = false; submit.disabled = false; renderDevelopmentReminder(); }
});
function renderLogs() {
  const feedingRows = [...new Map([...state.records, ...state.logs.records].map(row => [row.id, row])).values()].sort((a,b) => new Date(a.fed_at) - new Date(b.fed_at));
  const feedingIntervals = new Map();
  feedingRows.forEach((row, index) => { if (index > 0) feedingIntervals.set(row.id, Date.parse(row.fed_at) - Date.parse(feedingRows[index - 1].fed_at)); });
  const logs = [
    ...state.logs.records.map(r => ({...r, type:'feeding', at:r.fed_at, label:'喂奶', value:feedingValue(r), note:r.note, interval:feedingIntervals.get(r.id)})),
    ...state.logs.weights.map(r => ({...r, type:'weight', at:`${r.measured_on}T12:00:00`, label:'称重', value:`${(r.weight_grams/500).toFixed(2)} 斤 · ${r.weight_grams} 克`, change:growthChange(r,'weight')})),
    ...state.logs.lengths.map(r => ({...r, type:'length', at:`${r.measured_on}T12:00:00`, label:'身长', value:`${(r.length_mm/10).toFixed(1)} 厘米`, change:growthChange(r,'length')})),
    ...state.logs.stools.map(r => ({...r, type:'stool', at:r.occurred_at, label:'便便', value:stoolColor(r.color).label, colorSwatch:stoolColor(r.color).swatch, note:r.note})),
    ...state.logs.diapers.map(r => ({...r, type:'diaper', at:r.occurred_at, label:r.diaper_type==='wet'?'湿尿布':'尿布记录', value:r.diaper_type==='wet'?'因尿液浸湿更换':'旧记录，类型未记录', note:r.note})),
    ...state.logs.medications.map(r => ({...r, type:'medication', at:r.occurred_at, label:'用药', value:r.medicines.map(item=>item.dose?`${item.name} ${item.dose}${item.unit?` ${item.unit}`:''}`:item.name).join('、'), note:r.note, has_photo:r.has_photo})),
    ...state.logs.abnormalities.map(r => ({...r, type:'abnormal', at:r.occurred_at, label:'异常', value:r.observations.map(item=>abnormalCategories.find(category=>category.id===item.category)?.label||'异常').join('、'), details:abnormalDetails(r.observations), note:r.note}))
  ].filter(r => state.filter === 'all' || r.type === state.filter).sort((a,b) => new Date(b.at)-new Date(a.at));
  $('#record-list').innerHTML = logs.length ? logs.map(r => `<article class="daily-log log-${r.type}">
    <span class="log-symbol" aria-hidden="true">${r.type === 'feeding' ? (feedingMethodIcons[r.feeding_method] || '🍼') : r.type === 'weight' ? '⚖️' : r.type === 'stool' ? '💩' : r.type === 'length' ? '📏' : r.type === 'abnormal' ? '🩺' : r.type === 'medication' ? '💊' : '<img src="/diaper.svg" alt="">'}</span>
    <div class="log-content"><div class="log-title"><strong>${r.label}</strong><span${r.type === 'stool' ? ' class="stool-log-color"' : ''}>${r.colorSwatch ? `<i class="stool-swatch" style="--stool-color:${r.colorSwatch}" aria-hidden="true"></i>` : ''}${escapeHtml(r.value)}</span></div><p class="log-date">${formatDate(r.at)}${r.type === 'weight' ? ' · 当天称重' : r.type === 'length' ? ' · 当天测量' : ` · ${formatTime(r.at)}`}</p>${r.type === 'feeding' && r.interval !== undefined ? `<p class="log-interval">距上次喂奶 ${feedingInterval(r.interval)}</p>` : ''}${r.change ? `<p class="log-growth-change${r.change.comparable ? ' has-comparison' : ''}"><span>${escapeHtml(r.change.label)}</span></p>` : ''}${r.details ? `<div class="abnormal-log-details">${r.details.map(detail=>`<p>${escapeHtml(detail)}</p>`).join('')}</div>` : ''}${r.note ? `<p class="log-note">${escapeHtml(r.note)}</p>` : ''}${r.type === 'stool' && r.has_photo ? `<button type="button" class="photo-thumb" data-photo="${r.id}" aria-label="查看这次便便的照片"><img src="/api/stools/${r.id}/photo" alt="便便照片缩略图" loading="lazy"><span>查看照片 ↗</span></button>` : ''}${r.type === 'abnormal' && r.has_photo ? `<button type="button" class="photo-thumb" data-abnormal-photo="${r.id}" aria-label="查看这次异常的照片"><img src="/api/abnormalities/${r.id}/photo" alt="异常照片缩略图" loading="lazy"><span>查看照片 ↗</span></button>` : ''}${r.type === 'medication' && r.has_photo ? `<button type="button" class="photo-thumb" data-medication-photo="${r.id}" aria-label="查看这次用药的照片"><img src="/api/medications/${r.id}/photo" alt="用药照片缩略图" loading="lazy"><span>查看照片 ↗</span></button>` : ''}</div>
    <div class="log-actions"><a class="secondary-button edit-log" href="/${r.type}.html?edit=${r.id}" aria-label="编辑${formatDate(r.at)}的${r.label}记录">编辑</a><button class="delete-log" type="button" data-type="${r.type}" data-delete="${r.id}" aria-label="删除${formatDate(r.at)}的${r.label}记录">删除</button></div>
  </article>`).join('') : '<div class="empty-state"><div class="empty-icon" aria-hidden="true">♡</div><p>这段时间没有这类记录</p><span>可以切换事件或选择其他日期</span></div>';
}
let logRequest = 0;
function defaultDates() {
  const now = new Date(); const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  $('#logs-from').value = localInputValue(yesterday).slice(0,10); $('#logs-to').value = localInputValue(now).slice(0,10);
  updateDateShortcutState();
}
function todayDates() {
  const now = new Date();
  const today = localInputValue(now).slice(0,10);
  $('#logs-from').value = today; $('#logs-to').value = today;
  updateDateShortcutState();
}
function updateDateShortcutState() {
  const now = new Date();
  const today = localInputValue(now).slice(0,10);
  const yesterday = localInputValue(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1)).slice(0,10);
  const from = $('#logs-from').value, to = $('#logs-to').value;
  const selected = { '#recent-days': from === yesterday && to === today, '#today-only': from === today && to === today };
  for (const [selector, active] of Object.entries(selected)) {
    const button = $(selector); button.classList.toggle('is-active', active); button.setAttribute('aria-pressed', String(active));
  }
}
function selectedRange() {
  const fromDay = $('#logs-from').value, toDay = $('#logs-to').value;
  if (!fromDay || !toDay || fromDay > toDay) throw new Error('开始日期不能晚于结束日期');
  const start = new Date(`${fromDay}T00:00:00`); const end = new Date(`${toDay}T00:00:00`); end.setDate(end.getDate() + 1);
  return new URLSearchParams({start:start.toISOString(),end:end.toISOString(),fromDay,toDay});
}
async function loadLogs() {
  const request = ++logRequest;
  $('#export-feeding').disabled = true; $('#share-feeding').disabled = true;
  try {
    const query = selectedRange();
    const logs = await api(`/api/logs?${query}`);
    if (request !== logRequest) return;
    state.logs = logs; $('#load-message').textContent = ''; renderLogs();
    $('#export-feeding').disabled = false; $('#share-feeding').disabled = false;
  } catch(error) {
    if (request !== logRequest) return;
    state.logs = {records:[],weights:[],lengths:[],abnormalities:[],stools:[],diapers:[],medications:[]}; renderLogs();
    $('#load-message').textContent = error.message; throw error;
  }
}
defaultDates();
if(location.hash==='#records'){
  try{
    const view=JSON.parse(sessionStorage.getItem('babycare-edit-return'));
    sessionStorage.removeItem('babycare-edit-return');
    if(view&&/^\d{4}-\d{2}-\d{2}$/.test(view.from)&&/^\d{4}-\d{2}-\d{2}$/.test(view.to)&&view.from<=view.to){
      $('#logs-from').value=view.from;$('#logs-to').value=view.to;
      if([...document.querySelectorAll('[data-filter]')].some(b=>b.dataset.filter===view.filter))state.filter=view.filter;
      document.querySelectorAll('[data-filter]').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.filter===state.filter)));
      updateDateShortcutState();
    }
  }catch{}
}
$('#record-list').addEventListener('click',event=>{
  if(!event.target.closest('.edit-log'))return;
  try{sessionStorage.setItem('babycare-edit-return',JSON.stringify({from:$('#logs-from').value,to:$('#logs-to').value,filter:state.filter}));}catch{}
});
for (const id of ['#logs-from','#logs-to']) $(id).addEventListener('change',()=>{updateDateShortcutState();loadLogs().catch(()=>{});});
$('#recent-days').addEventListener('click',()=>{defaultDates();loadLogs().catch(()=>{});});
$('#today-only').addEventListener('click',()=>{todayDates();loadLogs().catch(()=>{});});
async function load() {
  const [feeding, profile, growth, stools, diapers, lengths, medications, medicationPlans] = await Promise.all([api('/api/records'),api('/api/baby'),api('/api/weights'),api('/api/stools'),api('/api/diapers'),api('/api/lengths'),api('/api/medications'),api('/api/medication-plans')]);
  state.records=feeding.records; state.summary=feeding.summary; state.intervalHours=feeding.summary.intervalHours; state.amountMl=feeding.summary.amountMl; state.feedingType=feeding.summary.feedingType; state.breastMethod=feeding.summary.breastMethod||'direct'; state.formulaBrand=feeding.summary.formulaBrand; state.formulaStage=feeding.summary.formulaStage; state.baby=profile.baby; state.weights=growth.weights; state.lengths=lengths.lengths; state.stools=stools.stools; state.diapers=diapers.diapers; state.medications=medications.medications;state.medicationPlans=medicationPlans.plans;
  try {
    const observations = await api('/api/development-observations');
    homeObservations = observations.observations;
    observationBirthday = observations.birthday;
  } catch { /* The existing stage reminder stays available if observations fail. */ }
  await loadLogs(); render();
}
$('.log-filters').addEventListener('click', event => {
  const button=event.target.closest('[data-filter]'); if (!button) return;
  state.filter=button.dataset.filter;
  document.querySelectorAll('[data-filter]').forEach(b => b.setAttribute('aria-selected',String(b===button))); renderLogs();
});
$('#record-list').addEventListener('click', async event => {
  const photo=event.target.closest('[data-photo]');
  if (photo) { $('#photo-dialog h3').textContent='便便照片'; $('#full-photo').alt='排便记录照片'; $('#full-photo').src=`/api/stools/${photo.dataset.photo}/photo`; $('#photo-dialog').showModal(); return; }
  const abnormalPhoto=event.target.closest('[data-abnormal-photo]');
  if (abnormalPhoto) { $('#photo-dialog h3').textContent='异常照片'; $('#full-photo').alt='异常记录照片'; $('#full-photo').src=`/api/abnormalities/${abnormalPhoto.dataset.abnormalPhoto}/photo`; $('#photo-dialog').showModal(); return; }
  const medicationPhoto=event.target.closest('[data-medication-photo]');
  if (medicationPhoto) { $('#photo-dialog h3').textContent='用药照片'; $('#full-photo').alt='用药记录照片'; $('#full-photo').src=`/api/medications/${medicationPhoto.dataset.medicationPhoto}/photo`; $('#photo-dialog').showModal(); return; }
  const button=event.target.closest('[data-delete]'); if (!button) return;
  if (!confirm(button.dataset.type==='stool' ? '确定删除这条便便记录和照片吗？' : '确定删除这条记录吗？')) return;
  const routes={feeding:'records',weight:'weights',length:'lengths',abnormal:'abnormalities',stool:'stools',diaper:'diapers',medication:'medications'}; button.disabled=true;
  try { await api(`/api/${routes[button.dataset.type]}/${button.dataset.delete}`,{method:'DELETE'}); await load(); showToast('记录已删除'); }
  catch(error) { showToast(error.message); button.disabled=false; }
});
$('#close-photo').addEventListener('click',()=>$('#photo-dialog').close());
const trendConfig = {
  feeding: {title:'喂奶趋势', unit:'次', color:'#bd5b3b'},
  weight: {title:'体重趋势', unit:'斤', color:'#496c57'},
  length: {title:'身长趋势', unit:'厘米', color:'#7d648e'},
  diaper: {title:'湿尿布趋势', unit:'片', color:'#49646c'},
  stool: {title:'拉臭臭趋势', unit:'次', color:'#85652c'}
};
const trendState = {kind:'feeding', mode:'day', request:0, logs:null};
function renderTrend(logs) {
  const config=trendConfig[trendState.kind], keys=trendKeys(trendState.mode), values=keys.map(key=>trendValue(logs,trendState.kind,trendState.mode,key));
  const isWeight=trendState.kind==='weight', isLength=trendState.kind==='length', isGrowth=isWeight||isLength, growthName=isWeight?'体重':'身长';
  trendState.logs=logs;
  const hasSex=['male','female'].includes(state.baby?.sex);
  const references=isGrowth&&hasSex?keys.map(key=>{
    const measuredOn=growthTrendDate(logs,trendState.kind,trendState.mode,key);
    const point=chartReferenceForDate(state.baby.sex,state.baby.birthday,measuredOn,trendState.kind);
    if(!point)return null;
    const factor=isWeight?2:1;
    return {low:point.low*factor,high:point.high*factor,measuredOn};
  }):keys.map(()=>null);
  const hasValue=values.some(value=>value>0), hasReference=references.some(Boolean);
  $('#trend-message').textContent=`最近${trendState.mode==='day'?'30天':'12个月'} · ${isGrowth && trendState.mode==='month'?`每月最后一次${growthName}`:isGrowth?`每日${growthName}`:'记录次数'} · 单位：${config.unit}`;
  if(!hasValue&&!hasReference){$('#trend-chart').innerHTML='<div class="trend-empty">这段时间还没有记录</div>';return;}
  const legend=isGrowth?`<div class="trend-legend"><span><i style="background:${config.color}"></i>实测${growthName}</span>${hasReference?'<span><i class="range-band"></i>参考范围</span>':''}</div><p class="trend-standard-note">仅作成长趋势参考，不用于诊断。</p>`:'';
  $('#trend-chart').innerHTML=`<div class="trend-plot"></div><p class="trend-detail" id="trend-detail"></p>${isGrowth?'<p class="trend-reference-detail" id="trend-reference-detail"></p>':''}${legend}`;
  const plot=$('#trend-chart .trend-plot'),mobile=matchMedia('(max-width:620px)').matches;
  const width=mobile?plot.clientHeight:plot.clientWidth,height=mobile?plot.clientWidth:plot.clientHeight,left=44,right=24,top=32,bottom=38,plotWidth=width-left-right,plotHeight=height-top-bottom;
  const referenceValues=references.filter(Boolean).flatMap(point=>[point.low,point.high]);
  const actualValues=values.filter(value=>value!==null&&value>0);
  const allValues=[...actualValues,...referenceValues],span=Math.max(...allValues)-Math.min(...allValues),padding=Math.max(span*.15,isWeight?.4:1);
  const min=isGrowth?Math.max(0,Math.min(...allValues)-padding):0,max=isGrowth?Math.max(...allValues)+padding:Math.max(2,Math.ceil(Math.max(...values)/2)*2),step=plotWidth/values.length,barWidth=Math.max(3,step*.62);
  const yFor=value=>top+plotHeight-(value-min)/(max-min)*plotHeight;
  const labelEvery=Math.ceil(values.length/(width<450?4:8));
  const label=(key)=>trendState.mode==='day'?`${Number(key.slice(5,7))}/${Number(key.slice(8))}`:`${Number(key.slice(5))}月`;
  const detail=(index)=>{const actual=values[index]===null?`未记录${growthName}`:isLength?`${values[index].toFixed(1)} 厘米`:isWeight?`${values[index].toFixed(2)} 斤（${Math.round(values[index]*500)} 克）`:`${values[index]} ${config.unit}`;const date=trendState.mode==='day'?formatDate(keys[index]):isGrowth&&values[index]!==null?formatDate(growthTrendDate(logs,trendState.kind,trendState.mode,keys[index])):`${keys[index].slice(0,4)}年${Number(keys[index].slice(5))}月`;return `${date}：${actual}`;};
  const lines=[0,.5,1].map(r=>{const y=top+plotHeight*(1-r);return `<line x1="${left}" y1="${y}" x2="${width-right}" y2="${y}" stroke="#e3e5dc"/><text x="${left-7}" y="${y+4}" text-anchor="end" fill="#6c796f" font-size="12">${(min+(max-min)*r).toFixed(isGrowth?1:0)}</text>`;}).join('');
  const lastLabelIndex=keys.length-1;
  const labels=keys.map((key,index)=>((index%labelEvery===0&&index!==lastLabelIndex-1)||index===lastLabelIndex)?`<text x="${left+(index+.5)*step}" y="${height-12}" text-anchor="middle" fill="#6c796f" font-size="11">${label(key)}</text>`:'').join('');
  const points=values.map((value,index)=>({value,index,x:left+(index+.5)*step,y:yFor(value||0)}));
  let shapes='';
  if(isGrowth) {
    // 每个日期用查表范围画一段，月龄变化时阶梯切换；单月也有完整面积。
    shapes=references.map((point,index)=>point?`<rect class="trend-reference-band" data-date="${point.measuredOn}" data-low="${point.low}" data-high="${point.high}" x="${left+index*step}" y="${yFor(point.high)}" width="${step}" height="${yFor(point.low)-yFor(point.high)}" fill="#c6d9b9" opacity=".65"/>`:'').join('');
    const valid=points.filter(point=>point.value!==null);
    shapes+=`<polyline points="${valid.map(p=>`${p.x},${p.y}`).join(' ')}" fill="none" stroke="${config.color}" stroke-width="2.5"/>`+valid.map(p=>`<circle cx="${p.x}" cy="${p.y}" r="4" fill="${config.color}"/>`).join('');
  } else shapes=points.filter(p=>p.value>0).map(p=>`<rect x="${p.x-barWidth/2}" y="${p.y}" width="${barWidth}" height="${top+plotHeight-p.y}" rx="2" fill="${config.color}"/>`).join('');
  const validIndexes=points.filter(p=>p.value!==null&&p.value>0).map(p=>p.index), labelIndexes=new Set(step<24?validIndexes.slice(-1):validIndexes);
  const valueText=points.filter(p=>labelIndexes.has(p.index)).map(p=>{const value=isLength?p.value.toFixed(1):isWeight?p.value.toFixed(2):String(p.value);return `<text class="trend-value" x="${p.x}" y="${Math.max(14,p.y-7)}" text-anchor="middle">${value}</text>`;}).join('');
  const hits=points.map(p=>`<g class="trend-point" data-point="${p.index}" role="button" tabindex="0" aria-label="${detail(p.index)}"><title>${detail(p.index)}</title><rect x="${left+p.index*step}" y="${top}" width="${step}" height="${plotHeight}" fill="transparent"/></g>`).join('');
  const latest=points.findLast(p=>p.value!==null && p.value>0);
  plot.innerHTML=`<svg class="trend-svg" style="width:${width}px;height:${height}px" viewBox="0 0 ${width} ${height}" aria-label="${config.title}">${lines}${labels}${shapes}${valueText}${hits}</svg>`;
  const updateDetail=index=>{
    $('#trend-detail').textContent=detail(index);
    if(isGrowth){const point=references[index];$('#trend-reference-detail').textContent=point?`参考范围：${point.low.toFixed(isWeight?2:1)}～${point.high.toFixed(isWeight?2:1)} ${config.unit}`:'';}
  };
  if(latest)updateDetail(latest.index);else $('#trend-detail').textContent='这段时间还没有实测记录';
  const showPoint=(event)=>{const point=event.target.closest('[data-point]');if(!point)return;if(event.type==='keydown'&&!['Enter',' '].includes(event.key))return;if(event.type==='keydown')event.preventDefault();updateDetail(Number(point.dataset.point));};
  $('#trend-chart').onclick=showPoint; $('#trend-chart').onkeydown=showPoint;
}
async function loadTrend() {
  const request=++trendState.request;trendState.logs=null; $('#trend-message').textContent='正在读取趋势…'; $('#trend-chart').innerHTML='';
  try { const logs=await api(`/api/logs?${trendQuery(trendState.mode)}`); if(request!==trendState.request)return; renderTrend(logs); }
  catch(error) { if(request===trendState.request) $('#trend-message').textContent=error.message; }
}
document.querySelectorAll('[data-trend]').forEach(button=>button.addEventListener('click',()=>{trendState.kind=button.dataset.trend;trendState.mode='day';$('#trend-title').textContent=trendConfig[trendState.kind].title;document.querySelectorAll('[data-trend-mode]').forEach(item=>item.setAttribute('aria-pressed',String(item.dataset.trendMode==='day')));$('#trend-dialog').showModal();loadTrend();}));
document.querySelector('.trend-modes').addEventListener('click',event=>{const button=event.target.closest('[data-trend-mode]');if(!button)return;trendState.mode=button.dataset.trendMode;document.querySelectorAll('[data-trend-mode]').forEach(item=>item.setAttribute('aria-pressed',String(item===button)));loadTrend();});
$('#close-trend').addEventListener('click',()=>$('#trend-dialog').close());
let trendResize;
window.addEventListener('resize',()=>{clearTimeout(trendResize);trendResize=setTimeout(()=>{if($('#trend-dialog').open&&trendState.logs)renderTrend(trendState.logs);},120);});
function updatePlanAmountSlider(){ const input=$('#plan-amount'); if(!input)return; const percent=((Number(input.value)-10)/(300-10))*100; input.style.background=`linear-gradient(90deg,var(--coral) ${percent}%,#eadfd7 ${percent}%,#eadfd7 100%)`; $('#plan-amount-output').textContent=`${input.value} 毫升`; }
function closeSettings() { $('#settings-drawer').classList.remove('open'); $('#settings-drawer').inert=true; $('#settings-drawer').setAttribute('aria-hidden','true'); $('#settings-toggle').focus(); }
function toggleBrandField(){updatePlanControls({type:'feeding-type',method:'breast-method',methodField:'breast-method-field',brandField:'formula-brand-field',stageField:'formula-stage-field',amountField:'drawer-amount-field',hint:'drawer-feeding-hint'});}
$('#feeding-type').addEventListener('change',toggleBrandField);$('#breast-method').addEventListener('change',toggleBrandField); $('#plan-amount').addEventListener('input',updatePlanAmountSlider); updatePlanAmountSlider();
$('#settings-toggle').addEventListener('click',()=>{ $('#settings-drawer').classList.add('open'); $('#settings-drawer').inert=false; $('#settings-drawer').setAttribute('aria-hidden','false'); $('#interval-hours').value=state.intervalHours; $('#plan-amount').value=Math.min(300,Math.max(10,state.amountMl)); updatePlanAmountSlider(); setPlanFeedingType('feeding-type',state.feedingType);$('#breast-method').value=state.breastMethod; $('#formula-brand').value=state.formulaBrand || ''; $('#formula-stage').value=state.formulaStage || 1; toggleBrandField(); $('#feeding-type input:checked').focus(); });
$('#settings-close').addEventListener('click',closeSettings);
document.addEventListener('keydown',event=>{if(event.key==='Escape' && $('#settings-drawer').classList.contains('open')) closeSettings();});
$('#settings-save').addEventListener('click',async event=>{
  if (!$('#interval-hours').reportValidity()) return;
  if (!$('#plan-amount').reportValidity()) return;
  const button=event.currentTarget; button.disabled=true;
  try { const data=await api('/api/settings',{method:'PUT',body:JSON.stringify({intervalHours:Number($('#interval-hours').value),amountMl:Number($('#plan-amount').value),feedingType:getPlanFeedingType('feeding-type'),breastMethod:$('#breast-method').value,formulaBrand:$('#formula-brand').value,formulaStage:Number($('#formula-stage').value)})}); state.summary=data.summary; state.intervalHours=data.intervalHours; state.amountMl=data.amountMl; state.feedingType=data.feedingType;state.breastMethod=data.breastMethod; state.formulaBrand=data.formulaBrand; state.formulaStage=data.formulaStage; render(); closeSettings(); showToast('喂奶计划已更新'); }
  catch(error) {showToast(error.message);} finally {button.disabled=false;}
});
$('#enable-notifications').addEventListener('click',async()=>{
  if(!('Notification' in window)||!window.isSecureContext) return showToast('当前浏览器或连接不支持系统通知，请查看页面提醒');
  try {const permission=await Notification.requestPermission(); showToast(permission==='granted'?'已开启通知，请保持页面打开':'未开启系统通知，仍可查看页面提醒'); render();} catch {showToast('系统通知不可用，请查看页面提醒');}
});
$('#refresh-logs').addEventListener('click',async event=>{const b=event.currentTarget; b.disabled=true;try {await load();showToast('记录已更新');} catch(e){showToast(e.message);} finally {b.disabled=false;}});
function makeFeedingExport() {
  const rows = [...state.logs.records].sort((a,b) => new Date(a.fed_at) - new Date(b.fed_at));
  if (!rows.length) throw new Error('还没有喂奶记录，暂时不能导出');
  const canvas = document.createElement('canvas'); const scale = 2; const width = 1000; const rowHeight = 66; const headerHeight = 150; const height = headerHeight + (rows.length + 1) * rowHeight + 40;
  canvas.width = width * scale; canvas.height = height * scale; const ctx = canvas.getContext('2d'); ctx.scale(scale, scale);
  ctx.fillStyle = '#fffefa'; ctx.fillRect(0,0,width,height);
  ctx.strokeStyle = 'rgba(110,145,126,.12)'; ctx.lineWidth = 1;
  for (let grid = 20; grid < width; grid += 28) { ctx.beginPath(); ctx.moveTo(grid, 0); ctx.lineTo(grid, height); ctx.stroke(); }
  for (let grid = 20; grid < height; grid += 28) { ctx.beginPath(); ctx.moveTo(0, grid); ctx.lineTo(width, grid); ctx.stroke(); }
  ctx.fillStyle = '#253b30'; ctx.font = '700 30px system-ui, sans-serif'; ctx.fillText('喂奶记录表', 56, 55);
  ctx.fillStyle = '#6c796f'; ctx.font = '18px system-ui, sans-serif'; ctx.fillText(`记录日期：${$('#logs-from').value} 至 ${$('#logs-to').value}`, 56, 92);
  const top = headerHeight;
  ctx.fillStyle = '#fffefa'; ctx.fillRect(40, top, width - 80, (rows.length + 1) * rowHeight);
  ctx.fillStyle = '#eaf0e5'; ctx.fillRect(40, top, width - 80, rowHeight); ctx.fillStyle = '#253b30'; ctx.font = '600 20px system-ui, sans-serif'; ctx.fillText('日期和时间', 75, top + 41); ctx.fillText('喂奶量', 735, top + 41); ctx.textBaseline = 'middle';
  rows.forEach((row,index) => { const y = top + rowHeight * (index + 1); ctx.strokeStyle = '#e3e5dc'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(40,y); ctx.lineTo(width-40,y); ctx.stroke(); const date = new Date(row.fed_at); ctx.fillStyle = '#253b30'; ctx.font = '18px system-ui, sans-serif'; ctx.fillText(`${new Intl.DateTimeFormat('zh-CN',{year:'numeric',month:'2-digit',day:'2-digit'}).format(date)}  ${formatTime(row.fed_at)}`,75,y+rowHeight/2); ctx.fillStyle = '#496c57'; ctx.font = '600 20px system-ui, sans-serif'; ctx.fillText(exportFeedingAmount(row),735,y+rowHeight/2); });
  ctx.textBaseline = 'alphabetic'; ctx.fillStyle = '#6c796f'; ctx.font = '15px system-ui, sans-serif'; ctx.fillText('宝宝日常 · 仅包含时间和喂奶量', 56, height - 18);
  const exportedAt = new Date(); const pad = value => String(value).padStart(2, '0');
  const stamp = `${exportedAt.getFullYear()}${pad(exportedAt.getMonth()+1)}${pad(exportedAt.getDate())}-${pad(exportedAt.getHours())}${pad(exportedAt.getMinutes())}${pad(exportedAt.getSeconds())}`;
  const babyName = (state.baby?.name || '宝宝').replace(/[\\/:*?"<>|]/g, '').trim() || '宝宝';
  const filename = `${stamp}-${babyName}-喂奶记录表.png`;
  const dataUrl = canvas.toDataURL('image/png'); const binary = atob(dataUrl.split(',')[1]); const bytes = new Uint8Array(binary.length); for (let index=0; index<binary.length; index++) bytes[index]=binary.charCodeAt(index);
  return { blob: new Blob([bytes], {type:'image/png'}), filename };
}
$('#export-feeding').addEventListener('click', async event => {
  const button = event.currentTarget; button.disabled = true;
  try { const {blob,filename}=makeFeedingExport(); const link=document.createElement('a'); link.download=filename; link.href=URL.createObjectURL(blob); link.click(); setTimeout(()=>URL.revokeObjectURL(link.href),1000); showToast('喂奶表图片已下载'); }
  catch(error) { showToast(error.message); }
  finally { button.disabled = false; }
});
$('#share-feeding').addEventListener('click', async event => {
  if (!navigator.share) return showToast('当前浏览器不支持直接转发，请先下载图片再发送');
  const button = event.currentTarget; button.disabled = true;
  try {
    const {blob,filename}=makeFeedingExport(); const file=new File([blob],filename,{type:'image/png'});
    if (navigator.canShare && !navigator.canShare({files:[file]})) throw new Error('当前浏览器不支持图片转发，请先下载图片再发送');
    await navigator.share({title:'喂奶记录表',text:'宝宝的喂奶记录表',files:[file]}); showToast('已打开分享面板');
  } catch(error) { if (error.name !== 'AbortError') showToast(error.message || '暂时无法转发，请先下载图片'); }
  finally { button.disabled = false; }
});
load().catch(error=>{$('#load-message').textContent=error.message+'，请点“刷新记录”重试';});
const saved=new URLSearchParams(location.search).get('saved');
if(saved) {showToast(({feeding:'这次喂奶已记录',weight:'体重已保存',length:'身长已保存',abnormal:'异常情况已记录',stool:'便便记录已保存',diaper:'湿尿布记录已保存',medication:'用药记录已保存'})[saved]||'记录已保存'); history.replaceState(null,'','/');}
if(new URLSearchParams(location.search).has('updated')){showToast('修改已保存');history.replaceState(null,'','/#records');}
setInterval(()=>load().catch(()=>{$('#load-message').textContent='暂时连接不上，显示上次同步的记录。';}),20000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)load().catch(e=>showToast(e.message));});
