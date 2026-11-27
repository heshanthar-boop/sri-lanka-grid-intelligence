// Reproducible descriptive analysis. No inferred energy, forecasts or incident claims.
(function(root){
  'use strict';
  const DAY=86400000,POINTS=96;
  const valid=values=>Array.isArray(values)&&values.length===POINTS&&values.every(Number.isFinite);
  const mean=values=>values.reduce((sum,v)=>sum+v,0)/values.length;
  function shiftDate(date,days){
    const ms=Date.parse(date+'T00:00:00Z');
    if(!Number.isFinite(ms)||new Date(ms).toISOString().slice(0,10)!==date)throw Error('Invalid analysis date');
    return new Date(ms+days*DAY).toISOString().slice(0,10);
  }
  function valuesFor(day,source){
    const values=source==='total'?day?.total:day?.groups?.[source];
    return valid(values)?values:null;
  }
  function median(values){
    const sorted=values.filter(Number.isFinite).sort((a,b)=>a-b),n=sorted.length;
    return n?(n%2?sorted[(n-1)/2]:(sorted[n/2-1]+sorted[n/2])/2):null;
  }
  function describe(values){
    if(!valid(values))return null;
    let peak=0,low=0,ramp=1;
    for(let i=1;i<POINTS;i++){
      if(values[i]>values[peak])peak=i;
      if(values[i]<values[low])low=i;
      if(Math.abs(values[i]-values[i-1])>Math.abs(values[ramp]-values[ramp-1]))ramp=i;
    }
    return {average:mean(values),peak:values[peak],peakIndex:peak,low:values[low],lowIndex:low,ramp:values[ramp]-values[ramp-1],rampIndex:ramp};
  }
  function compareDays(selected,reference,source){
    const a=valuesFor(selected,source),b=valuesFor(reference,source);
    if(!a||!b)return null;
    const current=describe(a),baseline=describe(b),delta=current.average-baseline.average;
    const difference=a.map((v,i)=>v-b[i]);
    const largestIndex=difference.reduce((best,v,i)=>Math.abs(v)>Math.abs(difference[best])?i:best,0);
    return {current,baseline,delta,percent:baseline.average>0?delta/baseline.average*100:null,difference,largestIndex};
  }
  function sourceChanges(selected,reference){
    const names=[...new Set([...Object.keys(selected?.groups||{}),...Object.keys(reference?.groups||{})])];
    const available=[],missing=[];
    for(const name of names){
      const comparison=compareDays(selected,reference,name);
      if(comparison)available.push({source:name,delta:comparison.delta,current:comparison.current.average,reference:comparison.baseline.average});
      else missing.push(name);
    }
    available.sort((a,b)=>Math.abs(b.delta)-Math.abs(a.delta)||a.source.localeCompare(b.source));
    return {available,missing};
  }
  function weekdayDates(anchor,archive,weeks=8){
    const available=new Set(archive),out=[];
    for(let i=1;i<=weeks;i++){const date=shiftDate(anchor,-7*i);if(available.has(date))out.push(date)}
    return out;
  }
  function unusualReadings(selected,history,source,{minDays=4,minMW=30,multiplier=3}={}){
    const values=valuesFor(selected,source),eligible=[];
    if(!values)return {ready:false,reason:'Selected source has no complete day of readings.',days:[],points:[],flags:[]};
    const expected=new Set(Array.from({length:8},(_,i)=>shiftDate(selected.date,-7*(i+1))));
    // Never include the selected day, future days, or a different weekday.
    for(const date of Object.keys(history).sort()){
      const series=valuesFor(history[date],source);
      if(expected.has(date)&&history[date]?.date===date&&series)eligible.push({date,values:series});
    }
    if(eligible.length<minDays)return {ready:false,reason:`Need ${minDays} complete matching weekdays; ${eligible.length} available.`,days:eligible.map(d=>d.date),points:[],flags:[]};
    const points=values.map((value,index)=>{
      const observations=eligible.map(day=>day.values[index]),center=median(observations);
      const mad=median(observations.map(v=>Math.abs(v-center)));
      const threshold=Math.max(minMW,multiplier*1.4826*mad),deviation=value-center;
      return {index,value,median:center,lower:center-threshold,upper:center+threshold,deviation,flag:Math.abs(deviation)>threshold};
    });
    return {ready:true,days:eligible.map(d=>d.date),points,flags:points.filter(p=>p.flag),minMW,multiplier};
  }
  function hourlyPattern(anchor,history,source,span=7){
    if(![7,28].includes(span))throw Error('History must be 7 or 28 days');
    const rows=Array.from({length:span},(_,i)=>{
      const date=shiftDate(anchor,i-span+1),series=valuesFor(history[date],source);
      // Each hour contains four interval-ending labels: 00:15–01:00, etc.
      return {date,values:Array.from({length:24},(_,hour)=>series?mean(series.slice(hour*4,hour*4+4)):null)};
    });
    const cells=rows.flatMap(row=>row.values.flatMap((value,hour)=>Number.isFinite(value)?[{date:row.date,hour,value}]:[]));
    const averages=Array.from({length:24},(_,hour)=>{const values=rows.map(row=>row.values[hour]).filter(Number.isFinite);return {hour,count:values.length,value:values.length?mean(values):null}});
    const peak=cells.reduce((best,c)=>!best||c.value>best.value?c:best,null),low=cells.reduce((best,c)=>!best||c.value<best.value?c:best,null);
    return {rows,averages,peak,low,available:rows.filter(row=>row.values.some(Number.isFinite)).length,total:span};
  }
  function similarDays(selected,history,source,limit=3){
    const a=valuesFor(selected,source);if(!a)return [];
    const aScale=Math.sqrt(mean(a.map(v=>v*v)));if(aScale===0)return [];
    return Object.entries(history).flatMap(([date,day])=>{
      const b=valuesFor(day,source);
      if(!b||date>=selected.date||day.date!==date)return [];
      const bScale=Math.sqrt(mean(b.map(v=>v*v)));if(bScale===0)return [];
      // RMS normalization compares daily shape, separately from output level.
      const distance=Math.sqrt(mean(a.map((v,i)=>(v/aScale-b[i]/bScale)**2)));
      return [{date,distance,average:mean(b)}];
    }).sort((a,b)=>a.distance-b.distance||a.date.localeCompare(b.date)).slice(0,limit);
  }
  const api={shiftDate,valuesFor,median,describe,compareDays,sourceChanges,weekdayDates,unusualReadings,hourlyPattern,similarDays};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  root.SLGIAnalytics=api;
})(typeof globalThis==='undefined'?this:globalThis);
