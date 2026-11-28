(function(root){
  'use strict';
  const C=root.SLGIRenewableWatch,A=root.SLGIAnalytics,$=id=>document.getElementById(id);
  const number=value=>Number.isFinite(value)?new Intl.NumberFormat('en-LK',{maximumFractionDigits:1}).format(value):'Unavailable';
  const el=(tag,text,cls)=>{const node=document.createElement(tag);if(text!=null)node.textContent=text;if(cls)node.className=cls;return node};
  function attach(adapter){
    let report=null,ticket=0,initialized=false,selectedDate=null;
    const run=$('watch-run'),status=$('watch-status'),results=$('watch-results');
    const kinds=()=>$('watch-source').value==='both'?['solar','hydro']:[$('watch-source').value];
    function invalidate(){ticket++;report=null;selectedDate=null;results.hidden=true;$('watch-export').disabled=true;run.disabled=!initialized;run.textContent='Screen this month';status.textContent='Settings changed. Screen the month to update the calendar.'}
    function context(){
      if(initialized)return;const dates=adapter.dates();if(!dates.length)return;
      const months=[...new Set(dates.map(date=>date.slice(0,7)))].sort().reverse(),select=$('watch-month');
      select.replaceChildren();months.forEach(month=>select.add(new Option(new Intl.DateTimeFormat('en-LK',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(month+'-01T00:00:00Z')),month)));
      initialized=true;run.disabled=false;status.textContent='Choose a month and screen it. Dates are screening candidates, not confirmed curtailment.';
    }
    function dayState(row){const chosen=kinds().map(kind=>row[kind]);if(chosen.some(s=>s.status==='flagged'))return 'flagged';if(chosen.every(s=>s.status==='missing'))return 'missing';if(chosen.some(s=>s.status==='missing'))return 'partial';return 'no-flag'}
    function card(parent,title,value,note){const box=el('div',null,'watch-metric');box.append(el('span',title),el('strong',value),el('small',note));parent.append(box)}
    function render(){
      if(!report)return;results.hidden=false;
      const summary=$('watch-summary');summary.replaceChildren();const flagged=report.rows.filter(row=>dayState(row)==='flagged'),coincident=report.rows.filter(row=>row.coincident.length);
      card(summary,'Candidate dates',String(flagged.length),'At least one screening pattern in shown sources');
      card(summary,'Dates with overlapping flags',$('watch-source').value==='both'?String(coincident.length):'Both sources only','Coincident sample labels do not establish a common cause');
      card(summary,'Confirmed curtailment','Not established','No operator evidence is included in this archive');
      const coverage=$('watch-coverage');coverage.textContent=`Ground solar: ${report.solarDays}/${report.rows.length} days with an explicit complete series. Telemetered mini hydro: ${report.hydroDays}/${report.rows.length}. ${report.failed.length} archive downloads failed. A no-flag day is not proof of no curtailment.`;
      const calendar=$('watch-calendar');calendar.replaceChildren();
      const weekday=(new Date(report.month+'-01T00:00:00Z').getUTCDay()+6)%7;
      for(let blank=0;blank<weekday;blank++)calendar.append(el('span',null,'watch-blank'));
      report.rows.forEach(row=>{
        const state=dayState(row),button=el('button',null,'watch-day watch-'+state);button.type='button';button.append(el('strong',row.date.slice(8)));
        const labels=kinds().map(kind=>`${C.SOURCES[kind].name}: ${row[kind].status==='flagged'?'screening flag':row[kind].status==='missing'?'target series unavailable':row[kind].referenceDays.length<4?'no shape flag; insufficient historical reference':'no screening flag'}`);
        button.title=row.date+' · '+labels.join(' · ');button.setAttribute('aria-label',button.title);
        const marks=el('span',null,'watch-day-marks');kinds().forEach(kind=>{const s=row[kind],mark=el('span',kind==='solar'?'S':'H','watch-mark '+(s.status==='flagged'?'flag':s.status==='missing'?'absent':'screened'));mark.title=C.SOURCES[kind].name;marks.append(mark)});button.append(marks);
        if(row.date===selectedDate){button.classList.add('selected');button.setAttribute('aria-pressed','true')}else button.setAttribute('aria-pressed','false');
        button.addEventListener('click',()=>{selectedDate=row.date;render();$('watch-detail').scrollIntoView({behavior:'smooth',block:'start'})});calendar.append(button);
      });
      const list=$('watch-date-list');list.replaceChildren();
      if(!flagged.length)list.append(el('p','No dates met these screening rules in the available target data. This does not rule out curtailment.','watch-copy'));
      flagged.forEach(row=>{const button=el('button',null,'watch-date-row');button.type='button';button.append(el('strong',row.date));const labels=kinds().filter(kind=>row[kind].status==='flagged').map(kind=>`${C.SOURCES[kind].name}: ${row[kind].events.length} pattern signal${row[kind].events.length===1?'':'s'}`);button.append(el('span',labels.join(' · ')));if(row.coincident.length&&kinds().length===2)button.append(el('small',`${row.coincident.length} coincident flagged sample labels`));button.addEventListener('click',()=>{selectedDate=row.date;render();$('watch-detail').scrollIntoView({behavior:'smooth',block:'start'})});list.append(button)});
      renderDetail();
    }
    function plot(parent,s){
      const wrap=el('div',null,'watch-plot');parent.append(wrap);
      const W=Math.max(240,Math.min(760,Math.round(parent.clientWidth)||320)),H=260,L=48,R=12,T=18,B=34;
      const max=Math.max(1,...s.values,...(s.baseline||[])),x=i=>L+i/95*(W-L-R),y=v=>T+(max-v)/max*(H-T-B),ns='http://www.w3.org/2000/svg';
      const svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox',`0 0 ${W} ${H}`);svg.setAttribute('role','img');svg.setAttribute('aria-label',`${s.name}: selected date and recent reference. Orange points show screening flags, not confirmed curtailment. Exact sample windows are listed below.`);
      const add=(tag,attrs,text)=>{const n=document.createElementNS(ns,tag);Object.entries(attrs).forEach(([k,v])=>n.setAttribute(k,String(v)));if(text!=null)n.textContent=text;svg.append(n);return n};
      const start=Math.max(0,s.rules.startHour*4-1),end=s.rules.endHour*4-1;
      add('rect',{x:x(start),y:T,width:x(end)-x(start),height:H-T-B,fill:'#eef4df'});
      for(let i=0;i<4;i++){const v=max*(1-i/3);add('line',{x1:L,x2:W-R,y1:y(v),y2:y(v),stroke:'#dfe8df'});add('text',{x:L-7,y:y(v)+4,'text-anchor':'end','font-size':12,fill:'#5d786a'},Math.round(v))}
      add('text',{x:3,y:12,'font-size':12,fill:'#5d786a'},'MW');
      if(s.baseline)add('polyline',{points:s.baseline.map((v,i)=>`${x(i)},${y(v)}`).join(' '),fill:'none',stroke:'#8a9d91','stroke-width':2,'stroke-dasharray':'5 4'});
      add('polyline',{points:s.values.map((v,i)=>`${x(i)},${y(v)}`).join(' '),fill:'none',stroke:s.kind==='solar'?'#a16c10':'#087d93','stroke-width':2.5});
      s.flaggedIndices.forEach(i=>add('circle',{cx:x(i),cy:y(s.values[i]),r:3.3,fill:'#be542a',stroke:'#fff','stroke-width':1}));
      [0,47,95].forEach(i=>add('text',{x:x(i),y:H-9,'text-anchor':i===0?'start':i===95?'end':'middle','font-size':12,fill:'#5d786a'},C.clock(i)));
      wrap.append(svg);parent.append(el('p',`Solid: ${s.date}. ${s.baseline?'Dashed: median of '+s.referenceDays.length+' preceding complete days.':'Historical reference unavailable: fewer than four comparable days.'} Shading: screening window. Orange: flagged readings.`,'watch-chart-key'));
    }
    function renderDetail(){
      const detail=$('watch-detail');detail.replaceChildren();if(!report)return;
      const row=report.rows.find(item=>item.date===selectedDate);if(!row){detail.append(el('p','Tap a date to inspect its sources and sample windows.','watch-copy'));return}
      detail.append(el('h4',row.date+' · daytime investigation'));
      if(row.coincident.length&&kinds().length===2)detail.append(el('p',`${row.coincident.length} flagged sample labels coincide between solar and mini hydro. This is context for investigation; weather, telemetry or other changes can also affect both sources.`,'watch-caution'));
      const labels=[];
      kinds().forEach(kind=>{
        const s=row[kind],section=el('article',null,'watch-source-card');section.append(el('h5',s.name));
        const badge=el('span',s.status==='flagged'?'Screening flag · unconfirmed':s.status==='missing'?'Not screened':'No screening flag','watch-badge '+s.status);section.append(badge);
        if(s.status==='missing'){section.append(el('p',s.reason+' Broad solar or mini-hydro groups are not substituted.','watch-copy'));detail.append(section);return}
        labels.push(s.label);section.append(el('p',s.label+' · publisher-labelled aggregate; individual plants are not identified.','watch-copy'));
        section.append(el('p',`Window mean: ${number(s.stats.dayMean)} MW · highest window reading: ${number(s.stats.peak)} MW${kind==='hydro'?' · same-day overnight mean: '+number(s.stats.nightMean)+' MW':''}.`,'watch-copy'));
        detail.append(section);plot(section,s);
        if(!s.events.length)section.append(el('p',`No pattern met the selected rules. ${s.referenceDays.length<4?'Only the within-day drop screen could run; the historical comparison lacks enough complete reference days.':'This does not establish that the day was free of curtailment.'}`,'watch-copy'));
        const signals=el('div',null,'watch-signals');
        s.events.slice().sort((a,b)=>a.start-b.start).forEach(e=>{
          const item=el('div');item.append(el('strong',e.type));item.append(el('span',`Sample labels ${C.clock(e.start)}–${C.clock(e.end)} · ${e.samples} readings · ${e.sampledSpanMinutes}-minute sampled span`));
          item.append(el('span',`Mean output ${number(e.meanMW)} MW vs ${e.type==='Below recent reference range'?'recent median profile':'pre-drop level'} ${number(e.baselineMW)} MW (${number(e.dropPercent)}% lower).`));
          if(e.recoveryIndex!==null)item.append(el('span','Observed recovery label: '+C.clock(e.recoveryIndex)));
          item.append(el('small','Sampled span is not confirmed curtailment duration. Reference differences are not curtailed power or lost energy.'));signals.append(item);
        });section.append(signals);
        const refs=el('details',null,'watch-method');refs.append(el('summary','Reference dates and source record'));refs.append(el('p',s.referenceDays.length?s.referenceDays.join(', '):'No comparable previous days available.','watch-copy'));
        if(s.sourceUrl){const link=el('a','Open published source record');try{const u=new URL(s.sourceUrl);if(u.protocol==='https:'&&u.hostname==='gendata.pucsl.gov.lk'){link.href=s.sourceUrl;link.target='_blank';link.rel='noopener';refs.append(link)}}catch(_){}}
        if(s.sha256)refs.append(el('p','SHA-256: '+s.sha256,'watch-hash'));section.append(refs);
      });
      if(labels.length){const button=el('button','Open these series in the main chart','watch-open-chart');button.type='button';button.addEventListener('click',async()=>{button.disabled=true;try{await adapter.open(row.date,labels,row.solar.rules)}catch(error){status.textContent='Could not open date: '+error.message}finally{button.disabled=false}});detail.append(button)}
    }
    async function scan(){
      if(!initialized)return;const month=$('watch-month').value,[start,end]=$('watch-window').value.split('-').map(Number),relativeDrop=Number($('watch-drop').value),minSamples=Number($('watch-samples').value),request=++ticket;
      report=null;results.hidden=true;$('watch-export').disabled=true;run.disabled=true;run.textContent='Screening…';status.textContent='Loading archived month and previous seven days…';
      try{
        const monthDates=C.monthDates(month),available=new Set(adapter.dates()),targets=[...new Set([...monthDates,...Array.from({length:7},(_,i)=>A.shiftDate(monthDates[0],-i-1))])].filter(date=>available.has(date)),days={},failed=[];
        let cursor=0,completed=0;
        await Promise.all(Array.from({length:Math.min(4,targets.length)},async()=>{while(cursor<targets.length){if(request!==ticket)return;const date=targets[cursor++];try{days[date]=await adapter.load(date)}catch(_){failed.push(date)}completed++;if(request===ticket)status.textContent=`Loaded ${completed} of ${targets.length} archived dates…`}}));
        if(request!==ticket)return;
        report={...C.scanMonth(month,days,{startHour:start,endHour:end,relativeDrop,minSamples}),failed};
        selectedDate=report.rows.find(row=>dayState(row)==='flagged')?.date||report.rows.find(row=>dayState(row)!=='missing')?.date||report.rows[0].date;
        render();$('watch-export').disabled=false;status.textContent=`Screen complete · ${month} · ${start}:00–${end}:00 Sri Lanka time. All flags are unconfirmed investigation candidates.`;
      }catch(error){if(request===ticket)status.textContent='Screen unavailable: '+error.message}
      finally{if(request===ticket){run.disabled=false;run.textContent='Screen this month'}}
    }
    ['watch-month','watch-window','watch-drop','watch-samples'].forEach(id=>$(id).addEventListener('change',invalidate));
    $('watch-source').addEventListener('change',()=>{if(report){selectedDate=report.rows.find(row=>dayState(row)==='flagged')?.date||selectedDate;render()}});
    run.addEventListener('click',scan);
    $('watch-export').addEventListener('click',()=>{if(!report)return;const text=C.csv(report,kinds()),url=URL.createObjectURL(new Blob([text],{type:'text/csv;charset=utf-8'})),link=el('a');link.href=url;link.download=`SLGI-renewable-screen-${report.month}-${$('watch-source').value}.csv`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000)});
    return {context};
  }
  root.SLGIRenewableWatchUI={attach};
})(typeof globalThis==='undefined'?this:globalThis);
