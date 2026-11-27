(function(root){
  'use strict';
  const A=root.SLGIAnalytics,$=id=>document.getElementById(id);
  const number=v=>Number.isFinite(v)?new Intl.NumberFormat('en-LK',{maximumFractionDigits:1}).format(v):'Unavailable';
  const signed=v=>(v>0?'+':'')+number(v);
  const time=index=>{const minute=(index+1)*15;return String(Math.floor(minute/60)).padStart(2,'0')+':'+String(minute%60).padStart(2,'0')};
  const hourLabel=hour=>String(hour).padStart(2,'0')+':00–'+String(hour+1).padStart(2,'0')+':00';
  function el(tag,text,cls){const node=document.createElement(tag);if(text!=null)node.textContent=text;if(cls)node.className=cls;return node}
  function attach(adapter){
    let ticket=0,view='compare',report=null;
    const result=$('analysis-results'),status=$('analysis-status'),run=$('run-analysis');
    function invalidate(message='Settings changed. Run analysis to update the results.'){
      ticket++;report=null;result.replaceChildren();$('save-analysis').disabled=true;run.disabled=!adapter.current()||!!adapter.current()?.imported;run.textContent='Analyze selected day';status.textContent=message;
    }
    function context(){
      const current=adapter.current();invalidate('Choose a question and source, then tap Analyze selected day.');if(!current)return;
      $('analysis-date').textContent=current.date+' · '+new Intl.DateTimeFormat('en-LK',{weekday:'long',timeZone:'UTC'}).format(new Date(current.date+'T00:00:00Z'));
      const source=$('analysis-source'),previous=source.value;source.replaceChildren(new Option('Reported net total','total'));
      Object.keys(current.groups||{}).sort().forEach(name=>source.add(new Option(name,name)));if([...source.options].some(o=>o.value===previous))source.value=previous;
      const compare=$('analysis-reference'),dates=adapter.dates().filter(date=>date!==current.date).slice().reverse();compare.replaceChildren(new Option('Choose a comparison day',''));
      dates.forEach(date=>compare.add(new Option(date,date)));
      const before=dates.find(date=>date<current.date);if(before)compare.value=before;
      if(current.imported){run.disabled=true;status.textContent='Select an archived date above to use historical analysis. Imported CSV remains a separate, unverified session.'}
    }
    function metric(parent,title,value,note){const card=el('div',null,'analysis-metric');card.append(el('span',title),el('strong',value),el('small',note));parent.append(card)}
    function paragraph(parent,text,cls='analysis-copy'){parent.append(el('p',text,cls))}
    function chart(parent,lines,{band=null,flags=[]}={}){
      const holder=el('div',null,'analysis-plot');parent.append(holder);
      const width=Math.max(240,Math.min(760,Math.round(result.clientWidth)||320)),height=270,left=52,right=12,top=20,bottom=38;
      const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox',`0 0 ${width} ${height}`);svg.setAttribute('role','img');
      svg.setAttribute('aria-label',band?'Selected readings and historical median with screening band. Exact flags are listed below.':'Selected day and comparison day, aligned by Sri Lankan time. Statistics and differences are listed nearby.');
      const values=lines.flatMap(line=>line.values).concat(band?band.flatMap(point=>[point.lower,point.upper]):[]).filter(Number.isFinite);
      const low=Math.min(0,...values),high=Math.max(1,...values),x=i=>left+i/95*(width-left-right),y=v=>top+(high-v)/(high-low)*(height-top-bottom);
      function add(tag,attrs,text){const n=document.createElementNS(ns,tag);Object.entries(attrs).forEach(([k,v])=>n.setAttribute(k,String(v)));if(text!=null)n.textContent=text;svg.append(n);return n}
      for(let i=0;i<4;i++){const value=high-(high-low)*i/3;add('line',{x1:left,x2:width-right,y1:y(value),y2:y(value),stroke:'#dce7e3'});add('text',{x:left-7,y:y(value)+4,'text-anchor':'end','font-size':12,fill:'#587368'},Math.round(value).toLocaleString('en-LK'))}
      add('text',{x:4,y:14,'font-size':12,fill:'#587368'},'MW');
      if(band)add('polygon',{points:band.map(p=>`${x(p.index)},${y(p.upper)}`).concat(band.slice().reverse().map(p=>`${x(p.index)},${y(p.lower)}`)).join(' '),fill:'#dce9e2'});
      lines.forEach(line=>add('polyline',{points:line.values.map((v,i)=>`${x(i)},${y(v)}`).join(' '),fill:'none',stroke:line.color,'stroke-width':2.4,'stroke-linejoin':'round'}));
      flags.forEach(point=>add('circle',{cx:x(point.index),cy:y(point.value),r:3.5,fill:'#b74534',stroke:'#fff','stroke-width':1}));
      [0,47,95].forEach(i=>add('text',{x:x(i),y:height-12,'text-anchor':i===0?'start':i===95?'end':'middle','font-size':12,fill:'#587368'},time(i)));
      holder.append(svg);const legend=el('div',null,'analysis-legend');lines.forEach(line=>{const item=el('span',line.name),dot=el('i');dot.style.background=line.color;item.prepend(dot);legend.append(item)});if(band)legend.append(el('span','Shaded: historical screening band · red: outside band'));parent.append(legend);
    }
    function renderCompare(r){
      const {comparison:c,selected,reference,sourceName}=r;
      result.append(el('h4','What changed between the days?'));
      if(!c){paragraph(result,`A complete ${sourceName} series is not available for both days. Choose another comparison day or source. Missing readings are never filled with zero.`);return}
      paragraph(result,`${selected.date}: mean ${sourceName} was ${number(c.current.average)} MW, ${c.delta===0?'unchanged':(c.delta>0?'higher':'lower')+' by '+number(Math.abs(c.delta))+' MW'} compared with ${reference.date}${c.percent===null?'':` (${signed(c.percent)}%)`}.`,'analysis-answer');
      const cards=el('div',null,'analysis-metrics');
      metric(cards,'Mean change',signed(c.delta)+' MW','Selected day minus comparison day');
      metric(cards,'Peak reading',number(c.current.peak)+' MW','At '+time(c.current.peakIndex)+' · '+selected.date);
      metric(cards,'Largest gap',signed(c.difference[c.largestIndex])+' MW','At '+time(c.largestIndex)+' · same time of day');
      result.append(cards);
      chart(result,[{name:selected.date,values:A.valuesFor(selected,r.source),color:'#153e35'},{name:reference.date,values:A.valuesFor(reference,r.source),color:'#0876bd'}]);
      const weekday=date=>new Intl.DateTimeFormat('en-LK',{weekday:'long',timeZone:'UTC'}).format(new Date(date+'T00:00:00Z'));
      paragraph(result,`${selected.date} is ${weekday(selected.date)}${root.SLGIHolidays?.data[selected.date]?' · '+root.SLGIHolidays.data[selected.date]:''}. ${reference.date} is ${weekday(reference.date)}${root.SLGIHolidays?.data[reference.date]?' · '+root.SLGIHolidays.data[reference.date]:''}. Weather, source coverage and operating conditions may differ.`);
      const shifts=A.sourceChanges(selected,reference);
      result.append(el('h4','Largest source changes'));
      paragraph(result,'Differences in mean reported MW across the complete day. These show changes, without establishing their cause.');
      const list=el('div',null,'analysis-rank');shifts.available.slice(0,5).forEach(item=>{const row=el('div');row.append(el('span',item.source),el('strong',signed(item.delta)+' MW'));list.append(row)});result.append(list);
      if(shifts.missing.length)paragraph(result,'Cannot compare missing or incomplete sources: '+shifts.missing.join(', ')+'.','analysis-caution');
      const similar=A.similarDays(selected,r.days,r.source);
      if(similar.length){
        result.append(el('h4','Find a similar daily shape'));
        paragraph(result,'Closest shapes among the earlier days loaded for this analysis. Curves are normalized by RMS output; distance is a mathematical difference, not a probability or forecast. Smaller is closer.');
        const choices=el('div',null,'analysis-similar');similar.forEach(item=>{const button=el('button',`${item.date} · distance ${item.distance.toFixed(3)}`);button.type='button';button.addEventListener('click',()=>{$('analysis-reference').value=item.date;analyze()});choices.append(button)});result.append(choices);
      }
    }
    function renderUnusual(r){
      const screen=r.screen;result.append(el('h4','Do any readings stand out?'));
      if(!screen.ready){paragraph(result,screen.reason+' The screen needs at least four complete matching weekdays from the previous eight weeks.','analysis-answer');return}
      paragraph(result,`${screen.flags.length} of 96 readings fall outside the historical screening band for ${r.sourceName}. The reference uses ${screen.days.length} previous matching weekdays.`,'analysis-answer');
      chart(result,[{name:r.selected.date,values:A.valuesFor(r.selected,r.source),color:'#153e35'},{name:'Historical median',values:screen.points.map(p=>p.median),color:'#0876bd'}],{band:screen.points,flags:screen.flags});
      paragraph(result,'This is a descriptive statistical screen. A flag is not evidence of a trip, outage, fault or curtailment; no flags does not prove normal operation.','analysis-caution');
      const list=el('div',null,'analysis-flags');screen.flags.slice().sort((a,b)=>Math.abs(b.deviation)-Math.abs(a.deviation)).slice(0,5).forEach(point=>{const row=el('div'),button=el('button','Inspect on chart');button.type='button';button.addEventListener('click',()=>adapter.inspect(point.index));row.append(el('strong',time(point.index)+' · '+number(point.value)+' MW'),el('span',signed(point.deviation)+' MW from historical median'),button);list.append(row)});result.append(list);
      const details=el('details',null,'analysis-method');details.append(el('summary','How the screening band is calculated'));paragraph(details,'At each quarter-hour label: median ± max(30 MW, 3 × 1.4826 × median absolute deviation). The 30 MW floor and multiplier are screening choices, not utility protection settings or a validated confidence interval. Matching weekdays do not control for holidays, weather, source coverage or dispatch changes.');paragraph(details,'Reference dates: '+screen.days.join(', '));result.append(details);
    }
    function renderPattern(r){
      const p=r.pattern;result.append(el('h4','When was output high or low?'));
      if(!p.peak){paragraph(result,'No complete days for this source in the requested window.');return}
      paragraph(result,`${p.available} of ${p.total} days available for ${r.sourceName}. The highest hourly mean in this window was ${number(p.peak.value)} MW on ${p.peak.date}, ${hourLabel(p.peak.hour)}.`,'analysis-answer');
      paragraph(result,'Each cell averages four reported readings ending within that hour. Darker cells mean higher output magnitude; purple shows negative values, and hatching means missing data. This is reported power in MW, not measured hourly energy. Swipe the table sideways on a phone.');
      const scroller=el('div',null,'heatmap-scroll');scroller.tabIndex=0;scroller.setAttribute('aria-label','Hourly output heatmap. Scroll horizontally to see all hours.');
      const table=el('table',null,'analysis-heatmap'),caption=el('caption',`${r.sourceName} · hourly mean MW · Sri Lanka time`),head=el('thead'),heading=el('tr');heading.append(el('th','Date'));
      for(let hour=0;hour<24;hour++){const th=el('th',String(hour).padStart(2,'0'));th.scope='col';heading.append(th)}head.append(heading);table.append(caption,head);
      const body=el('tbody'),finite=p.rows.flatMap(row=>row.values).filter(Number.isFinite),scale=Math.max(1,...finite.map(Math.abs));
      const detail=el('div','Tap a cell for the exact hourly mean.','heatmap-detail');detail.setAttribute('aria-live','polite');
      p.rows.forEach(row=>{const tr=el('tr'),label=el('th',row.date.slice(5));label.scope='row';label.title=row.date;tr.append(label);row.values.forEach((value,hour)=>{const td=el('td');if(!Number.isFinite(value)){td.className='heatmap-missing';td.title=row.date+' '+hourLabel(hour)+' · no complete data';td.append(el('span','—'))}else{const cell=el('button');cell.type='button';const intensity=Math.abs(value)/scale;cell.style.background=`hsl(${value<0?280:160} 35% ${96-intensity*62}%)`;cell.style.color=intensity>.55?'#fff':'#254f40';cell.title=`${row.date} · ${hourLabel(hour)} · ${number(value)} MW`;cell.setAttribute('aria-label',cell.title);cell.addEventListener('click',()=>{detail.replaceChildren(el('span',cell.title+' · mean of four reported readings.' ));const open=el('button','Open this day');open.type='button';open.addEventListener('click',()=>adapter.openDate(row.date));detail.append(open)});td.append(cell)}tr.append(td)});body.append(tr)});
      table.append(body);scroller.append(table);result.append(scroller,detail);
      const hourly=p.averages.filter(item=>Number.isFinite(item.value)).sort((a,b)=>b.value-a.value),best=hourly[0];
      paragraph(result,`Across the available days, the highest mean hour is ${hourLabel(best.hour)} at ${number(best.value)} MW (${best.count} days). This historical pattern is not a forecast.`);
    }
    function render(){
      result.replaceChildren();if(!report)return;
      if(view==='compare')renderCompare(report);else if(view==='unusual')renderUnusual(report);else renderPattern(report);
      const quality=el('details',null,'analysis-method');quality.append(el('summary','Data coverage & limitations'));
      paragraph(quality,`Selected day: ${report.selected.date}. Source: ${report.sourceName}. ${Object.keys(report.days).length} archived dates loaded; ${report.failed.length} failed to load. Comparison, weekday baseline and heatmap can use different subsets. Missing data stays missing. Results describe reported power and may include estimated or aggregated generation.`);
      if(report.failed.length)paragraph(quality,'Failed dates: '+report.failed.join(', '));
      paragraph(quality,'The app does not establish causes, available capacity, curtailed energy or future output. Imported files are not mixed into this archive analysis. All analysis runs in your browser.');result.append(quality);
    }
    async function analyze(){
      const selected=adapter.current();if(!selected||selected.imported)return;
      const source=$('analysis-source').value,sourceName=source==='total'?'reported net total':source,referenceDate=$('analysis-reference').value,span=Number($('analysis-span').value);
      const request=++ticket;report=null;result.replaceChildren();$('save-analysis').disabled=true;run.disabled=true;run.textContent='Analyzing…';status.textContent='Loading saved readings. No live measurements or forecasts are requested.';
      try{
        const days={[selected.date]:selected},failed=[],available=new Set(adapter.dates());
        const targets=[...new Set([referenceDate,...Array.from({length:span},(_,i)=>A.shiftDate(selected.date,-i)),...A.weekdayDates(selected.date,adapter.dates())])].filter(date=>date&&date!==selected.date&&available.has(date));
        let cursor=0,completed=0;
        await Promise.all(Array.from({length:Math.min(4,targets.length)},async()=>{while(cursor<targets.length){if(request!==ticket)return;const date=targets[cursor++];try{days[date]=await adapter.load(date)}catch(_){failed.push(date)}completed++;if(request===ticket)status.textContent=`Loaded ${completed} of ${targets.length} reference days…`}}));
        if(request!==ticket)return;
        if(!A.valuesFor(selected,source))throw Error('The selected source has no complete 96-point day. Choose another source.');
        const reference=days[referenceDate]||null;
        report={selected,reference,source,sourceName,referenceDate,days,failed,comparison:A.compareDays(selected,reference,source),screen:A.unusualReadings(selected,days,source),pattern:A.hourlyPattern(selected.date,days,source,span)};
        render();$('save-analysis').disabled=false;status.textContent=`Analysis ready · ${selected.date} · ${sourceName} · archived data, not live.`;
      }catch(error){if(request===ticket)status.textContent='Analysis unavailable: '+error.message}
      finally{if(request===ticket){run.disabled=false;run.textContent='Analyze selected day'}}
    }
    function save(){
      if(!report)return;const r=report,c=r.comparison,p=r.pattern,s=r.screen;
      const text=['SLGI · ARCHIVED DISPATCH ANALYSIS',`Selected date: ${r.selected.date}`,`Source: ${r.sourceName}`,`Comparison date: ${r.referenceDate||'not selected'}`,'All times: Sri Lanka (UTC+05:30). Values: reported MW.','',
        c?`Mean: ${number(c.current.average)} MW; comparison mean: ${number(c.baseline.average)} MW; difference: ${signed(c.delta)} MW${c.percent===null?'':` (${signed(c.percent)}%)`}.`:'Comparison unavailable: complete source readings were not available for both days.',
        c?`Peak: ${number(c.current.peak)} MW at ${time(c.current.peakIndex)}. Largest same-time gap: ${signed(c.difference[c.largestIndex])} MW at ${time(c.largestIndex)}.`:'',
        s.ready?`Historical screen: ${s.flags.length}/96 flagged readings using ${s.days.length} matching weekdays.`:s.reason,
        'Screen: median ± max(30 MW, 3 × 1.4826 × MAD), separately at each time; at least four previous matching weekdays in the last eight weeks. Not a validated confidence interval.',
        'Baseline dates: '+s.days.join(', '),
        p.peak?`Hourly window: ${p.available}/${p.total} days. Highest hourly mean: ${number(p.peak.value)} MW on ${p.peak.date}, ${hourLabel(p.peak.hour)}.`:'No complete source data for the hourly window.',
        '', 'SOURCE MEAN CHANGES',...A.sourceChanges(r.selected,r.reference).available.map(item=>`${item.source}: ${signed(item.delta)} MW`),
        '', 'FLAGGED READINGS',...s.flags.map(point=>`${time(point.index)}: ${number(point.value)} MW; median ${number(point.median)} MW; difference ${signed(point.deviation)} MW`),
        '',`Load failures: ${r.failed.length? r.failed.join(', '):'none'}`,
        'Limitations: reported power, not verified energy; estimates and aggregates may be included. Missing data is never zero. Weather, holidays, source coverage and dispatch changes affect comparisons. Flags do not prove outages, faults or curtailment. No prediction is made.',
        '', 'SOURCE RECORDS',...Object.entries(r.days).sort().map(([date,day])=>`${date} | ${day.source_url||'Source URL unavailable'} | SHA-256 ${day.sha256||'unavailable'}`)
      ].filter(line=>line!==undefined).join('\n');
      const url=URL.createObjectURL(new Blob([text],{type:'text/plain;charset=utf-8'})),link=el('a');link.href=url;link.download=`SLGI-analysis-${r.selected.date}.txt`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    }
    document.querySelectorAll('[data-analysis-view]').forEach(button=>button.addEventListener('click',()=>{view=button.dataset.analysisView;document.querySelectorAll('[data-analysis-view]').forEach(b=>{b.setAttribute('aria-pressed',String(b===button));b.classList.toggle('active',b===button)});render()}));
    ['analysis-source','analysis-reference','analysis-span'].forEach(id=>$(id).addEventListener('change',()=>invalidate()));
    $('analysis-last-week').addEventListener('click',()=>{const date=adapter.current()?.date;if(!date)return;const previous=A.shiftDate(date,-7);if(!adapter.dates().includes(previous)){status.textContent=previous+' has no saved data. Choose another comparison day.';return}$('analysis-reference').value=previous;invalidate('Same weekday selected. Tap Analyze selected day.')});
    $('analysis-previous').addEventListener('click',()=>{const date=adapter.current()?.date,previous=adapter.dates().filter(d=>d<date).sort().at(-1);if(!previous){status.textContent='No earlier saved day is available.';return}$('analysis-reference').value=previous;invalidate('Previous saved day selected: '+previous+'. Tap Analyze selected day.')});
    run.addEventListener('click',analyze);$('save-analysis').addEventListener('click',save);
    return {context};
  }
  root.SLGIAnalyst={attach};
})(typeof globalThis==='undefined'?this:globalThis);
