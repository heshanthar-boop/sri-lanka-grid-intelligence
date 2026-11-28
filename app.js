'use strict';
const $=id=>document.getElementById(id);let current=null, imported=null;
const fmt=n=>Number.isFinite(n)?new Intl.NumberFormat('en-LK',{maximumFractionDigits:1}).format(n):'—';
function el(tag,text,cls){const n=document.createElement(tag);n.textContent=text;if(cls)n.className=cls;return n}
function avg(a){return a.length?a.reduce((x,y)=>x+y,0)/a.length:NaN}
function timestamp(i){let m=(i+1)*15;return `${String(Math.floor(m/60)%24).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`}
let period='day',archiveDates=[],drawVersion=0;
const dayCache=new Map(),dayRequests=new Map();
const CATEGORY_NAMES={'Major hydro':1,'Coal':1,'Oil (CEB)':1,'Oil (IPP)':1,'Wind':1,'Solar':1,'Biomass':1,'Mini hydro':1,'Storage (net)':1,'Reported net total':1};
function sourceCategory(name){
  name=name.replace(/^(Source|Plant): /,'');
  if(CATEGORY_NAMES[name])return name;
  const v=(current?.plant_categories?.[name]||name).toLowerCase();
  if(v.includes('mini hydro')||v.includes('minihydro'))return 'Mini hydro';
  if(v.includes('solar'))return 'Solar';if(v.includes('wind'))return 'Wind';if(v.includes('biomass')||v.includes('bmp')||v.includes('waste'))return 'Biomass';
  if(v.includes('bess')||v.includes('storage'))return 'Storage (net)';if(v.includes('coal')||v.includes('lvps'))return 'Coal';
  if(v.includes('oil')&&v.includes('ipp'))return 'Oil (IPP)';if(v.includes('oil')&&v.includes('ceb'))return 'Oil (CEB)';
  if(v.includes('hydro')||['canyon','wps','olax','nlax','polp','broadlands','upper kothmale','koth','vict','rand','rant','uku','bowa','sam','kukule','uma oya'].includes(v))return 'Major hydro';
  if(['ace embili','ace matara','wcp','sobadhanavi ps'].includes(v))return 'Oil (IPP)';
  if(['sapu a','sapu b','uthuru janani','barge','kccp','kccps2','kps(gt7)','kps(gt)','kps_dpp_matu','kps_dpp_hamba'].includes(v))return 'Oil (CEB)';
  return null;
}
function color(name){let base=SLGIAnalysis.sourceColor(sourceCategory(name)||name);if(!name.startsWith('Plant: '))return base;let hash=0;for(const c of name)hash=((hash*31)+c.charCodeAt(0))>>>0;let mix=[-.3,-.15,0,.14,.26][hash%5],rgb=[1,3,5].map(i=>parseInt(base.slice(i,i+2),16));return '#'+rgb.map(v=>Math.round(mix<0?v*(1+mix):v+(255-v)*mix).toString(16).padStart(2,'0')).join('')}
let zoom=null,chartModel=null,activePoint=null,dragState=null;
let chartInspect=null,chartPreview=null,touchFrame=0;
const touchChart=SLGIGestures.attach($('chart'),{
  view:()=>chartModel&&zoom,
  bounds:()=>{const svg=$('chart').querySelector('svg');if(!svg)return null;const rect=svg.getBoundingClientRect(),width=svg.viewBox.baseVal.width,left=width<600?42:62;return {left:rect.left+left*rect.width/width,width:(width-left-16)*rect.width/width}},
  inspect:x=>chartInspect?.({clientX:x}),
  preview:range=>chartPreview?.(range),
  change:(range,fraction)=>{if(!chartModel||!zoom)return;zoom={...range,total:zoom.total};activePoint=zoom.start+Math.round(fraction*(zoom.length-1));if(!touchFrame)touchFrame=requestAnimationFrame(()=>{touchFrame=0;if(chartModel)lineChart(chartModel.series,chartModel.labels,chartModel.heading,chartModel.description)})}
});
function cancelTouch(){touchChart.cancel();if(touchFrame)cancelAnimationFrame(touchFrame);touchFrame=0;chartInspect=null;chartPreview=null}
const compactPhone=window.matchMedia('(max-width: 750px)').matches;
if(compactPhone){$('calendar-panel').open=false;$('custom-panel').open=false}
const analyst=SLGIAnalyst.attach({
  current:()=>current,dates:()=>archiveDates,load:fetchDay,
  inspect:index=>{if(period!=='day')document.querySelector('[data-period=day]').click();activePoint=index;if(chartModel)lineChart(chartModel.series,chartModel.labels,chartModel.heading,chartModel.description);$('grid-chart').scrollIntoView({behavior:'smooth',block:'start'})},
  openDate:date=>{$('date').value=date;$('date').dispatchEvent(new Event('change'));$('grid-chart').scrollIntoView({behavior:'smooth',block:'start'})}
});
const renewableWatch=SLGIRenewableWatchUI.attach({
  dates:()=>archiveDates,load:fetchDay,
  open:async(date,labels,settings)=>{
    const navigation=++navVersion,day=await fetchDay(date);if(navigation!==navVersion)return;period='day';$('calendar-mode').value='day';
    document.querySelectorAll('[data-period]').forEach(button=>{const active=button.dataset.period==='day';button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active))});
    customSelection=new Set(labels.map(label=>'p:'+label));customInitialized=true;$('date').value=date;show(day);
    const first=Math.max(0,settings.startHour*4-1),last=settings.endHour*4-1;zoom={start:first,length:last-first+1,total:96};activePoint=Math.floor((first+last)/2);
    if(chartModel)lineChart(chartModel.series,chartModel.labels,chartModel.heading,chartModel.description);
    $('grid-chart').scrollIntoView({behavior:'smooth',block:'start'});
  }
});
let customSelection=new Set(),customInitialized=false;
function renderChecklist(){if(!current)return;let node=$('series-checklist');node.replaceChildren();
  let selectedGroups=[...customSelection].filter(k=>k.startsWith('g:')).map(k=>k.slice(2)),selectedPlants=[...customSelection].filter(k=>k.startsWith('p:')).map(k=>k.slice(2));
  let groups=[...new Set([...Object.keys(current.groups),...selectedGroups])].sort(),plants=[...new Set([...Object.keys(current.plants),...selectedPlants])].sort();
  function populate(target,names,prefix,available){let grid=el('div','','check-grid');names.forEach(name=>{let key=prefix+name,label=el('label','','check-item'),input=document.createElement('input');input.type='checkbox';input.value=key;input.checked=customSelection.has(key);input.addEventListener('change',()=>{if(input.checked)customSelection.add(key);else customSelection.delete(key);$('series').value='custom';draw()});let dot=el('i','');dot.className='check-dot';dot.style.background=color(prefix==='p:'?'Plant: '+name:name);label.append(input,dot,el('span',name+(available[name]?'':' · not in selected day')));grid.append(label)});target.append(grid)}
  let groupField=document.createElement('fieldset');groupField.className='check-group';groupField.append(el('legend','SOURCES AND TOTAL'));populate(groupField,['Reported net total'],'t:',{'Reported net total':true});populate(groupField,groups,'g:',current.groups);node.append(groupField);
  let plantsBlock=document.createElement('details');plantsBlock.className='plant-list';plantsBlock.append(el('summary','Choose individual plants and reported aggregates'));populate(plantsBlock,plants,'p:',current.plants);node.append(plantsBlock);
  $('selection-count').textContent=customSelection.size+' selected';
}
$('all-sources').addEventListener('click',()=>{if(!current)return;Object.keys(current.groups).forEach(k=>customSelection.add('g:'+k));$('series').value='custom';renderChecklist();draw()});
$('clear-series').addEventListener('click',()=>{customSelection.clear();renderChecklist();draw()});

function lineChart(series,labels,heading,description){
  chartModel={series,labels,heading,description};const node=$('chart');node.replaceChildren();
  const names=Object.keys(series),count=labels.length;
  if(!zoom||zoom.total!==count){zoom={start:0,length:count,total:count};activePoint=period==='day'?47:Math.max(0,labels.findIndex(label=>label===current.date+' 12:00'))}
  const first=zoom.start,last=first+zoom.length-1,n=zoom.length;
  node.classList.toggle('zoomed',n<count);
  if(activePoint===null||activePoint<first||activePoint>last)activePoint=Math.floor((first+last)/2);
  const values=names.flatMap(k=>series[k].slice(first,last+1)).filter(Number.isFinite);
  const W=Math.min(950,Math.max(220,node.clientWidth)),H=W<600?300:320,L=W<600?42:62,R=16,T=22,B=38;
  const min=values.reduce((a,b)=>Math.min(a,b),0),max=values.reduce((a,b)=>Math.max(a,b),1),x=i=>L+(W-L-R)*(n===1?0:(i-first)/(n-1)),y=v=>T+(max-v)/(max-min)*(H-T-B);
  const NS='http://www.w3.org/2000/svg',svg=document.createElementNS(NS,'svg');svg.setAttribute('viewBox',`0 0 ${W} ${H}`);svg.setAttribute('aria-hidden','true');
  const add=(tag,attrs,text)=>{let el=document.createElementNS(NS,tag);Object.entries(attrs).forEach(([k,v])=>el.setAttribute(k,v));if(text!=null)el.textContent=text;svg.appendChild(el);return el};
  for(let t=0;t<=4;t++){let py=T+(H-T-B)*t/4;add('line',{x1:L,y1:py,x2:W-R,y2:py,stroke:'#e5eee7'});add('text',{x:L-10,y:py+4,'text-anchor':'end',fill:'#789085','font-size':12},fmt(max-(max-min)*t/4))}
  add('text',{x:4,y:14,fill:'#789085','font-size':11,'font-weight':'bold'},'MW');
  let ticks=[...new Set([first,first+Math.floor((n-1)/4),first+Math.floor((n-1)/2),first+Math.floor(3*(n-1)/4),last])];
  const labelFor=i=>period==='day'?(i===95?'24:00':timestamp(i)):(n>96?labels[i].slice(5,10):labels[i].slice(5,16));
  if(W<400)ticks=period!=='day'&&n<=96?[first,last]:[...new Set([first,first+Math.floor((n-1)/2),last])];
  ticks.forEach(i=>add('text',{x:x(i),y:H-11,'text-anchor':i===first?'start':i===last?'end':'middle',fill:'#6a8276','font-size':12},labelFor(i)));
  names.forEach(name=>{let segment=[];const flush=()=>{if(segment.length>1)add('polyline',{points:segment.join(' '),fill:'none',stroke:color(name),'stroke-width':2.6,'stroke-linecap':'round','stroke-linejoin':'round'});segment=[]};for(let i=first;i<=last;i++){let v=series[name][i];if(!Number.isFinite(v)){flush();continue}segment.push(`${x(i)},${y(v)}`);if(n<=96)add('circle',{cx:x(i),cy:y(v),r:3,fill:color(name)})}flush()});
  const band=add('rect',{x:L,y:T,width:0,height:H-T-B,fill:'#2a8e6c','fill-opacity':'0.15',stroke:'#2a8e6c','stroke-width':1,opacity:0});
  const guide=add('line',{x1:L,y1:T,x2:L,y2:H-B,stroke:'#173f38','stroke-width':1,'stroke-dasharray':'4 4',opacity:0});
  const dots=names.map(name=>add('circle',{cx:0,cy:0,r:4.5,fill:color(name),stroke:'white','stroke-width':2,opacity:0}));
  node.appendChild(svg);$('download-csv').disabled=false;$('export-chart').disabled=false;$('legend').replaceChildren(...names.map(name=>{let item=el('span',name);let dot=document.createElement('i');dot.style.background=color(name);item.prepend(dot);return item}));
  $('zoom-label').textContent=zoom.length===count?'Full view':`${labelFor(first)} – ${labelFor(last)} · ${n} points`;
  node.dataset.viewStart=first;node.dataset.viewLength=n;
  $('zoom-in').disabled=n<=Math.min(4,count);$('zoom-out').disabled=n===count;$('zoom-reset').disabled=n===count;$('pan-left').disabled=first===0;$('pan-right').disabled=last===count-1;
  function inspect(i){activePoint=Math.max(first,Math.min(last,i));let present=names.filter(k=>Number.isFinite(series[k][activePoint]));let label=period==='day'?(activePoint===95?'24:00 (end of selected day)':timestamp(activePoint)):labels[activePoint]+(activePoint%96===95?' (end of reporting day)':'');
    guide.setAttribute('x1',x(activePoint));guide.setAttribute('x2',x(activePoint));guide.setAttribute('opacity','0.8');
    dots.forEach((dot,j)=>{let value=series[names[j]][activePoint];dot.setAttribute('opacity',Number.isFinite(value)?'1':'0');if(Number.isFinite(value)){dot.setAttribute('cx',x(activePoint));dot.setAttribute('cy',y(value))}});
    let detail=$('chart-detail');detail.replaceChildren();let top=el('div','','detail-heading');top.append(el('b',label),el('span','15-minute reported power'));detail.append(top);
    if(!present.length){detail.append(el('p','No reported values available for this point.','detail-empty'));return}
    let grid=el('div','','detail-values');names.forEach(name=>{let value=series[name][activePoint],item=el('div','','detail-item'),dot=el('i','');dot.style.background=color(name);item.append(dot,el('span',name),el('strong',Number.isFinite(value)?fmt(value)+' MW':'No data'));grid.append(item)});detail.append(grid);
  }
  function pointer(e){let rect=svg.getBoundingClientRect();let px=(e.clientX-rect.left)*W/rect.width;inspect(first+Math.round((px-L)/(W-L-R)*(n-1)))}
  chartInspect=pointer;
  chartPreview=range=>{if(!range){band.setAttribute('opacity','0');return}const a=x(range.start),b=x(range.end);band.setAttribute('x',Math.min(a,b));band.setAttribute('width',Math.abs(b-a));band.setAttribute('opacity','1')};
  node.onpointermove=e=>{
    if(e.pointerType==='touch')return;
    if(dragState&&e.pointerId===dragState.id){
      const delta=e.clientX-dragState.originX;
      if(Math.abs(delta)<4&&!dragState.moved)return;
      dragState.moved=true;node.classList.add('dragging');
      const fraction=Math.max(0,Math.min(1,(e.clientX-dragState.plotLeft)/dragState.plotWidth));
      if(dragState.mode==='select'){
        dragState.end=dragState.start+Math.round(fraction*(dragState.length-1));
        const a=x(dragState.anchor),b=x(dragState.end);band.setAttribute('x',Math.min(a,b));band.setAttribute('width',Math.abs(b-a));band.setAttribute('opacity','1');
      }else{
        const start=SLGIAnalysis.dragRange(zoom.total,dragState.start,dragState.length,delta,dragState.plotWidth);
        if(start!==zoom.start){
          zoom={start,length:dragState.length,total:zoom.total};activePoint=start+Math.round(fraction*(zoom.length-1));
          lineChart(chartModel.series,chartModel.labels,chartModel.heading,chartModel.description);
        }
      }
      return;
    }
    if(e.pointerType==='mouse'||e.buttons)pointer(e);
  };
  node.onpointerdown=e=>{
    if(e.pointerType==='touch')return;
    pointer(e);node.focus({preventScroll:true});
    if(e.pointerType==='mouse'&&e.button===0){
      let bounds=svg.getBoundingClientRect(),scale=bounds.width/W;
      dragState={id:e.pointerId,mode:zoom.length===zoom.total?'select':'pan',originX:e.clientX,start:zoom.start,length:zoom.length,plotLeft:bounds.left+L*scale,plotWidth:(W-L-R)*scale,anchor:activePoint,end:activePoint,moved:false};
      try{node.setPointerCapture(e.pointerId)}catch(_){}e.preventDefault();
    }
  };
  const finishDrag=e=>{
    if(!dragState||e.pointerId!==dragState.id)return;
    const selected=dragState;dragState=null;node.classList.remove('dragging');
    if(node.hasPointerCapture(e.pointerId))node.releasePointerCapture(e.pointerId);
    if(e.type==='pointerup'&&selected.mode==='select'&&selected.moved&&chartModel){
      const range=SLGIAnalysis.selectionRange(zoom.total,selected.anchor,selected.end);
      zoom={...range,total:zoom.total};activePoint=Math.floor(range.start+(range.length-1)/2);
      lineChart(chartModel.series,chartModel.labels,chartModel.heading,chartModel.description);
    }else if(band.isConnected)band.setAttribute('opacity','0');
  };
  node.onpointerup=finishDrag;node.onpointercancel=finishDrag;node.onlostpointercapture=()=>{dragState=null;node.classList.remove('dragging')};
  node.onkeydown=e=>{if(e.key==='ArrowRight'||e.key==='ArrowLeft'){e.preventDefault();inspect(activePoint+(e.key==='ArrowRight'?1:-1))}else if(e.key==='Home'||e.key==='End'){e.preventDefault();inspect(e.key==='Home'?first:last)}};
  node.setAttribute('aria-label',`${heading}. ${description} Pinch to zoom. Drag a range in full view, or drag to pan when zoomed. Tap or use left and right arrow keys to inspect values.`);inspect(activePoint);
}
function adjustZoom(action){if(!chartModel||!zoom)return;let v=SLGIAnalysis.zoomRange(zoom.total,zoom.start,zoom.length,action,activePoint);zoom={...v,total:zoom.total};lineChart(chartModel.series,chartModel.labels,chartModel.heading,chartModel.description)}
[['zoom-in','in'],['zoom-out','out'],['zoom-reset','reset'],['pan-left','left'],['pan-right','right']].forEach(([id,action])=>$(id).addEventListener('click',()=>adjustZoom(action)));

// If pointer capture is unavailable, continue a drag that leaves the chart.
window.addEventListener('pointermove',event=>{let node=$('chart');if(dragState&&!node.contains(event.target)&&node.onpointermove)node.onpointermove(event)});
window.addEventListener('pointerup',event=>{let node=$('chart');if(dragState&&!node.contains(event.target)&&node.onpointerup)node.onpointerup(event)});
let wheelAccum=0,lastWheelZoom=0;
$('chart').addEventListener('wheel',event=>{
  if(!chartModel||!zoom||event.ctrlKey||event.metaKey||!event.deltaY)return;
  let direction=event.deltaY<0?'in':'out';
  if((direction==='in'&&zoom.length<=Math.min(4,zoom.total))||(direction==='out'&&zoom.length>=zoom.total))return;
  const svg=$('chart').querySelector('svg');if(!svg)return;event.preventDefault();
  let delta=event.deltaY*(event.deltaMode===1?16:event.deltaMode===2?250:1);
  if(Math.sign(delta)!==Math.sign(wheelAccum))wheelAccum=0;wheelAccum+=delta;
  let now=Date.now();if(Math.abs(wheelAccum)<30||now-lastWheelZoom<100)return;
  wheelAccum=0;lastWheelZoom=now;
  let rect=svg.getBoundingClientRect(),width=svg.viewBox.baseVal.width,left=width<600?42:62,right=16;
  let px=(event.clientX-rect.left)*width/rect.width,fraction=Math.max(0,Math.min(1,(px-left)/(width-left-right)));
  activePoint=zoom.start+Math.round(fraction*(zoom.length-1));adjustZoom(direction);
},{passive:false});


async function fetchDay(date){if(dayCache.has(date))return dayCache.get(date);if(dayRequests.has(date))return dayRequests.get(date);let request=(async()=>{let r=await fetch(`data/days/${encodeURIComponent(date)}.json`);if(!r.ok)throw Error(`Could not load ${date}`);let result=await r.json();dayCache.set(date,result);return result})();dayRequests.set(date,request);try{return await request}finally{dayRequests.delete(date)}}
async function draw(){
  if(!current)return;cancelTouch();chartModel=null;$('download-csv').disabled=true;$('export-chart').disabled=true;const request=++drawVersion,sel=$('series').value,kind=sel==='groups'?'groups':sel==='total'?'total':sel==='custom'?'custom':sel.startsWith('group:')?'group':'plant';
  $('custom-panel').hidden=false;$('selection-count').textContent=customSelection.size+' selected';
  if(kind==='custom'&&!customInitialized){customSelection=new Set(Object.keys(current.groups).map(k=>'g:'+k));customInitialized=true;renderChecklist()}
  const selected=kind==='custom'?[...customSelection].map(key=>({kind:key.startsWith('g:')?'group':key.startsWith('t:')?'total':'plant',name:key.slice(2),label:key.startsWith('t:')?'Reported net total':(key.startsWith('g:')?'Source: ':'Plant: ')+key.slice(2)})):[];
  let names=kind==='groups'?Object.keys(current.groups):kind==='total'?['Reported net total']:kind==='custom'?selected.map(x=>x.label):[sel.slice(6)];
  if(kind==='custom'&&!names.length){$('chart').replaceChildren(el('p','Choose at least one source or plant above.','chart-empty'));$('chart-detail').replaceChildren();$('legend').replaceChildren();$('period-status').textContent='No series selected';['zoom-in','zoom-out','zoom-reset','pan-left','pan-right'].forEach(id=>$(id).disabled=true);return;}
  if(period==='day'){
    $('chart-title').textContent='Generation through the day';$('chart-subtitle').textContent='15-minute reported readings for the selected date.';
    $('period-status').textContent=current.date+' · Day view · 96 observations per reported series';$('chart-note').textContent='MW measures power. These are reported readings, not confirmed interval averages. The last point is midnight at the end of the selected day.';
    let series=kind==='groups'?current.groups:kind==='total'?{'Reported net total':current.total}:kind==='custom'?Object.fromEntries(selected.map(item=>[item.label,(item.kind==='total'?current.total:item.kind==='group'?current.groups[item.name]:current.plants[item.name])||Array(96).fill(null)])):{[names[0]]:kind==='group'?current.groups[names[0]]:current.plants[names[0]]};
    lineChart(series,Array.from({length:96},(_,i)=>timestamp(i)), 'Daily dispatch chart','15-minute readings in MW.');return;
  }
  let dates=SLGIAnalysis.periodDates(current.date,period);let dayMap={},failed=[];
  $('chart-title').textContent=period==='week'?'A week at a glance':'A month at a glance';
  $('chart-subtitle').textContent='Every point is a 15-minute reported reading. Zoom in to inspect individual times.';
  $('period-status').textContent='Loading available days…';
  let targets=current.imported?[]:dates.filter(d=>archiveDates.includes(d));
  await Promise.all(targets.map(async d=>{try{dayMap[d]=await fetchDay(d)}catch(e){failed.push(d)}}));
  if(request!==drawVersion)return;
  if(current.imported)dayMap[current.date]=current;
  const count=Object.keys(dayMap).length;
  $('period-status').textContent=`${dates[0]} to ${dates[dates.length-1]} · ${count} of ${dates.length} days available${failed.length?' · '+failed.length+' could not be loaded':''}${current.imported?' · local CSV only':''}`;
  $('chart-note').textContent='Each point is a 15-minute reading in MW. Gaps mean data is missing, not zero. Midnight belongs to the end of the reporting day. Source coverage can change.';
  const series=kind==='custom'?Object.fromEntries(selected.map(item=>[item.label,SLGIAnalysis.intervalSeries(dates,dayMap,item.kind,[item.name])[item.name]])):SLGIAnalysis.intervalSeries(dates,dayMap,kind,names),labels=SLGIAnalysis.intervalLabels(dates);
  lineChart(series,labels,period==='week'?'Weekly dispatch chart':'Monthly dispatch chart',`${count} of ${dates.length} days available. 15-minute reported power in MW.`);
}

let calendarMonth=null,navVersion=0,pendingCalendarMessage='';
function updateDayNav(){let index=archiveDates.indexOf(current?.date),local=current?.imported;$('prev-day').disabled=!!local||index<=0;$('next-day').disabled=!!local||index<0||index>=archiveDates.length-1}
function moveDay(step){let i=archiveDates.indexOf(current?.date),next=archiveDates[i+step];if(!next)return;$('date').value=next;$('date').dispatchEvent(new Event('change'))}
$('prev-day').addEventListener('click',()=>moveDay(-1));$('next-day').addEventListener('click',()=>moveDay(1));
$('archive-month').addEventListener('change',e=>{let month=e.target.value,days=archiveDates.filter(d=>d.startsWith(month+'-')),sameDay=month+'-'+(current?.date.slice(8,10)||'');if(!days.length)return;let chosen=days.includes(sameDay)?sameDay:days[days.length-1];$('date').value=chosen;$('date').dispatchEvent(new Event('change'))});
let insightsVersion=0;
async function renderInsights(){
  const ticket=++insightsVersion,selected=current,mode=period,dates=SLGIAnalysis.periodDates(selected.date,mode),days={};
  $('insights-period').textContent='QUICK ANALYSIS · SELECTED '+mode.toUpperCase();
  $('insights-caption').textContent='Loading '+mode+' readings…';$('insights').replaceChildren();
  if(selected.imported)days[selected.date]=selected;
  else await Promise.all(dates.filter(d=>archiveDates.includes(d)).map(async d=>{try{days[d]=await fetchDay(d)}catch(_){}}));
  if(ticket!==insightsVersion)return;
  const available=Object.keys(days).length,stat=SLGIAnalysis.summarizePeriod(dates,days),node=$('insights');
  $('insights-caption').textContent=`${dates[0]}${dates.length>1?' to '+dates[dates.length-1]:''} · ${available} of ${dates.length} days available. Uses reported total and solar, regardless of the chart selection.`;
  if(!stat.count){node.append(el('p','No readings available for this period.','detail-empty'));return}
  const when=label=>label?'At '+label+' (Sri Lanka time)':'Not available',signed=n=>(n>0?'+':'')+fmt(n),solarDays=Math.floor(stat.solarCount/96);
  [['AVERAGE OUTPUT',fmt(stat.average)+' MW',`Mean of ${stat.count.toLocaleString('en-LK')} reported readings`],['LOWEST OUTPUT',fmt(stat.low)+' MW',when(stat.lowLabel)],['SOLAR HIGH',stat.solarPeak===null?'No data':fmt(stat.solarPeak)+' MW',stat.solarPeak===null?'Solar readings unavailable':when(stat.solarLabel)+` · ${solarDays} of ${dates.length} days`],['LARGEST 15-MIN CHANGE',stat.largestChange===null?'No data':signed(stat.largestChange)+' MW',when(stat.changeLabel)+' · total']].forEach(([title,value,note])=>{let box=el('div','','insight');box.append(el('small',title),el('strong',value),el('span',note));node.append(box)});
}
function renderCalendar(){if(calendarMonth===null)return;let d=new Date(calendarMonth),year=d.getUTCFullYear(),month=d.getUTCMonth(),first=Date.UTC(year,month,1),last=new Date(Date.UTC(year,month+1,0)).getUTCDate();
  $('calendar-heading').textContent=new Intl.DateTimeFormat('en-LK',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(first));$('calendar-jump').value=String(year).padStart(4,'0')+'-'+String(month+1).padStart(2,'0');
  const grid=$('calendar-grid');grid.replaceChildren();for(let i=0;i<(new Date(first).getUTCDay()+6)%7;i++)grid.append(el('span','','calendar-blank'));
  for(let day=1;day<=last;day++){let dateValue=new Date(Date.UTC(year,month,day)),iso=dateValue.toISOString().slice(0,10),holiday=SLGIHolidays.data[iso],weekend=!!SLGIHolidays.sources[String(year)]&&[0,6].includes(dateValue.getUTCDay()),has=archiveDates.includes(iso),button=el('button',String(day));button.type='button';if(has)button.classList.add('has-data');if(weekend&&!holiday)button.classList.add('bank-weekend');if(holiday)button.classList.add('holiday');if(current?.date===iso)button.classList.add('selected');button.setAttribute('aria-label',`${iso}. ${holiday||(weekend?'Weekend (bank holiday)':SLGIHolidays.sources[String(year)]?'No named holiday listed':'Holiday schedule not loaded')}. ${has?'Grid data available':'No saved grid data'}`);button.title=[iso,holiday||(weekend?'Weekend (bank holiday)':''),has?'Grid data available':'No saved grid data'].filter(Boolean).join(' · ');button.addEventListener('click',()=>chooseCalendarDay(iso));grid.append(button)}
  const list=$('holiday-list');list.replaceChildren();const yearKey=String(year),source=SLGIHolidays.sources[yearKey],link=$('holiday-source');link.hidden=!source;if(source)link.href=source;
  if(!source){list.append(el('div',`Holiday schedule for ${year} is not loaded.`));return}
  const prefix=yearKey+'-'+String(month+1).padStart(2,'0')+'-';let items=Object.entries(SLGIHolidays.data).filter(([date])=>date.startsWith(prefix));if(!items.length){list.append(el('div','No holidays listed in the loaded annual schedule for this month.'));return}
  items.forEach(([date,name])=>{let row=el('div','');row.append(el('b',date.slice(8)+' '),document.createTextNode(name));list.append(row)})
}
function changeCalendarMonth(delta){let d=new Date(calendarMonth);calendarMonth=Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+delta,1);renderCalendar()}
$('cal-prev').addEventListener('click',()=>changeCalendarMonth(-1));$('cal-next').addEventListener('click',()=>changeCalendarMonth(1));$('calendar-jump').addEventListener('change',e=>{if(!/^\d{4}-\d{2}$/.test(e.target.value))return;let [year,month]=e.target.value.split('-').map(Number);if(month<1||month>12)return;calendarMonth=Date.UTC(year,month-1,1);renderCalendar()});
function chooseCalendarDay(date){let mode=$('calendar-mode').value,holiday=SLGIHolidays.data[date],candidates=SLGIAnalysis.periodDates(date,mode).filter(d=>archiveDates.includes(d));
  if(!candidates.length){$('calendar-message').textContent=`${date}${holiday?' · '+holiday:''}: no saved grid data for this ${mode}.`;return}
  let chosen=archiveDates.includes(date)?date:candidates.reduce((a,b)=>Math.abs(Date.parse(b)-Date.parse(date))<Math.abs(Date.parse(a)-Date.parse(date))?b:a);
  pendingCalendarMessage=`${date}${holiday?' · '+holiday:''}${chosen!==date?' · Showing the '+mode+' using available date '+chosen:''}.`; $('calendar-message').textContent=pendingCalendarMessage;
  const button=document.querySelector(`[data-period="${mode}"]`);if(period!==mode)button.click();$('date').value=chosen;$('date').dispatchEvent(new Event('change'));document.getElementById('explore').scrollIntoView({behavior:'smooth',block:'start'});
}
$('download-csv').addEventListener('click',()=>{if(!chartModel||!current)return;let labels=chartModel.labels;if(period==='day'){let start=Date.parse(current.date+'T00:00:00Z');labels=labels.map((_,i)=>new Date(start+(i+1)*900000).toISOString().slice(0,16)+'+05:30')}
  let model={series:chartModel.series,labels},info={date:current.date,period,description:chartModel.description,source:current.imported?'Local user-supplied CSV':`PUCSL public dispatch; selected date source: ${current.source_url}. Other days may have different source coverage.`};let bytes=SLGIExports.workbook(model,info),url=URL.createObjectURL(new Blob([bytes],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'})),a=document.createElement('a');a.href=url;a.download=`SLGI-${period}-${current.date}.xlsx`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)
});
$('export-chart').addEventListener('click',()=>{if(!chartModel||!current||!zoom)return;let names=Object.keys(chartModel.series),info={date:current.date,period,title:$('chart-title').textContent,colors:names.map(color),source:current.imported?'User-imported CSV (not independently verified)':'PUCSL public dispatch records; source coverage can vary by date'};let bytes=SLGIExports.chartPdf(chartModel,info,zoom),url=URL.createObjectURL(new Blob([bytes],{type:'application/pdf'})),a=document.createElement('a');a.href=url;a.download=`SLGI-chart-${period}-${current.date}.pdf`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)});

function show(d){zoom=null;activePoint=null;dragState=null;current=d;analyst.context();renewableWatch.context();if(!d.imported)$('archive-month').value=d.date.slice(0,7);$('calendar-message').textContent=pendingCalendarMessage||('Selected '+d.date+(SLGIHolidays.data[d.date]?' · '+SLGIHolidays.data[d.date]:''));pendingCalendarMessage='';calendarMonth=Date.UTC(Number(d.date.slice(0,4)),Number(d.date.slice(5,7))-1,1);renderCalendar();updateDayNav();renderInsights();$('state').textContent=d.imported?'Local CSV · session only':'Archived PUCSL records';$('status-detail').textContent=`${d.date} · ${d.imported?'user supplied':d.sheet} · not live`;const total=d.total;let hydro=d.groups['Major hydro'];let day=[],night=[];if(hydro)hydro.forEach((v,i)=>{let end=(i+1)*15;((end>360&&end<=1080)?day:night).push(v)});let avd=avg(day),avn=avg(night);$('peak').textContent=fmt(Math.max(...total))+' MW';$('dayhydro').textContent=hydro?fmt(avd)+' MW':'—';$('nighthydro').textContent=hydro?fmt(avn)+' MW':'—';$('day2').textContent=hydro?fmt(avd)+' MW':'Not available';$('night2').textContent=hydro?fmt(avn)+' MW':'Not available';let hmax=Math.max(avd||0,avn||0,1);$('daybar').style.width=(hydro?Math.max(0,avd/hmax*100):0)+'%';$('nightbar').style.width=(hydro?Math.max(0,avn/hmax*100):0)+'%';$('coverage').textContent='96 / 96';
let select=$('series');select.value='custom';if(!customInitialized){customSelection=new Set(Object.keys(d.groups).map(k=>'g:'+k));customInitialized=true}renderChecklist();draw();let sum=total.reduce((a,b)=>a+b,0);$('mix').replaceChildren();Object.entries(d.groups).sort((a,b)=>b[1].reduce((x,y)=>x+y,0)-a[1].reduce((x,y)=>x+y,0)).forEach(([name,arr],i)=>{let s=arr.reduce((a,b)=>a+b,0);let pct=sum?100*s/sum:NaN;let row=el('div','','mix-row');row.append(el('span',name),el('b',Number.isFinite(pct)?fmt(pct)+'%':'—'));let bar=el('div','','track'),fill=el('i','');fill.style.width=Math.max(0,Math.min(100,pct||0))+'%';fill.style.background=color(name);bar.append(fill);row.append(bar);$('mix').append(row)});
let solar=d.groups.Solar;if(solar){let mid=solar.slice(39,64);let peak=Math.max(...mid),low=Math.min(...mid);$('solar').textContent=`Between 10:00 and 16:00, reported solar ranged from ${fmt(low)} to ${fmt(peak)} MW. This is a dispatch observation, not a curtailment estimate.`}else $('solar').textContent='Solar observations are not available in this dataset.';
let events=[];Object.entries(d.plants).forEach(([name,arr])=>{for(let i=1;i<arr.length;i++){let drop=arr[i-1]-arr[i];if(drop>=100&&arr[i-1]>0&&drop/arr[i-1]>=.3)events.push({name,time:timestamp(i),drop})}});events.sort((a,b)=>b.drop-a.drop);$('events').replaceChildren();if(!events.length)$('events').append(el('p','No changes met this screening rule. This does not establish that no events occurred.','fine'));else events.slice(0,5).forEach(e=>{let row=el('div','','event');row.append(el('b',e.name),el('span',`${e.time} · −${fmt(e.drop)} MW`));$('events').append(row)});if(events.length>5)$('events').append(el('p',`${events.length} flags in total; largest five shown.`,'fine'));
$('provenance').replaceChildren();$('provenance').append(document.createTextNode(d.imported?'Local CSV supplied by you. No source independently verified.':`PUCSL · ${d.sheet} · SHA-256 ${d.sha256.slice(0,12)}… `));if(!d.imported){let a=el('a','View source ↗');a.href=d.source_url;a.target='_blank';a.rel='noopener';$('provenance').append(a)} }
document.querySelectorAll('[data-period]').forEach(button=>button.addEventListener('click',()=>{period=button.dataset.period;$('calendar-mode').value=period;zoom=null;activePoint=null;dragState=null;document.querySelectorAll('[data-period]').forEach(b=>{let active=b===button;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active))});if(current)renderInsights();draw()}));
let resizeTimer,lastChartWidth=$('chart').clientWidth;window.addEventListener('resize',()=>{const width=$('chart').clientWidth;if(width===lastChartWidth)return;lastChartWidth=width;clearTimeout(resizeTimer);resizeTimer=setTimeout(draw,150)});
$('series').addEventListener('change',draw);$('date').addEventListener('change',async e=>{let ticket=++navVersion;if(e.target.value==='local'){show(imported);return}try{let day=await fetchDay(e.target.value);if(ticket===navVersion)show(day)}catch(err){if(ticket===navVersion){$('state').textContent='Could not load date';$('status-detail').textContent=err.message}}});
function csvRows(text){let rows=[],row=[],s='',q=false;for(let i=0;i<text.length;i++){let c=text[i];if(q){if(c==='"'&&text[i+1]==='"'){s+='"';i++}else if(c==='"')q=false;else s+=c}else if(c==='"'){if(s)throw Error('Invalid quote');q=true}else if(c===','){row.push(s);s=''}else if(c==='\n'){row.push(s.replace(/\r$/,''));rows.push(row);row=[];s=''}else s+=c}if(q)throw Error('Unclosed quote');if(s||row.length){row.push(s.replace(/\r$/,''));rows.push(row)}return rows.filter(r=>r.some(x=>x.trim()))}
function importCSV(text){let rows=csvRows(text.replace(/^\uFEFF/,''));let header=rows.shift().map(x=>x.trim().toLowerCase());let ix=['timestamp','source','category','mw'].map(k=>header.indexOf(k));if(ix.some(i=>i<0))throw Error('CSV must contain timestamp, source, category, mw headers.');let plants={},category={},allDates=[];for(let r of rows){let [t,name,g,v]=ix.map(i=>(r[i]??'').trim());if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::00)?(?:\+05:30)?$/.test(t)||!name||!g||v===''||!Number.isFinite(Number(v)))throw Error('Invalid row: use a local ISO timestamp, source, category and numeric MW.');let clean=t.replace(/\+05:30$/,'');let ms=Date.parse(clean+'Z');if(!Number.isFinite(ms)||new Date(ms).toISOString().slice(0,16)!==clean.slice(0,16)||ms%900000!==0)throw Error('Invalid quarter-hour timestamp.');if(category[name]&&category[name]!==g)throw Error('A source has more than one category.');category[name]=g;plants[name]??={};if(ms in plants[name])throw Error('Duplicate source and timestamp.');plants[name][ms]=Number(v);allDates.push(ms)}if(!allDates.length)throw Error('No observations.');let first=Math.min(...allDates),base=first-900000;if(new Date(base).toISOString().slice(11,16)!=='00:00')throw Error('First label must be 00:15 on the selected day.');let expected=Array.from({length:96},(_,i)=>base+(i+1)*900000),groups={};Object.keys(plants).forEach(name=>{if(Object.keys(plants[name]).length!==96||expected.some(t=>!(t in plants[name])))throw Error(`Source ${name} must have exactly 96 aligned observations.`);plants[name]=expected.map(t=>plants[name][t]);let g=category[name];groups[g]??=Array(96).fill(0);groups[g]=groups[g].map((v,i)=>v+plants[name][i])});return {date:new Date(base).toISOString().slice(0,10),sheet:'Local CSV',imported:true,groups,plants,plant_categories:category,total:Array.from({length:96},(_,i)=>Object.values(groups).reduce((s,a)=>s+a[i],0))}}
$('csv').addEventListener('change',async e=>{try{let f=e.target.files[0];if(!f)return;if(f.size>10_000_000)throw Error('CSV exceeds 10 MB.');imported=importCSV(await f.text());let option=$('date').querySelector('option[value="local"]');if(!option){option=new Option('Imported CSV','local');$('date').append(option)}option.textContent=imported.date+' · local CSV';$('date').value='local';show(imported);$('import-status').textContent='Imported successfully. This data remains in this session.'}catch(err){$('import-status').textContent='Import failed: '+err.message}finally{e.target.value=''}});
(async()=>{try{let r=await fetch('data/index.json',{cache:'no-store'});if(!r.ok)throw Error('Archive index unavailable');let data=await r.json();if(!data.dates.length)throw Error('No validated dates in archive');archiveDates=[...new Set(data.dates)].sort();[...new Set(archiveDates.map(d=>d.slice(0,7)))].reverse().forEach(m=>{let label=new Intl.DateTimeFormat('en-LK',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(m+'-01T00:00:00Z'));$('archive-month').add(new Option(label,m))});let parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Colombo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()),get=k=>parts.find(p=>p.type===k).value,today=get('year')+'-'+get('month')+'-'+get('day'),coverage=SLGIAnalysis.yearCoverage(archiveDates,today);$('history-summary').textContent=`Past 365 days: ${coverage.available} of ${coverage.total} days available through ${coverage.end}. Latest saved day: ${coverage.latest||'none'}. Updates run daily when available.`;data.dates.slice().reverse().forEach(d=>$('date').add(new Option(d,d)));$('date').dispatchEvent(new Event('change'))}catch(err){$('state').textContent='No archive available';$('status-detail').textContent=err.message}})();
if('serviceWorker'in navigator&&location.protocol!=='file:')navigator.serviceWorker.register('sw.js?v=13').catch(()=>{});
