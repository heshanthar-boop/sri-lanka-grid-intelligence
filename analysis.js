// Period calculations keep missing days and missing series as gaps.
(function(root){
  'use strict';
  const step = 86400000;
  function dateMs(value){const ms=Date.parse(value+'T00:00:00Z');if(!Number.isFinite(ms)||new Date(ms).toISOString().slice(0,10)!==value)throw new Error('Invalid date');return ms}
  function periodDates(anchor,period){
    let start=dateMs(anchor),end;
    if(period==='week'){const weekday=new Date(start).getUTCDay();start-=((weekday+6)%7)*step;end=start+7*step}
    else if(period==='month'){const d=new Date(start);start=Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),1);end=Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,1)}
    else if(period==='day')return [anchor];
    else throw new Error('Unknown period');
    const result=[];for(let t=start;t<end;t+=step)result.push(new Date(t).toISOString().slice(0,10));return result;
  }
  function mean(values){return values.length ? values.reduce((a,b)=>a+b,0)/values.length : null}
  function dailyValue(day,selection,name){if(!day)return null;let v=selection==='total'?day.total:selection==='groups'?day.groups?.[name]:day.plants?.[name];return Array.isArray(v)&&v.length===96&&v.every(Number.isFinite)?mean(v):null}
  function periodSeries(dates,days,selection,names){const result={};for(const name of names)result[name]=dates.map(d=>dailyValue(days[d],selection,name));return result}
  const api={periodDates,dailyValue,periodSeries};if(typeof module!=='undefined'&&module.exports)module.exports=api;root.SLGIAnalysis=api;
})(typeof globalThis==='undefined'?this:globalThis);
