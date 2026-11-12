import { feedingValue, exportFeedingAmount, feedingMethodIcons, updatePlanControls, getPlanFeedingType, setPlanFeedingType } from '/feeding-options.js';
import { abnormalCategories, abnormalDetails } from '/abnormal-options.js';
import { milkReference, milkStatus, nutritionPdfUrl } from '/nutrition.js';
import { trendKeys, trendQuery, trendValue } from '/trends.js';
import { $, localInputValue, formatDate, formatTime, showToast, api, babyAge } from '/shared.js';
const state = { records: [], stools: [], diapers: [], medications: [], medicationPlans: [], weights: [], lengths: [], summary: null, intervalHours: 3, amountMl: 120, feedingType: 'formula', breastMethod:'direct', formulaBrand: '', formulaStage: 1, baby: null, filter: 'all', logs: { records: [], weights: [], lengths: [], abnormalities: [], stools: [], diapers: [], medications: [] } };
let notifiedAt = null;
function renderHomeView() {
  const records=location.hash==='#records';
  $('#overview-panel').hidden=records;
  $('#records-panel').hidden=!records;
  document.querySelectorAll('[data-home-view]').forEach(button=>{
    const active=(button.dataset.homeView==='records')===records;
    button.setAttribute('aria-selected',String(active));button.tabIndex=active?0:-1;
  });
}
$('.home-tabs').addEventListener('click',event=>{
  const button=event.target.closest('[data-home-view]');if(!button)return;
  location.hash=button.dataset.homeView==='records'?'records':'overview';renderHomeView();
});
$('.home-tabs').addEventListener('keydown',event=>{
  if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
  event.preventDefault();
  const buttons=[...document.querySelectorAll('[data-home-view]')];
  const target=event.key==='Home'?buttons[0]:event.key==='End'?buttons[1]:buttons.find(button=>button!==document.activeElement);
  target.focus();target.click();
});
window.addEventListener('hashchange',renderHomeView);renderHomeView();
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
  const plans=state.medicationPlans.filter(plan=>plan.enabled).sort((a,b)=>Date.parse(a.nextAt)-Date.parse(b.nextAt));
  const medicationList=$('#next-medication-list');medicationList.replaceChildren();
  if(!plans.length){const hint=document.createElement('p');hint.className='muted';hint.textContent='尚未启用用药计划，可按需要配置。';medicationList.append(hint);}
  for(const plan of plans){const item=document.createElement('div');item.className='next-medication-item';const name=document.createElement('strong');name.textContent=`${plan.name} · ${plan.dose} ${plan.unit}`;const time=document.createElement('p');time.className='medication-reference-time';time.textContent=`${formatDate(plan.nextAt)} ${formatTime(plan.nextAt)}`;const status=document.createElement('p');status.className='muted';status.textContent=Date.parse(plan.nextAt)<=Date.now()?'参考时间已到，请核对用药记录':'时间仅作参考，按医嘱用药';const link=document.createElement('a');link.className='secondary-button medication-record-link';link.href=`/medication.html?plan=${plan.id}`;link.textContent='记用药';item.append(name,time,status,link);medicationList.append(item);}

  $('#today-label').textContent = new Intl.DateTimeFormat('zh-CN', {year:'numeric',month:'long',day:'numeric',weekday:'long'}).format(new Date());
  $('#dashboard-title').textContent = baby?.name ? `${baby.name}的今天` : '宝宝的今天';
  $('#brand-name').textContent = baby?.name ? `${baby.name}日常` : '宝宝日常';
  $('#baby-age').textContent = baby?.birthday ? `出生 ${babyAge(baby.birthday)} · 一天一点，小小成长。` : '在宝宝档案里填上名字和生日，开启专属记录。';
  $('#today-count').textContent = summary?.todayRecordedCount ?? summary?.todayCount ?? 0;
  $('#today-amount').textContent = summary?.todayRecordedAmount ?? summary?.todayAmount ?? 0;
  $('#today-average').textContent = summary?.todayAverageIntervalHours ? `今日平均每 ${Number(summary.todayAverageIntervalHours).toFixed(1)} 小时喂一次` : '今日记录两次后显示平均间隔';
  $('#last24-amount').textContent=summary?.last24HoursAmount??0;
  $('#last24-count').textContent=summary?.last24HoursCount??0;
  const reference=milkReference(baby?.birthday,state.feedingType),rollingStatus=milkStatus(summary?.last24HoursAmount??0,reference,{period:'rolling',directCount:summary?.last24HoursDirectCount??0});
  $('#rolling-status').textContent=rollingStatus.label;$('#rolling-status').dataset.level=rollingStatus.level;
  $('#today-direct').textContent=summary?.todayDirectCount?`含亲喂 ${summary.todayDirectCount} 次，奶量未计量`:'';
  $('#rolling-direct').textContent=summary?.last24HoursDirectCount?`含亲喂 ${summary.last24HoursDirectCount} 次，奶量未计量`:'';
  for(const [id,direct,count] of [['today',summary?.todayDirectCount,summary?.todayRecordedCount],['last24',summary?.last24HoursDirectCount,summary?.last24HoursCount]]){
    const unmeasured=direct>0&&direct===count;
    document.getElementById(id+'-amount').parentElement.classList.toggle('unmeasured',unmeasured);
    document.getElementById(id+'-amount').parentElement.querySelector('small').textContent=direct>0?'毫升（仅瓶喂）':'毫升';
    if(unmeasured)document.getElementById(id+'-amount').textContent='未计量';
  }
  $('#milk-stage').textContent=reference.stage;
  $('#milk-range').textContent=reference.min===null?'按需喂养，结合生长观察':`每日参考 ${reference.min}～${reference.max} 毫升`;
  $('#nutrition-stage').textContent=`当前参考：${reference.stage}${reference.min===null?'':`，每日 ${reference.min}～${reference.max} 毫升`}。${reference.page||''}`;
  $('#nutrition-reason').textContent=reference.reason;
  $('#nutrition-source').href=nutritionPdfUrl;
  $('#today-diaper-count').textContent = summary?.todayDiaperCount ?? 0;
  $('#today-stool-count').textContent = summary?.todayStoolCount ?? 0;
  if (weights.length) {
    $('#latest-weight').innerHTML = `${(weights[0].weight_grams / 500).toFixed(2)}<small>斤</small><em>${weights[0].weight_grams} 克</em>`;
    const change = weights.length > 1 ? weights[0].weight_grams - weights[1].weight_grams : null;
    $('#weight-change').textContent = change === null ? '暂无上次体重可对比' : change === 0 ? '与上次体重相同' : `比上次${change > 0 ? '重' : '轻'} ${(Math.abs(change) / 500).toFixed(2)} 斤（${Math.abs(change)} 克）`;
    $('#weight-helper').textContent = `${formatDate(`${weights[0].measured_on}T12:00:00`)}记录${weights[0].measured_on === localInputValue().slice(0,10) ? ' · 今天已称重' : ''}`;
  } else { $('#latest-weight').textContent = '—'; $('#weight-change').textContent = ''; $('#weight-helper').textContent = '今天称了吗？记一下吧'; }
  if (lengths.length) {
    $('#latest-length').innerHTML = `${(lengths[0].length_mm / 10).toFixed(1)}<small>厘米</small>`;
    const change = lengths.length > 1 ? lengths[0].length_mm - lengths[1].length_mm : null;
    $('#length-change').textContent = change === null ? '暂无上次身长可对比' : change === 0 ? '与上次身长相同' : `比上次${change > 0 ? '长' : '短'} ${(Math.abs(change)/10).toFixed(1)} 厘米`;
    $('#length-helper').textContent = `${formatDate(`${lengths[0].measured_on}T12:00:00`)}测量`;
  } else { $('#latest-length').textContent = '—'; $('#length-change').textContent = ''; $('#length-helper').textContent = '量一量，记下宝宝的成长'; }
  if (summary?.nextAt) {
    const next = new Date(summary.nextAt), now = new Date();
    $('#next-time').textContent = formatTime(next);
    const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const day = next.toDateString() === now.toDateString() ? '今天' : next.toDateString() === tomorrow.toDateString() ? '明天' : '';
    $('#next-date').hidden = false;
    $('#next-date').textContent = `${day ? day + ' · ' : ''}${new Intl.DateTimeFormat('zh-CN', {year:'numeric',month:'long',day:'numeric'}).format(next)}`;
    const elapsed = summary.latest?.fed_at ? `距上次喂奶 ${relativeHours(now - new Date(summary.latest.fed_at))}` : '';
    $('#next-helper').textContent = elapsed;
    $('#next-card').classList.remove('is-due');
    if (next <= now && 'Notification' in window && Notification.permission === 'granted' && notifiedAt !== summary.nextAt) {
      try { new Notification('宝宝日常 · 喂奶时间参考', {body:'按当前计划估算的时间已到，仅供参考，请按宝宝状态和需要喂奶。',tag:'babycare-feeding'}); notifiedAt = summary.nextAt; } catch { /* Keep page reminder. */ }
    }
  } else { $('#next-date').hidden = true; $('#next-time').textContent = '等待第一笔'; $('#next-helper').textContent = '记下喂奶后，显示距上次喂奶的时间'; $('#next-card').classList.remove('is-due'); }
  renderLogs();
}
function renderLogs() {
  const feedingRows = [...new Map([...state.records, ...state.logs.records].map(row => [row.id, row])).values()].sort((a,b) => new Date(a.fed_at) - new Date(b.fed_at));
  const feedingIntervals = new Map();
  feedingRows.forEach((row, index) => { if (index > 0) feedingIntervals.set(row.id, Date.parse(row.fed_at) - Date.parse(feedingRows[index - 1].fed_at)); });
  const logs = [
    ...state.logs.records.map(r => ({...r, type:'feeding', at:r.fed_at, label:'喂奶', value:feedingValue(r), note:r.note, interval:feedingIntervals.get(r.id)})),
    ...state.logs.weights.map(r => ({...r, type:'weight', at:`${r.measured_on}T12:00:00`, label:'称重', value:`${(r.weight_grams/500).toFixed(2)} 斤 · ${r.weight_grams} 克`, note:'每日体重记录'})),
    ...state.logs.lengths.map(r => ({...r, type:'length', at:`${r.measured_on}T12:00:00`, label:'身长', value:`${(r.length_mm/10).toFixed(1)} 厘米`, note:'身长记录'})),
    ...state.logs.stools.map(r => ({...r, type:'stool', at:r.occurred_at, label:'便便', value:r.has_photo?'已拍照记录':'已记录', note:r.note})),
    ...state.logs.diapers.map(r => ({...r, type:'diaper', at:r.occurred_at, label:'换尿布', value:'已更换', note:r.note})),
    ...state.logs.medications.map(r => ({...r, type:'medication', at:r.occurred_at, label:'用药', value:r.medicines.map(item=>item.dose?`${item.name} ${item.dose}${item.unit?` ${item.unit}`:''}`:item.name).join('、'), note:r.note, has_photo:r.has_photo})),
    ...state.logs.abnormalities.map(r => ({...r, type:'abnormal', at:r.occurred_at, label:'异常', value:r.observations.map(item=>abnormalCategories.find(category=>category.id===item.category)?.label||'异常').join('、'), details:abnormalDetails(r.observations), note:r.note}))
  ].filter(r => state.filter === 'all' || r.type === state.filter).sort((a,b) => new Date(b.at)-new Date(a.at));
  $('#record-list').innerHTML = logs.length ? logs.map(r => `<article class="daily-log log-${r.type}">
    <span class="log-symbol" aria-hidden="true">${r.type === 'feeding' ? (feedingMethodIcons[r.feeding_method] || '🍼') : r.type === 'weight' ? '⚖️' : r.type === 'stool' ? '💩' : r.type === 'length' ? '📏' : r.type === 'abnormal' ? '🩺' : r.type === 'medication' ? '💊' : '<img src="/diaper.svg" alt="">'}</span>
    <div class="log-content"><div class="log-title"><strong>${r.label}</strong><span>${escapeHtml(r.value)}</span></div><p class="log-date">${formatDate(r.at, {weekday:'short'})}${r.type === 'weight' ? ' · 当天称重' : r.type === 'length' ? ' · 当天测量' : ` · ${formatTime(r.at)}`}</p>${r.type === 'feeding' && r.interval !== undefined ? `<p class="log-interval">距上次喂奶 ${feedingInterval(r.interval)}</p>` : ''}${r.details ? `<div class="abnormal-log-details">${r.details.map(detail=>`<p>${escapeHtml(detail)}</p>`).join('')}</div>` : ''}${r.note ? `<p class="log-note">${escapeHtml(r.note)}</p>` : ''}${r.type === 'stool' && r.has_photo ? `<button type="button" class="photo-thumb" data-photo="${r.id}" aria-label="查看这次便便的照片"><img src="/api/stools/${r.id}/photo" alt="便便照片缩略图" loading="lazy"><span>查看照片 ↗</span></button>` : ''}${r.type === 'abnormal' && r.has_photo ? `<button type="button" class="photo-thumb" data-abnormal-photo="${r.id}" aria-label="查看这次异常的照片"><img src="/api/abnormalities/${r.id}/photo" alt="异常照片缩略图" loading="lazy"><span>查看照片 ↗</span></button>` : ''}${r.type === 'medication' && r.has_photo ? `<button type="button" class="photo-thumb" data-medication-photo="${r.id}" aria-label="查看这次用药的照片"><img src="/api/medications/${r.id}/photo" alt="用药照片缩略图" loading="lazy"><span>查看照片 ↗</span></button>` : ''}</div>
    <button class="delete-log" type="button" data-type="${r.type}" data-delete="${r.id}" aria-label="删除${formatDate(r.at)}的${r.label}记录">删除</button>
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
for (const id of ['#logs-from','#logs-to']) $(id).addEventListener('change',()=>{updateDateShortcutState();loadLogs().catch(()=>{});});
$('#recent-days').addEventListener('click',()=>{defaultDates();loadLogs().catch(()=>{});});
$('#today-only').addEventListener('click',()=>{todayDates();loadLogs().catch(()=>{});});
async function load() {
  const [feeding, profile, growth, stools, diapers, lengths, medications, medicationPlans] = await Promise.all([api('/api/records'),api('/api/baby'),api('/api/weights'),api('/api/stools'),api('/api/diapers'),api('/api/lengths'),api('/api/medications'),api('/api/medication-plans')]);
  state.records=feeding.records; state.summary=feeding.summary; state.intervalHours=feeding.summary.intervalHours; state.amountMl=feeding.summary.amountMl; state.feedingType=feeding.summary.feedingType; state.breastMethod=feeding.summary.breastMethod||'direct'; state.formulaBrand=feeding.summary.formulaBrand; state.formulaStage=feeding.summary.formulaStage; state.baby=profile.baby; state.weights=growth.weights; state.lengths=lengths.lengths; state.stools=stools.stools; state.diapers=diapers.diapers; state.medications=medications.medications;state.medicationPlans=medicationPlans.plans;
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
$('#nutrition-info').addEventListener('click',()=>$('#nutrition-dialog').showModal());
$('#close-nutrition').addEventListener('click',()=>$('#nutrition-dialog').close());
const trendConfig = {
  feeding: {title:'喂奶趋势', unit:'次', color:'#bd5b3b'},
  weight: {title:'体重趋势', unit:'斤', color:'#496c57'},
  length: {title:'身长趋势', unit:'厘米', color:'#7d648e'},
  diaper: {title:'换尿布趋势', unit:'次', color:'#49646c'},
  stool: {title:'拉臭臭趋势', unit:'次', color:'#85652c'}
};
const trendState = {kind:'feeding', mode:'day', request:0};
function renderTrend(logs) {
  const config=trendConfig[trendState.kind], keys=trendKeys(trendState.mode), values=keys.map(key=>trendValue(logs,trendState.kind,trendState.mode,key));
  const hasValue=values.some(value=>value>0);
  const isWeight=trendState.kind==='weight', isLength=trendState.kind==='length', isGrowth=isWeight||isLength;
  const growthName=isWeight?'体重':'身长';
  $('#trend-message').textContent=`最近${trendState.mode==='day'?'30天':'12个月'} · ${isGrowth && trendState.mode==='month'?`每月最后一次${growthName}`:isGrowth?`每日${growthName}`:'记录次数'} · 单位：${config.unit}`;
  if(!hasValue){$('#trend-chart').innerHTML='<div class="trend-empty">这段时间还没有记录</div>';return;}
  const width=Math.max(300,$('#trend-chart').clientWidth-20),height=220,left=34,right=12,top=28,bottom=34,plotWidth=width-left-right,plotHeight=height-top-bottom;
  const max=isGrowth?Math.max(...values,1):Math.max(2,Math.ceil(Math.max(...values)/2)*2),step=plotWidth/values.length,barWidth=Math.max(3,step*.62);
  const labelEvery=Math.ceil(values.length/(width<450?4:8));
  const label=(key)=>trendState.mode==='day'?`${Number(key.slice(5,7))}/${Number(key.slice(8))}`:`${Number(key.slice(5))}月`;
  const detail=(index)=>`${keys[index].replace(/-/g,'/')}：${values[index]===null?`未记录${growthName}`:isLength?`${values[index].toFixed(1)} 厘米`:isWeight?`${values[index].toFixed(2)} 斤（${Math.round(values[index]*500)} 克）`:`${values[index]} 次`}`;
  const lines=[0,.5,1].map(r=>{const y=top+plotHeight*(1-r);return `<line x1="${left}" y1="${y}" x2="${width-right}" y2="${y}" stroke="#e3e5dc"/><text x="${left-7}" y="${y+4}" text-anchor="end" fill="#6c796f" font-size="12">${(max*r).toFixed(isGrowth?1:0)}</text>`;}).join('');
  const lastLabelIndex=keys.length-1;
  const labels=keys.map((key,index)=>((index%labelEvery===0&&index!==lastLabelIndex-1)||index===lastLabelIndex)?`<text x="${left+(index+.5)*step}" y="${height-12}" text-anchor="middle" fill="#6c796f" font-size="11">${label(key)}</text>`:'').join('');
  const points=values.map((value,index)=>({value,index,x:left+(index+.5)*step,y:top+plotHeight-(value||0)/max*plotHeight}));
  let shapes='';
  if(isGrowth) {
    const valid=points.filter(point=>point.value!==null);
    shapes=`<polyline points="${valid.map(p=>`${p.x},${p.y}`).join(' ')}" fill="none" stroke="${config.color}" stroke-width="2.5"/>`+valid.map(p=>`<circle cx="${p.x}" cy="${p.y}" r="4" fill="${config.color}"/>`).join('');
  } else shapes=points.filter(p=>p.value>0).map(p=>`<rect x="${p.x-barWidth/2}" y="${p.y}" width="${barWidth}" height="${top+plotHeight-p.y}" rx="2" fill="${config.color}"/>`).join('');
  const validIndexes=points.filter(p=>p.value!==null&&p.value>0).map(p=>p.index);
  const labelIndexes=new Set(step<24?validIndexes.slice(-1):validIndexes);
  const valueText=points.filter(p=>labelIndexes.has(p.index)).map(p=>{const value=isLength?p.value.toFixed(1):isWeight?p.value.toFixed(2):String(p.value);return `<text class="trend-value" x="${p.x}" y="${Math.max(14,p.y-7)}" text-anchor="middle">${value}</text>`;}).join('');
  const hits=points.map(p=>`<g class="trend-point" data-point="${p.index}" role="button" tabindex="0" aria-label="${detail(p.index)}"><title>${detail(p.index)}</title><rect x="${left+p.index*step}" y="${top}" width="${step}" height="${plotHeight}" fill="transparent"/></g>`).join('');
  const latest=points.findLast(p=>p.value!==null && p.value>0);
  $('#trend-chart').innerHTML=`<svg class="trend-svg" viewBox="0 0 ${width} ${height}" aria-label="${config.title}">${lines}${labels}${shapes}${valueText}${hits}</svg><p class="trend-detail" id="trend-detail">${latest?detail(latest.index):''}</p><p class="trend-help">点按图中日期查看数值${isGrowth?'；未测量的日期不计为零':''}</p>`;
  const showPoint=(event)=>{const point=event.target.closest('[data-point]');if(!point)return;if(event.type==='keydown'&&!['Enter',' '].includes(event.key))return;if(event.type==='keydown')event.preventDefault();$('#trend-detail').textContent=detail(Number(point.dataset.point));};
  $('#trend-chart').onclick=showPoint; $('#trend-chart').onkeydown=showPoint;
}
async function loadTrend() {
  const request=++trendState.request; $('#trend-message').textContent='正在读取趋势…'; $('#trend-chart').innerHTML='';
  try { const logs=await api(`/api/logs?${trendQuery(trendState.mode)}`); if(request!==trendState.request)return; renderTrend(logs); }
  catch(error) { if(request===trendState.request) $('#trend-message').textContent=error.message; }
}
document.querySelectorAll('[data-trend]').forEach(button=>button.addEventListener('click',()=>{trendState.kind=button.dataset.trend;trendState.mode='day';$('#trend-title').textContent=trendConfig[trendState.kind].title;document.querySelectorAll('[data-trend-mode]').forEach(item=>item.setAttribute('aria-pressed',String(item.dataset.trendMode==='day')));$('#trend-dialog').showModal();loadTrend();}));
document.querySelector('.trend-modes').addEventListener('click',event=>{const button=event.target.closest('[data-trend-mode]');if(!button)return;trendState.mode=button.dataset.trendMode;document.querySelectorAll('[data-trend-mode]').forEach(item=>item.setAttribute('aria-pressed',String(item===button)));loadTrend();});
$('#close-trend').addEventListener('click',()=>$('#trend-dialog').close());
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
if(saved) {showToast(({feeding:'这次喂奶已记录',weight:'体重已保存',length:'身长已保存',abnormal:'异常情况已记录',stool:'便便记录已保存',diaper:'换尿布时间已保存',medication:'用药记录已保存'})[saved]||'记录已保存'); history.replaceState(null,'','/');}
setInterval(()=>load().catch(()=>{$('#load-message').textContent='暂时连接不上，显示上次同步的记录。';}),20000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)load().catch(e=>showToast(e.message));});
