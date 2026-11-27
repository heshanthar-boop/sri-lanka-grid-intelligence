'use strict';
const $=id=>document.getElementById(id);const colors=['#4b9888','#d3aa53','#b76d4b','#557aa0','#a8c65e','#95b9a6','#9b8ab0','#7c847e','#db8c66','#50705c'];let current=null, imported=null;
const fmt=n=>Number.isFinite(n)?new Intl.NumberFormat('en-LK',{maximumFractionDigits:1}).format(n):'—';
function el(tag,text,cls){const n=document.createElement(tag);n.textContent=text;if(cls)n.className=cls;return n}
function avg(a){return a.length?a.reduce((x,y)=>x+y,0)/a.length:NaN}
function timestamp(i){let m=(i+1)*15;return `${String(Math.floor(m/60)%24).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`}
let period='day',archiveDates=[],drawVersion=0;
const dayCache=new Map();
function lineChart(series,labels,heading,description){
  const node=$('chart');node.replaceChildren();
  const names=Object.keys(series),values=names.flatMap(k=>series[k]).filter(Number.isFinite);
  const W=Math.min(950,Math.max(300,node.clientWidth)),H=W<600?230:320,L=W<600?42:62,R=16,T=22,B=38, count=labels.length;
  const min=Math.min(0,...values),max=Math.max(1,...values),x=i=>L+(W-L-R)*(count===1?0:i/(count-1)),y=v=>T+(max-v)/(max-min)*(H-T-B);
  const NS='http://www.w3.org/2000/svg',svg=document.createElementNS(NS,'svg');svg.setAttribute('viewBox',`0 0 ${W} ${H}`);svg.setAttribute('aria-hidden','true');
  const add=(tag,attrs,text)=>{let n=document.createElementNS(NS,tag);Object.entries(attrs).forEach(([k,v])=>n.setAttribute(k,v));if(text!=null)n.textContent=text;svg.appendChild(n);return n};
  for(let t=0;t<=4;t++){let py=T+(H-T-B)*t/4;add('line',{x1:L,y1:py,x2:W-R,y2:py,stroke:'#e5eee7'});add('text',{x:L-10,y:py+4,'text-anchor':'end',fill:'#789085','font-size':W<600?10:12},fmt(max-(max-min)*t/4))}
  add('text',{x:4,y:14,fill:'#789085','font-size':11,'font-weight':'bold'},'MW');
  let ticks=count===96?[0,23,47,71,95]:[...new Set([0,Math.floor((count-1)/4),Math.floor((count-1)/2),Math.floor(3*(count-1)/4),count-1])];
  ticks.forEach(i=>add('text',{x:x(i),y:H-11,'text-anchor':i===0?'start':i===count-1?'end':'middle',fill:'#789085','font-size':W<600?10:12},count===96?(i===95?'24:00':timestamp(i)):labels[i].slice(5)));
  names.forEach((name,j)=>{let segment=[];const flush=()=>{if(segment.length>1)add('polyline',{points:segment.join(' '),fill:'none',stroke:colors[j%colors.length],'stroke-width':2.6,'stroke-linecap':'round','stroke-linejoin':'round'});segment=[]};series[name].forEach((v,i)=>{if(!Number.isFinite(v)){flush();return}segment.push(`${x(i)},${y(v)}`);if(count!==96)add('circle',{cx:x(i),cy:y(v),r:3,fill:colors[j%colors.length]})});flush()});
  const guide=add('line',{x1:L,y1:T,x2:L,y2:H-B,stroke:'#173f38','stroke-width':1,'stroke-dasharray':'4 4',opacity:0});
  const dots=names.map((_,j)=>add('circle',{cx:0,cy:0,r:4.5,fill:colors[j%colors.length],stroke:'white','stroke-width':2,opacity:0}));
  node.appendChild(svg);$('legend').replaceChildren(...names.map((name,j)=>{let item=el('span',name);let dot=document.createElement('i');dot.style.background=colors[j%colors.length];item.prepend(dot);return item}));
  let active=period==='day'?47:Math.max(0,labels.indexOf(current.date));
  function inspect(i){active=Math.max(0,Math.min(count-1,i));let present=names.filter(k=>Number.isFinite(series[k][active]));let label=period==='day'?(active===95?'24:00 (end of selected day)':timestamp(active)):labels[active];
    guide.setAttribute('x1',x(active));guide.setAttribute('x2',x(active));guide.setAttribute('opacity','0.8');
    dots.forEach((dot,j)=>{let value=series[names[j]][active];dot.setAttribute('opacity',Number.isFinite(value)?'1':'0');if(Number.isFinite(value)){dot.setAttribute('cx',x(active));dot.setAttribute('cy',y(value))}});
    let detail=$('chart-detail');detail.replaceChildren();let top=el('div','','detail-heading');top.append(el('b',label),el('span',period==='day'?'Reported power':'Daily average of reported readings'));detail.append(top);
    if(!present.length){detail.append(el('p','No reported values available for this point.','detail-empty'));return}
    let grid=el('div','','detail-values');names.forEach((name,j)=>{let value=series[name][active];let item=el('div','','detail-item');let dot=el('i','');dot.style.background=colors[j%colors.length];item.append(dot,el('span',name),el('strong',Number.isFinite(value)?fmt(value)+' MW':'No data'));grid.append(item)});detail.append(grid);
  }
  function pointer(e){let rect=svg.getBoundingClientRect();let px=(e.clientX-rect.left)*W/rect.width;inspect(Math.round((px-L)/(W-L-R)*(count-1)))}
  node.onpointermove=e=>{if(e.pointerType==='mouse'||e.buttons)pointer(e)};node.onpointerdown=e=>{pointer(e);node.focus({preventScroll:true})};
  node.onkeydown=e=>{if(e.key==='ArrowRight'||e.key==='ArrowLeft'){e.preventDefault();inspect(active+(e.key==='ArrowRight'?1:-1))}else if(e.key==='Home'||e.key==='End'){e.preventDefault();inspect(e.key==='Home'?0:count-1)}};
  node.setAttribute('aria-label',`${heading}. ${description} Use left and right arrow keys to inspect values.`);inspect(active);
}
async function fetchDay(date){if(dayCache.has(date))return dayCache.get(date);let r=await fetch(`data/days/${encodeURIComponent(date)}.json`);if(!r.ok)throw Error(`Could not load ${date}`);let result=await r.json();dayCache.set(date,result);return result}
async function draw(){
  if(!current)return;const request=++drawVersion,sel=$('series').value,kind=sel==='groups'?'groups':sel==='total'?'total':'plant';
  let names=kind==='groups'?Object.keys(current.groups):kind==='total'?['Reported net total']:[sel.slice(6)];
  if(period==='day'){
    $('chart-title').textContent='Generation through the day';$('chart-subtitle').textContent='15-minute reported readings for the selected date.';
    $('period-status').textContent='Day view · 96 observations per reported series';$('chart-note').textContent='MW measures power. These are reported readings, not confirmed interval averages. The last point is midnight at the end of the selected day.';
    let series=kind==='groups'?current.groups:kind==='total'?{'Reported net total':current.total}:{[names[0]]:current.plants[names[0]]};
    lineChart(series,Array.from({length:96},(_,i)=>timestamp(i)), 'Daily dispatch chart','15-minute readings in MW.');return;
  }
  let dates=SLGIAnalysis.periodDates(current.date,period);let dayMap={},failed=[];
  $('chart-title').textContent=period==='week'?'A week at a glance':'A month at a glance';
  $('chart-subtitle').textContent='Each point is the average of that day’s reported readings.';
  $('period-status').textContent='Loading available days…';
  let targets=current.imported?[]:dates.filter(d=>archiveDates.includes(d));
  await Promise.all(targets.map(async d=>{try{dayMap[d]=await fetchDay(d)}catch(e){failed.push(d)}}));
  if(request!==drawVersion)return;
  if(current.imported)dayMap[current.date]=current;
  const count=Object.keys(dayMap).length;
  $('period-status').textContent=`${dates[0]} to ${dates[dates.length-1]} · ${count} of ${dates.length} days available${failed.length?' · '+failed.length+' could not be loaded':''}${current.imported?' · local CSV only':''}`;
  $('chart-note').textContent='Gaps mean no accepted data; missing values are never treated as zero. Each point averages that day’s 96 readings, not verified MWh. Source coverage can change between days.';
  const series=SLGIAnalysis.periodSeries(dates,dayMap,kind,names);
  lineChart(series,dates,period==='week'?'Weekly dispatch chart':'Monthly dispatch chart',`${count} of ${dates.length} days available. Daily average reported power in MW.`);
}

function show(d){current=d;$('state').textContent=d.imported?'Local CSV · session only':'Archived PUCSL records';$('status-detail').textContent=`${d.date} · ${d.imported?'user supplied':d.sheet} · not live`;const total=d.total;let hydro=d.groups['Major hydro'];let day=[],night=[];if(hydro)hydro.forEach((v,i)=>{let end=(i+1)*15;((end>360&&end<=1080)?day:night).push(v)});let avd=avg(day),avn=avg(night);$('peak').textContent=fmt(Math.max(...total))+' MW';$('dayhydro').textContent=hydro?fmt(avd)+' MW':'—';$('nighthydro').textContent=hydro?fmt(avn)+' MW':'—';$('day2').textContent=hydro?fmt(avd)+' MW':'Not available';$('night2').textContent=hydro?fmt(avn)+' MW':'Not available';let hmax=Math.max(avd||0,avn||0,1);$('daybar').style.width=(hydro?Math.max(0,avd/hmax*100):0)+'%';$('nightbar').style.width=(hydro?Math.max(0,avn/hmax*100):0)+'%';$('coverage').textContent='96 / 96';
let select=$('series');select.replaceChildren(new Option('Source groups','groups'),new Option('Reported net total','total'));Object.keys(d.plants).sort().forEach(k=>select.add(new Option(k,'plant:'+k)));select.value='groups';draw();let sum=total.reduce((a,b)=>a+b,0);$('mix').replaceChildren();Object.entries(d.groups).sort((a,b)=>b[1].reduce((x,y)=>x+y,0)-a[1].reduce((x,y)=>x+y,0)).forEach(([name,arr],i)=>{let s=arr.reduce((a,b)=>a+b,0);let pct=sum?100*s/sum:NaN;let row=el('div','','mix-row');row.append(el('span',name),el('b',Number.isFinite(pct)?fmt(pct)+'%':'—'));let bar=el('div','','track'),fill=el('i','');fill.style.width=Math.max(0,Math.min(100,pct||0))+'%';fill.style.background=colors[i%colors.length];bar.append(fill);row.append(bar);$('mix').append(row)});
let solar=d.groups.Solar;if(solar){let mid=solar.slice(39,64);let peak=Math.max(...mid),low=Math.min(...mid);$('solar').textContent=`Between 10:00 and 16:00, reported solar ranged from ${fmt(low)} to ${fmt(peak)} MW. This is a dispatch observation, not a curtailment estimate.`}else $('solar').textContent='Solar observations are not available in this dataset.';
let events=[];Object.entries(d.plants).forEach(([name,arr])=>{for(let i=1;i<arr.length;i++){let drop=arr[i-1]-arr[i];if(drop>=100&&arr[i-1]>0&&drop/arr[i-1]>=.3)events.push({name,time:timestamp(i),drop})}});events.sort((a,b)=>b.drop-a.drop);$('events').replaceChildren();if(!events.length)$('events').append(el('p','No changes met this screening rule. This does not establish that no events occurred.','fine'));else events.slice(0,5).forEach(e=>{let row=el('div','','event');row.append(el('b',e.name),el('span',`${e.time} · −${fmt(e.drop)} MW`));$('events').append(row)});if(events.length>5)$('events').append(el('p',`${events.length} flags in total; largest five shown.`,'fine'));
$('provenance').replaceChildren();$('provenance').append(document.createTextNode(d.imported?'Local CSV supplied by you. No source independently verified.':`PUCSL · ${d.sheet} · SHA-256 ${d.sha256.slice(0,12)}… `));if(!d.imported){let a=el('a','View source ↗');a.href=d.source_url;a.target='_blank';a.rel='noopener';$('provenance').append(a)} }
document.querySelectorAll('[data-period]').forEach(button=>button.addEventListener('click',()=>{period=button.dataset.period;document.querySelectorAll('[data-period]').forEach(b=>{let active=b===button;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active))});draw()}));
let resizeTimer;window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(draw,150)});
$('series').addEventListener('change',draw);$('date').addEventListener('change',async e=>{if(e.target.value==='local'){show(imported);return}try{show(await fetchDay(e.target.value))}catch(err){$('state').textContent='Could not load date';$('status-detail').textContent=err.message}});
function csvRows(text){let rows=[],row=[],s='',q=false;for(let i=0;i<text.length;i++){let c=text[i];if(q){if(c==='"'&&text[i+1]==='"'){s+='"';i++}else if(c==='"')q=false;else s+=c}else if(c==='"'){if(s)throw Error('Invalid quote');q=true}else if(c===','){row.push(s);s=''}else if(c==='\n'){row.push(s.replace(/\r$/,''));rows.push(row);row=[];s=''}else s+=c}if(q)throw Error('Unclosed quote');if(s||row.length){row.push(s.replace(/\r$/,''));rows.push(row)}return rows.filter(r=>r.some(x=>x.trim()))}
function importCSV(text){let rows=csvRows(text.replace(/^\uFEFF/,''));let header=rows.shift().map(x=>x.trim().toLowerCase());let ix=['timestamp','source','category','mw'].map(k=>header.indexOf(k));if(ix.some(i=>i<0))throw Error('CSV must contain timestamp, source, category, mw headers.');let plants={},category={},allDates=[];for(let r of rows){let [t,name,g,v]=ix.map(i=>(r[i]??'').trim());if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::00)?(?:\+05:30)?$/.test(t)||!name||!g||v===''||!Number.isFinite(Number(v)))throw Error('Invalid row: use a local ISO timestamp, source, category and numeric MW.');let clean=t.replace(/\+05:30$/,'');let ms=Date.parse(clean+'Z');if(!Number.isFinite(ms)||new Date(ms).toISOString().slice(0,16)!==clean.slice(0,16)||ms%900000!==0)throw Error('Invalid quarter-hour timestamp.');if(category[name]&&category[name]!==g)throw Error('A source has more than one category.');category[name]=g;plants[name]??={};if(ms in plants[name])throw Error('Duplicate source and timestamp.');plants[name][ms]=Number(v);allDates.push(ms)}if(!allDates.length)throw Error('No observations.');let first=Math.min(...allDates),base=first-900000;if(new Date(base).toISOString().slice(11,16)!=='00:00')throw Error('First label must be 00:15 on the selected day.');let expected=Array.from({length:96},(_,i)=>base+(i+1)*900000),groups={};Object.keys(plants).forEach(name=>{if(Object.keys(plants[name]).length!==96||expected.some(t=>!(t in plants[name])))throw Error(`Source ${name} must have exactly 96 aligned observations.`);plants[name]=expected.map(t=>plants[name][t]);let g=category[name];groups[g]??=Array(96).fill(0);groups[g]=groups[g].map((v,i)=>v+plants[name][i])});return {date:new Date(base).toISOString().slice(0,10),sheet:'Local CSV',imported:true,groups,plants,total:Array.from({length:96},(_,i)=>Object.values(groups).reduce((s,a)=>s+a[i],0))}}
$('csv').addEventListener('change',async e=>{try{let f=e.target.files[0];if(!f)return;if(f.size>10_000_000)throw Error('CSV exceeds 10 MB.');imported=importCSV(await f.text());let option=$('date').querySelector('option[value="local"]');if(!option){option=new Option('Imported CSV','local');$('date').append(option)}option.textContent=imported.date+' · local CSV';$('date').value='local';show(imported);$('import-status').textContent='Imported successfully. This data remains in this session.'}catch(err){$('import-status').textContent='Import failed: '+err.message}finally{e.target.value=''}});
(async()=>{try{let r=await fetch('data/index.json');if(!r.ok)throw Error('Archive index unavailable');let data=await r.json();if(!data.dates.length)throw Error('No validated dates in archive');archiveDates=data.dates;data.dates.slice().reverse().forEach(d=>$('date').add(new Option(d,d)));$('date').dispatchEvent(new Event('change'))}catch(err){$('state').textContent='No archive available';$('status-detail').textContent=err.message}})();
if('serviceWorker'in navigator&&location.protocol!=='file:')navigator.serviceWorker.register('sw.js').catch(()=>{});
