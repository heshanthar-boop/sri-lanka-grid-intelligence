const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const C=require('../renewable-watch.js');
const ground='Solar Ground Mounted [ID 50]',hydro='Minihydro Telemetered [ID 53]',roof='Solar - Rooftop [ID 68]',estimated='Minihydro Estimated [ID 54]';
const fill=value=>Array(96).fill(value);
function day(date,solar=fill(100),mini=fill(100)){
 return {date,plants:{[ground]:solar,[hydro]:mini,[roof]:fill(2000),[estimated]:fill(500)},plant_categories:{[ground]:'Solar',[hydro]:'Mini Hydro (Telemetered)',[roof]:'Rooftop Solar (Est.)',[estimated]:'Mini Hydro (Estimated)'},groups:{Solar:fill(2100),'Mini hydro':fill(600)},source_url:'https://gendata.pucsl.gov.lk/example',sha256:'abc'};
}
function history(){return Object.fromEntries(['2026-11-21','2026-11-22','2026-11-23','2026-11-24'].map(date=>[date,day(date)]))}

test('ground solar and telemetered mini hydro never include rooftop or estimated aggregates',()=>{
 const d=day('2026-11-25');assert.equal(C.extract(d,'solar').values[0],100);assert.equal(C.extract(d,'hydro').values[0],100);
 assert.equal(C.extract(d,'solar').label,ground);assert.equal(C.extract(d,'hydro').label,hydro);
});
test('missing explicit targets cannot fall back to broad source groups or ambiguous sums',()=>{
 const d=day('2026-11-25');delete d.plants[ground];assert.equal(C.extract(d,'solar').ok,false);
 d.plants[ground]=fill(100);d.plants['Second Ground Mounted Solar [ID 75]']=fill(30);assert.equal(C.extract(d,'solar').ok,false);
 delete d.plants[hydro];assert.equal(C.extract(d,'hydro').ok,false);
 d.plants['Mini Hydro Non-Telemetered']=fill(80);assert.equal(C.extract(d,'hydro').ok,false);
});
test('incomplete, null and negative target readings are not screened as zero generation',()=>{
 for(const invalid of [fill(100).slice(1),null,[...fill(100).slice(1),null],[...fill(100).slice(1),-1]]){
  const d=day('2026-11-25',invalid);assert.equal(C.screenDay(d,'solar').status,'missing');
 }
});
test('sustained abrupt drop and recovery report sample labels, not an invented duration',()=>{
 const values=fill(100);values.fill(20,44,48);const s=C.screenDay(day('2026-11-25',values),'solar');
 assert.equal(s.status,'flagged');assert.equal(s.events.length,1);
 const e=s.events[0];assert.equal(e.type,'Drop with observed recovery');assert.equal(e.start,44);assert.equal(e.end,47);assert.equal(e.samples,4);assert.equal(e.sampledSpanMinutes,45);assert.equal(e.recoveryIndex,48);
 assert.equal(e.dropPercent,80);assert.equal(C.clock(e.start),'11:15');assert.equal(C.clock(95),'24:00');
});
test('isolated short fluctuations and drops outside the chosen daytime window are excluded',()=>{
 let v=fill(100);v.fill(20,44,46);assert.equal(C.screenDay(day('2026-11-25',v),'solar').events.length,0);
 v=fill(100);v.fill(20,70,78);assert.equal(C.screenDay(day('2026-11-25',v),'solar').events.length,0);
});
test('a smooth daily decline does not become an abrupt-step flag without a reference',()=>{
 const v=Array.from({length:96},(_,i)=>150-i);assert.equal(C.screenDay(day('2026-11-25',v),'solar').events.length,0);
});
test('a historical low-output run needs four preceding days and excludes today and future days',()=>{
 const d=day('2026-11-25',fill(40)),h=history();h[d.date]=d;h['2026-11-26']=day('2026-11-26',fill(10000));
 const s=C.screenDay(d,'solar',h);assert.equal(s.referenceDays.length,4);assert.equal(s.status,'flagged');assert.ok(s.events.some(e=>e.type==='Below recent reference range'));
 assert.equal(s.events[0].samples,28);assert.equal(s.events[0].sampledSpanMinutes,405);
 delete h['2026-11-21'];assert.equal(C.screenDay(d,'solar',h).baseline,null);assert.equal(C.screenDay(d,'solar',h).status,'no-flag');
});
test('reference identity and calendar age are checked before a baseline is formed',()=>{
 const h=history();h['2026-11-21'].plants['Renamed Ground Mounted Solar [ID 75]']=h['2026-11-21'].plants[ground];delete h['2026-11-21'].plants[ground];
 h['2026-11-01']=day('2026-11-01');const s=C.screenDay(day('2026-11-25',fill(40)),'solar',h);
 assert.equal(s.referenceDays.length,3);assert.equal(s.baseline,null);
});
test('broad historical weather-like variability widens the MAD tolerance',()=>{
 const h=history(),dates=Object.keys(h);dates.forEach((date,i)=>h[date]=day(date,fill([20,60,140,180][i])));
 const s=C.screenDay(day('2026-11-25',fill(40)),'solar',h);assert.ok(s.baseline);assert.equal(s.events.length,0);
});
test('zero readings remain observations and can be flagged without confirming their cause',()=>{
 const s=C.screenDay(day('2026-11-25',fill(0)),'solar',history());assert.equal(s.status,'flagged');assert.equal(s.stats.dayMean,0);assert.equal(s.events[0].dropPercent,100);
});
test('monthly calendar keeps unavailable dates missing and identifies coincident samples',()=>{
 const v=fill(100);v.fill(20,44,48);const data={'2026-11-25':day('2026-11-25',v,v)},r=C.scanMonth('2026-11',data);
 assert.equal(r.rows.length,30);assert.equal(r.solarDays,1);assert.equal(r.hydroDays,1);assert.equal(r.flaggedDates,1);assert.equal(r.coincidentDates,1);assert.equal(r.rows[24].coincident.length,4);
 assert.equal(r.rows[25].solar.status,'missing');assert.equal(r.rows[25].solar.stats,undefined);
});
test('export preserves uncertainty, missing values and current source filtering',()=>{
 const v=fill(100);v.fill(20,44,48);const r=C.scanMonth('2026-11',{'2026-11-25':day('2026-11-25',v)});
 const csv=C.csv(r,['solar']);assert.ok(csv.includes('Curtailment not established'));assert.ok(csv.includes('not_curtailment_duration'));assert.ok(csv.includes('"missing"'));assert.ok(!csv.includes(hydro));assert.ok(csv.includes('"45","4"'));
 assert.throws(()=>C.csv(r,['roof']));assert.throws(()=>C.scanMonth('2026-13',{}));
});
test('screen settings are bounded and stricter thresholds change detection transparently',()=>{
 const v=fill(100);v.fill(65,44,48);const d=day('2026-11-25',v);
 assert.equal(C.screenDay(d,'solar',{}, {relativeDrop:.3}).status,'flagged');assert.equal(C.screenDay(d,'solar',{}, {relativeDrop:.4}).status,'no-flag');
 assert.throws(()=>C.screenDay(d,'solar',{}, {startHour:5}));assert.throws(()=>C.screenDay(d,'solar',{}, {minSamples:1}));
});
test('real archive scan uses explicitly labelled series and leaves later unarchived dates missing',()=>{
 const dates=JSON.parse(fs.readFileSync(new URL('../data/index.json','file://'+__filename),'utf8')).dates;
 const selected=dates.filter(date=>date>='2026-10-25'&&date<='2026-11-25'),data=Object.fromEntries(selected.map(date=>[date,JSON.parse(fs.readFileSync(new URL('../data/days/'+date+'.json','file://'+__filename),'utf8'))]));
 const r=C.scanMonth('2026-11',data);assert.equal(r.solarDays,25);assert.equal(r.hydroDays,25);assert.ok(r.flaggedDates>0);assert.equal(r.rows[25].solar.status,'missing');
 assert.ok(r.rows.filter(row=>row.archived).every(row=>row.solar.label===ground&&row.hydro.label===hydro));
});
