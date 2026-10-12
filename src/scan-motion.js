// 派单362方案A。所有装饰共用这一处；业务动作不依赖动画完成。
const active=new Set(),scans=new Map();
const priority={hover:0,read:1,route:2,panel:3,success:4};
let query,lastTrigger=null,routeAt=0,inputAt=-1;
export const SCAN_EASE='cubic-bezier(.4,0,.6,1)';
export function reducedMotion(){try{return matchMedia('(prefers-reduced-motion: reduce)').matches;}catch{return true;}}
export function trackDecoration(cancel){
  try{if(!query){query=matchMedia('(prefers-reduced-motion: reduce)');query.addEventListener('change',()=>{if(query.matches)for(const stop of [...active]){try{stop();}catch{}}});}}catch{}
  active.add(cancel);return()=>active.delete(cancel);
}
export function noteInput(){inputAt=performance.now();}
export function motionOrigin(){try{return lastTrigger?.isConnected?lastTrigger:document.activeElement;}catch{return null;}}
function visible(rect){return rect?.width>0&&rect.height>0&&rect.bottom>0&&rect.top<innerHeight&&rect.right>0&&rect.left<innerWidth;}
function overlaps(a,b){return Math.max(0,a.left,b.left)<Math.min(innerWidth,a.right,b.right)&&Math.max(0,a.top,b.top)<Math.min(innerHeight,a.bottom,b.bottom);}
export function scanReveal(target,{duration=440,delay=0,kind='route',reveal=true,success=false}={}){
  let overlay,release,animations=[],finished=false;
  const stop=()=>{if(finished)return;finished=true;animations.forEach(a=>{try{a.cancel();}catch{}});overlay?.remove();release?.();if(scans.get(target)?.stop===stop)scans.delete(target);};
  try{
    if(!target?.isConnected||reducedMotion()||typeof target.animate!=='function')return stop;
    // 进入页面后，只有用户之后亲手触发的读取（如手动刷新）才扫；页面自己发起的首读/自动重读不再补第二道线。
    if(kind==='read'&&inputAt<routeAt)return stop;
    const rect=target.getBoundingClientRect();if(!visible(rect))return stop;
    // 先协调再取消：同一区域保留高优先级/外层扫描，兼容内层先开始。
    for(const [el,scan] of scans)if(!el.isConnected)scan.stop();
    const related=[...scans].filter(([el,scan])=>el===target||el.contains?.(target)||target.contains?.(el)||overlaps(rect,scan.rect));
    if(related.some(([el,scan])=>priority[scan.kind]>priority[kind]||(scan.kind===kind&&el.contains?.(target)&&(el!==target||kind==='read'))))return stop;
    for(const [,scan] of related)scan.stop();
    overlay=document.createElement('div');overlay.className='scan-surface'+(kind==='hover'?' scan-hover':'')+(success?' scan-success':'');overlay.dataset.scanKind=kind;overlay.setAttribute('aria-hidden','true');
    // 只扫屏幕内可见的一段，线与内容显现用同一像素位置；内容随后变高/变矮也不再两道边缘异速。
    // 切页时页面内容常在下一帧才长出来，所以切页固定扫满可见屏幕；其他时刻按目标本身高度。
    const h=kind==='route'?innerHeight-rect.top:Math.min(rect.height,innerHeight-rect.top);
    Object.assign(overlay.style,{left:rect.left+'px',top:rect.top+'px',width:rect.width+'px',height:h+'px',borderRadius:getComputedStyle(target).borderRadius});
    const tail=document.createElement('i'),line=document.createElement('i');tail.className='scan-tail';line.className='scan-line';overlay.append(tail,line);document.body.append(overlay);
    const options={duration,delay,easing:SCAN_EASE,fill:'backwards'};
    if(reveal)animations.push(target.animate([{clipPath:'polygon(0 0,100% 0,100% 0px,0 0px)'},{clipPath:`polygon(0 0,100% 0,100% ${h}px,0 ${h}px)`}],options));
    for(const node of [tail,line])animations.push(node.animate([{transform:'translateY(0)'},{transform:`translateY(${h}px)`}],options));
    scans.set(target,{stop,kind,rect});release=trackDecoration(stop);
    Promise.all(animations.map(a=>a.finished)).then(stop,stop);
  }catch{stop();}
  return stop;
}
export function revealPanel(panel){
  let frame,release,flight,stopScan=()=>{},finished=false;
  const stop=()=>{if(finished)return;finished=true;try{flight?.cancel();}catch{}frame?.remove();stopScan();release?.();};
  try{
    if(!panel?.isConnected||reducedMotion())return stop;
    const origin=motionOrigin(),a=origin?.getBoundingClientRect?.(),b=panel.getBoundingClientRect();
    const source=origin&&!panel.contains(origin)&&origin!==document.body&&visible(a);
    if(!source)return scanReveal(panel,{duration:380,kind:'panel'});
    frame=document.createElement('i');frame.className='scan-frame';frame.setAttribute('aria-hidden','true');
    Object.assign(frame.style,{left:b.left+'px',top:b.top+'px',width:b.width+'px',height:b.height+'px',borderRadius:getComputedStyle(panel).borderRadius});document.body.append(frame);
    flight=frame.animate([{transform:`translate(${a.left-b.left}px,${a.top-b.top}px) scale(${a.width/b.width},${a.height/b.height})`},{transform:'translate(0,0) scale(1,1)'}],{duration:300,easing:SCAN_EASE});
    // 内容已在DOM中。描边飞行时整片面板尚未扫出，没有空白抽屉壳。
    stopScan=scanReveal(panel,{duration:380,delay:300,kind:'panel'});release=trackDecoration(stop);
    flight.finished.then(()=>{frame?.remove();release?.();},stop);
  }catch{stop();}
  return stop;
}
export function routeReveal(root){
  try{
  if(!root)return()=>{};
  // 原阶梯进入会把扫描后的内容再次隐藏。只结束本轮已有的进入动画；
  // 后续局部操作（新卡落桌、日程到达等）仍走原页的反馈。
  root.querySelectorAll('.reveal').forEach(el=>el.classList.add('in'));
  root.getAnimations({subtree:true}).filter(a=>['rise','settings-enter'].includes(a.animationName)).forEach(a=>a.cancel());
  routeAt=performance.now();
  return scanReveal(root,{duration:440,kind:'route'});
  }catch{return()=>{};}
}
export function installScreenMotion(){
  const selector='.cover.lcd,.m-screen,.m-screen-2,.rec .art,[data-partner-screen]',hovered=new WeakSet();
  const remember=e=>{noteInput();lastTrigger=e.target?.closest?.('button,a,[role="button"],[tabindex]')||e.target;};
  const enter=e=>{const el=e.target?.closest?.(selector);if(!el||el.contains(e.relatedTarget)||hovered.has(el))return;hovered.add(el);scanReveal(el,{duration:520,delay:60,kind:'hover',reveal:false});};
  const leave=e=>{const el=e.target?.closest?.(selector);if(el&&!el.contains(e.relatedTarget))hovered.delete(el);};
  document.addEventListener('pointerdown',remember,true);document.addEventListener('keydown',remember,true);document.addEventListener('pointerover',enter);document.addEventListener('pointerout',leave);
  return()=>{document.removeEventListener('pointerdown',remember,true);document.removeEventListener('keydown',remember,true);document.removeEventListener('pointerover',enter);document.removeEventListener('pointerout',leave);for(const stop of [...active])stop();lastTrigger=null;};
}
