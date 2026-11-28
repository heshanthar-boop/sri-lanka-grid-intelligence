// Screening heuristics for explicitly labelled aggregate series; never confirmation.
(function(root){
  'use strict';
  const A=typeof module!=='undefined'&&module.exports?require('./analytics.js'):root.SLGIAnalytics;
  const SOURCES={solar:{name:'Ground-mounted solar',minMW:5},hydro:{name:'Mini hydro · telemetered',minMW:10}};
  const normalize=value=>String(value||'').toLowerCase().replace(/\[id\s+\d+\]/g,'').replace(/[^a-z0-9]+/g,' ').trim();
  const mean=values=>values.reduce((sum,value)=>sum+value,0)/values.length;
  const clock=index=>{const m=(index+1)*15;return String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0')};
  function extract(day,kind){
    if(!SOURCES[kind])throw Error('Unknown renewable source');
    const candidates=Object.entries(day?.plants||{}).filter(([label])=>{
      const name=normalize(label),category=normalize(day?.plant_categories?.[label]);
      if(kind==='solar')return !/roof|forecast|p50/.test(name+' '+category)&&/solar/.test(name+' '+category)&&/ground mounted/.test(name+' '+category);
      return /mini\s*hydro/.test(name+' '+category)&&/telemetered/.test(name+' '+category)&&!/estimated|non\s*telemetered/.test(name+' '+category);
    });
    if(candidates.length!==1)return {ok:false,reason:candidates.length?'Ambiguous overlapping aggregate series; not combined.':'Explicit target series not available.'};
    const [label,values]=candidates[0];
    if(!Array.isArray(values)||values.length!==96||!values.every(v=>Number.isFinite(v)&&v>=0))return {ok:false,label,reason:'Incomplete, invalid or negative target readings.'};
    return {ok:true,label,values};
  }
  function rules(kind,options={}){
    const start=options.startHour??9,end=options.endHour??16,relative=options.relativeDrop??.3,minSamples=options.minSamples??3;
    if(!Number.isInteger(start)||!Number.isInteger(end)||start<6||end>18||start>=end||![.2,.3,.4].includes(relative)||![3,4].includes(minSamples))throw Error('Invalid screening settings');
    return {startHour:start,endHour:end,relativeDrop:relative,minSamples,minMW:SOURCES[kind].minMW};
  }
  function consecutive(indices,minimum){
    const groups=[];let run=[];
    for(const index of indices){if(run.length&&index!==run.at(-1)+1){if(run.length>=minimum)groups.push(run);run=[]}run.push(index)}
    if(run.length>=minimum)groups.push(run);return groups;
  }
  function event(type,indices,actual,reference,recoveryIndex=null){
    const baselineMW=Array.isArray(reference)?mean(indices.map(i=>reference[i])):reference,meanMW=mean(indices.map(i=>actual[i]));
    return {type,start:indices[0],end:indices.at(-1),indices,samples:indices.length,sampledSpanMinutes:(indices.at(-1)-indices[0])*15,baselineMW,meanMW,dropMW:baselineMW-meanMW,dropPercent:baselineMW>0?(baselineMW-meanMW)/baselineMW*100:null,recoveryIndex};
  }
  function screenDay(day,kind,history={},options={}){
    if(!SOURCES[kind])throw Error('Unknown renewable source');
    const settings=rules(kind,options),series=extract(day,kind),date=day?.date||null;
    const base={date,kind,name:SOURCES[kind].name,rules:settings,events:[],flaggedIndices:[],referenceDays:[],baseline:null,sourceUrl:day?.source_url||'',sha256:day?.sha256||''};
    if(!series.ok)return {...base,status:'missing',reason:series.reason,label:series.label||''};
    const values=series.values,window=Array.from({length:96},(_,i)=>i).filter(i=>(i+1)*15>settings.startHour*60&&(i+1)*15<=settings.endHour*60);
    const first=window[0],last=window.at(-1),peak=Math.max(...window.map(i=>values[i])),events=[];
    // Require an abrupt step from an established pre-step level, then a sustained lower run.
    for(let i=first;i<=last-settings.minSamples+1;i++){
      const prior=A.median(values.slice(i-3,i)),value=values[i],previous=values[i-1];
      const gate=Math.max(settings.minMW*2,peak*.3),threshold=Math.max(settings.minMW,prior*settings.relativeDrop);
      if(prior<gate||prior-value<threshold||previous-value<Math.max(settings.minMW/2,previous*settings.relativeDrop))continue;
      const cutoff=prior-Math.max(settings.minMW/2,prior*settings.relativeDrop*.75);let end=i;
      while(end+1<=last&&values[end+1]<=cutoff)end++;
      if(end-i+1<settings.minSamples)continue;
      let recovery=null;for(let j=end+1;j<=Math.min(last,end+4);j++)if(values[j]>=prior*.85){recovery=j;break}
      events.push(event(recovery===null?'Sustained output drop':'Drop with observed recovery',Array.from({length:end-i+1},(_,offset)=>i+offset),values,prior,recovery));
      i=end;
    }
    // A rolling seven-calendar-day baseline excludes today and future observations.
    const references=[];
    for(let back=1;back<=7;back++){
      const referenceDate=A.shiftDate(date,-back),referenceDay=history[referenceDate],s=extract(referenceDay,kind);
      if(s.ok&&referenceDay.date===referenceDate&&s.label===series.label)references.push({date:referenceDate,values:s.values});
    }
    let baseline=null;
    if(references.length>=4){
      baseline=values.map((_,i)=>A.median(references.map(row=>row.values[i])));
      const historicalPeak=Math.max(...window.map(i=>baseline[i])),below=window.filter(i=>{
        const center=baseline[i],mad=A.median(references.map(row=>Math.abs(row.values[i]-center)));
        return center>=Math.max(settings.minMW*2,historicalPeak*.3)&&center-values[i]>Math.max(settings.minMW,center*settings.relativeDrop,3*1.4826*mad);
      });
      consecutive(below,settings.minSamples).forEach(indices=>events.push(event('Below recent reference range',indices,values,baseline)));
    }
    const flaggedIndices=[...new Set(events.flatMap(item=>item.indices))].sort((a,b)=>a-b);
    const night=values.filter((_,i)=>(i+1)*15<=360||(i+1)*15>1080);
    return {...base,status:events.length?'flagged':'no-flag',label:series.label,values,window,events,flaggedIndices,referenceDays:references.map(row=>row.date),baseline,
      stats:{dayMean:mean(window.map(i=>values[i])),nightMean:mean(night),peak,windowSamples:window.length}};
  }
  function monthDates(month){
    if(!/^\d{4}-\d{2}$/.test(month))throw Error('Invalid screening month');
    const first=month+'-01',next=new Date(first+'T00:00:00Z');
    if(!Number.isFinite(next.valueOf())||next.toISOString().slice(0,7)!==month)throw Error('Invalid screening month');
    const out=[];for(let i=0;i<31;i++){const date=A.shiftDate(first,i);if(!date.startsWith(month+'-'))break;out.push(date)}return out;
  }
  function scanMonth(month,history,options={}){
    const rows=monthDates(month).map(date=>{
      const day=history[date],solar=screenDay(day,'solar',history,options),hydro=screenDay(day,'hydro',history,options);
      solar.date=hydro.date=date;
      return {date,solar,hydro,coincident:solar.flaggedIndices.filter(index=>hydro.flaggedIndices.includes(index)),archived:!!day};
    });
    return {month,rows,flaggedDates:rows.filter(row=>row.solar.status==='flagged'||row.hydro.status==='flagged').length,
      solarDays:rows.filter(row=>row.solar.status!=='missing').length,hydroDays:rows.filter(row=>row.hydro.status!=='missing').length,
      coincidentDates:rows.filter(row=>row.coincident.length).length};
  }
  function csv(report,kinds=['solar','hydro']){
    if(!kinds.length||kinds.some(kind=>!SOURCES[kind]))throw Error('Invalid CSV source selection');
    const headers=['date','sector','public_series','screening_status','confirmation_status','signal_type','first_sample_label','last_sample_label','sampled_span_minutes_not_curtailment_duration','flagged_sample_count','mean_observed_MW','reference_mean_MW_not_available_power','difference_MW_not_curtailment','difference_percent','recovery_sample_label','reference_dates','daytime_window_Sri_Lanka','relative_drop_setting','absolute_MW_floor','minimum_consecutive_samples','source_url','sha256'];
    const rows=[headers];
    report.rows.forEach(day=>kinds.forEach(kind=>{const s=day[kind];(s.events.length?s.events:[null]).forEach(e=>rows.push([
      day.date,s.name,s.label,s.status,'Curtailment not established',e?.type||s.reason||'No screening flag',e?clock(e.start):'',e?clock(e.end):'',e?.sampledSpanMinutes??'',e?.samples??'',e?.meanMW??s.stats?.dayMean??'',e?.baselineMW??'',e?.dropMW??'',e?.dropPercent??'',e?.recoveryIndex!=null?clock(e.recoveryIndex):'',s.referenceDays.join('; '),`${s.rules.startHour}:00–${s.rules.endHour}:00`,s.rules.relativeDrop,s.rules.minMW,s.rules.minSamples,s.sourceUrl,s.sha256
    ]))}));
    const escape=value=>{let text=String(value);if(typeof value==='string'&&/^[=+\-@\t\r]/.test(text))text="'"+text;return '"'+text.replace(/"/g,'""')+'"'};
    return '\uFEFF'+rows.map(row=>row.map(escape).join(',')).join('\r\n');
  }
  const api={SOURCES,extract,screenDay,monthDates,scanMonth,csv,clock};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;root.SLGIRenewableWatch=api;
})(typeof globalThis==='undefined'?this:globalThis);
