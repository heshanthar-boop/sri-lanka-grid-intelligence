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
  function yearCoverage(dates,today){
    const end=dateMs(today)-step,start=end-364*step;
    const first=new Date(start).toISOString().slice(0,10),last=new Date(end).toISOString().slice(0,10);
    const valid=[...new Set(dates)].filter(d=>/^\d{4}-\d{2}-\d{2}$/.test(d)&&d>=first&&d<=last).sort();
    return {start:first,end:last,available:valid.length,total:365,latest:dates.filter(d=>d<=today).sort().at(-1)||null};
  }
  function mean(values){return values.length ? values.reduce((a,b)=>a+b,0)/values.length : null}
  function dailyValue(day,selection,name){if(!day)return null;let v=selection==='total'?day.total:(selection==='groups'||selection==='group')?day.groups?.[name]:day.plants?.[name];return Array.isArray(v)&&v.length===96&&v.every(Number.isFinite)?mean(v):null}
  function periodSeries(dates,days,selection,names){const result={};for(const name of names)result[name]=dates.map(d=>dailyValue(days[d],selection,name));return result}
  function intervalLabels(dates){let result=[];for(const date of dates){let base=dateMs(date);for(let i=1;i<=96;i++)result.push(new Date(base+i*900000).toISOString().slice(0,16).replace('T',' '))}return result}
  function intervalSeries(dates,days,selection,names){const out={};for(const name of names){out[name]=[];for(const date of dates){let day=days[date],values=selection==='total'?day?.total:(selection==='groups'||selection==='group')?day?.groups?.[name]:day?.plants?.[name];if(!Array.isArray(values)||values.length!==96||!values.every(Number.isFinite))out[name].push(...Array(96).fill(null));else out[name].push(...values)}}return out}
  function zoomRange(total,start,length,action,anchor){
    const min=Math.min(total,4);start=Math.max(0,Math.min(start,total-1));length=Math.max(min,Math.min(length,total));anchor=Math.max(start,Math.min(anchor,start+length-1));
    if(action==='reset')return {start:0,length:total};
    if(action==='left'||action==='right'){let n=start+(action==='left'?-1:1)*Math.max(1,Math.floor(length/2));return {start:Math.max(0,Math.min(total-length,n)),length};}
    let newLength=action==='in'?Math.max(min,Math.ceil(length/2)):Math.min(total,length*2);
    let n=Math.round(anchor-(anchor-start)/(Math.max(1,length-1))*(newLength-1));return {start:Math.max(0,Math.min(total-newLength,n)),length:newLength};
  }
  function selectionRange(total,a,b){
    if(total<=0)return {start:0,length:0};
    const first=Math.max(0,Math.min(total-1,Math.min(a,b))),last=Math.max(0,Math.min(total-1,Math.max(a,b)));
    const length=Math.min(total,Math.max(4,last-first+1));
    const start=Math.max(0,Math.min(total-length,Math.floor((first+last-length+1)/2)));
    return {start,length};
  }
  function dragRange(total,start,length,deltaPixels,plotPixels){
    if(total<=0||length<=0)return 0;
    const shift=Math.round(deltaPixels/Math.max(1,plotPixels)*Math.max(0,length-1));
    return Math.max(0,Math.min(total-length,start-shift));
  }
  function summarize(day){
    if(!day||!Array.isArray(day.total)||day.total.length!==96||!day.total.every(Number.isFinite))return null;
    const v=day.total;let peak=v.indexOf(Math.max(...v)),low=v.indexOf(Math.min(...v)),delta=0,deltaIndex=1;
    for(let i=1;i<v.length;i++){let diff=v[i]-v[i-1];if(Math.abs(diff)>Math.abs(delta)){delta=diff;deltaIndex=i}}
    let solar=day.groups?.Solar;let solarIndex=Array.isArray(solar)&&solar.length===96&&solar.every(Number.isFinite)?solar.indexOf(Math.max(...solar)):-1;
    return {average:mean(v),peak:v[peak],peakIndex:peak,low:v[low],lowIndex:low,largestChange:delta,changeIndex:deltaIndex,solarPeak:solarIndex>=0?solar[solarIndex]:null,solarIndex};
  }
  const sourceColors={'Major hydro':'#0876bd','Coal':'#c59a00','Oil (CEB)':'#c93535','Oil (IPP)':'#9247a9','Wind':'#218a4b','Solar':'#ec7a1b','Biomass':'#515966','Mini hydro':'#00a2b4','Storage (net)':'#ad5785','Reported net total':'#183f36'};
  function sourceColor(name){return sourceColors[name]||'#4b6477'}
  const api={periodDates,yearCoverage,dailyValue,periodSeries,intervalLabels,intervalSeries,zoomRange,selectionRange,dragRange,summarize,sourceColor};if(typeof module!=='undefined'&&module.exports)module.exports=api;root.SLGIAnalysis=api;
})(typeof globalThis==='undefined'?this:globalThis);
