const MAX_MS=86400000;

// 用时间戳计算，切到后台后不依赖浏览器每秒回调；同一时刻只计一侧。
export class NursingTimer {
  constructor(draft=null,now=Date.now()) {
    this.leftMs=0;this.rightMs=0;this.active=null;this.since=null;this.startedAt=null;
    if(draft?.version===1&&['leftMs','rightMs'].every(key=>Number.isFinite(draft[key])&&draft[key]>=0)&&draft.leftMs+draft.rightMs<=MAX_MS&&
      [null,'left','right'].includes(draft.active)&&(draft.active===null||Number.isFinite(draft.since)&&draft.since<=now)&&
      (draft.startedAt===null||Number.isFinite(draft.startedAt)&&draft.startedAt<=now)) {
      Object.assign(this,{leftMs:draft.leftMs,rightMs:draft.rightMs,active:draft.active,since:draft.since,startedAt:draft.startedAt});
      if(this.totalMs(now)>MAX_MS)this.pause(now);
    }
  }
  totalMs(now=Date.now()){return this.leftMs+this.rightMs+(this.active?Math.max(0,now-this.since):0);}
  values(now=Date.now()) {
    const extra=this.active?Math.min(Math.max(0,now-this.since),Math.max(0,MAX_MS-this.leftMs-this.rightMs)):0;
    return {leftSeconds:Math.floor((this.leftMs+(this.active==='left'?extra:0))/1000),rightSeconds:Math.floor((this.rightMs+(this.active==='right'?extra:0))/1000)};
  }
  pause(now=Date.now()) {
    if(this.active){const key=`${this.active}Ms`;this[key]+=Math.min(Math.max(0,now-this.since),Math.max(0,MAX_MS-this.leftMs-this.rightMs));}
    this.active=null;this.since=null;
  }
  start(side,now=Date.now()) {
    if(!['left','right'].includes(side))return;
    this.pause(now);if(this.totalMs(now)>=MAX_MS)return;
    this.active=side;this.since=now;this.startedAt??=now;
  }
  setSeconds(side,seconds,now=Date.now()) {
    if(!['left','right'].includes(side)||!Number.isInteger(seconds)||seconds<0)return false;
    this.pause(now);
    if(seconds*1000+this[side==='left'?'rightMs':'leftMs']>MAX_MS)return false;
    this[`${side}Ms`]=seconds*1000;return true;
  }
  reset(){this.leftMs=0;this.rightMs=0;this.active=null;this.since=null;this.startedAt=null;}
  draft(){return {version:1,leftMs:this.leftMs,rightMs:this.rightMs,active:this.active,since:this.since,startedAt:this.startedAt};}
}

export function formatNursingDuration(seconds) {
  const value=Math.max(0,Math.floor(Number(seconds)||0)),minutes=Math.floor(value/60),rest=value%60;
  return `${minutes} 分${rest?` ${rest} 秒`:''}`;
}

export function setupNursingTimer(form,onFirstStart,edit=null) {
  const key=edit?`babycare-nursing-edit-${edit.id}`:'babycare-nursing-timer-v1',root=document.querySelector('#nursing-timer');let draft;
  try{draft=JSON.parse(localStorage.getItem(key));}catch{}
  if(!draft&&edit)draft={version:1,leftMs:(edit.record.left_duration_seconds||0)*1000,rightMs:(edit.record.right_duration_seconds||0)*1000,active:null,since:null,startedAt:null};
  const timer=new NursingTimer(draft);
  const persist=()=>{try{if(timer.startedAt===null&&timer.leftMs+timer.rightMs===0)localStorage.removeItem(key);else localStorage.setItem(key,JSON.stringify(timer.draft()));}catch{}};
  const render=()=>{
    const values=timer.values();
    for(const side of ['left','right']){
      const seconds=values[`${side}Seconds`],output=root.querySelector(`[data-timer-value=${side}]`),button=root.querySelector(`[data-timer-side=${side}]`);
      output.textContent=`${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;
      button.setAttribute('aria-pressed',String(timer.active===side));
      button.textContent=timer.active===side?'暂停计时':seconds>0?'继续计时':'开始计时';
      button.setAttribute('aria-label',`${side==='left'?'左':'右'}侧乳房${button.textContent}`);
    }
    root.querySelector('[data-timer-total]').textContent=`合计 ${formatNursingDuration(values.leftSeconds+values.rightSeconds)}`;
  };
  for(const button of root.querySelectorAll('[data-timer-side]'))button.addEventListener('click',()=>{
    if(timer.active===button.dataset.timerSide)timer.pause();
    else {const first=timer.startedAt===null;timer.start(button.dataset.timerSide);if(first)onFirstStart?.(timer.startedAt);}
    persist();render();
  });
  const pause=()=>{timer.pause();persist();render();};
  root.querySelector('[data-timer-reset]').addEventListener('click',()=>{
    if(!confirm('确定清空本次左右侧计时吗？'))return;
    timer.reset();for(const input of root.querySelectorAll('[data-timer-minutes]'))input.value='';persist();render();
  });
  const manual=root.querySelector('details');
  manual.addEventListener('toggle',()=>{if(manual.open){pause();const values=timer.values();for(const input of root.querySelectorAll('[data-timer-minutes]'))input.value=values[`${input.dataset.timerMinutes}Seconds`]?(values[`${input.dataset.timerMinutes}Seconds`]/60).toFixed(1):'';}});
  for(const input of root.querySelectorAll('[data-timer-minutes]')){
  input.addEventListener('input',()=>input.setCustomValidity(''));
  input.addEventListener('change',()=>{
    const value=Number(input.value);
    if(!Number.isFinite(value)||value<0||!timer.setSeconds(input.dataset.timerMinutes,Math.round(value*60))){input.setCustomValidity('左右侧合计不能超过1440分钟');input.reportValidity();return;}
    input.setCustomValidity('');persist();render();
  });}
  setInterval(()=>{if(timer.active){if(timer.totalMs()>=MAX_MS)pause();render();}},1000);
  window.addEventListener('pagehide',persist);
  window.addEventListener('pageshow',()=>render());
  document.addEventListener('visibilitychange',render);
  render();
  return {hasDraft:timer.startedAt!==null||timer.leftMs+timer.rightMs>0,startedAt:timer.startedAt,
    pause,setVisible(visible){root.hidden=!visible;for(const input of root.querySelectorAll('input'))input.disabled=!visible;if(!visible)pause();},
    payload(){pause();const values=timer.values();return values.leftSeconds+values.rightSeconds>0?{leftDurationSeconds:values.leftSeconds,rightDurationSeconds:values.rightSeconds}:{};},
    clear(){timer.reset();try{localStorage.removeItem(key);}catch{}}};
}
