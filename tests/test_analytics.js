const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const A=require('../analytics.js');
const series=value=>Array(96).fill(value);
const day=(date,value,groups={Solar:series(value)})=>({date,total:series(value),groups});

test('comparison aligns a complete day and identifies the largest same-time difference',()=>{
  const a=day('2026-11-25',100),b=day('2026-11-24',50);a.total[60]=200;
  const r=A.compareDays(a,b,'total');
  assert.equal(r.current.peak,200);assert.equal(r.current.peakIndex,60);
  assert.equal(r.largestIndex,60);assert.equal(r.difference[60],150);
  assert.equal(r.delta,100+100/96-50);assert.equal(r.percent,r.delta/50*100);
});
test('missing, incomplete and nonfinite series never become zero or a partial-day comparison',()=>{
  const a=day('2026-11-25',100),b=day('2026-11-24',50,{});
  assert.equal(A.compareDays(a,b,'Solar'),null);
  b.total.pop();assert.equal(A.compareDays(a,b,'total'),null);
  b.total=series(50);b.total[5]=null;assert.equal(A.valuesFor(b,'total'),null);
  b.total[5]=NaN;assert.equal(A.describe(b.total),null);
});
test('zero and negative reference means have no misleading percentage change',()=>{
  const a=day('2026-11-25',10);
  assert.equal(A.compareDays(a,day('2026-11-24',0),'total').percent,null);
  const r=A.compareDays(day('2026-11-25',-20),day('2026-11-24',-40),'total');
  assert.equal(r.delta,20);assert.equal(r.percent,null);
});
test('source rankings keep unavailable sources separate and preserve signed storage',()=>{
  const a=day('2026-11-25',100,{Solar:series(50),Wind:series(5),Storage:series(-30)});
  const b=day('2026-11-24',100,{Solar:series(20),Coal:series(80),Storage:series(-10)});
  const r=A.sourceChanges(a,b);
  assert.deepEqual(r.available.map(v=>[v.source,v.delta]),[['Solar',30],['Storage',-20]]);
  assert.deepEqual(r.missing,['Wind','Coal']);
});
test('screen uses earlier matching weekdays and never includes future or selected data',()=>{
  const selected=day('2026-11-25',100),history={};
  ['2026-11-18','2026-11-11','2026-11-04','2026-10-28'].forEach(date=>history[date]=day(date,100));
  history['2026-11-25']=selected;history['2026-12-02']=day('2026-12-02',10000);history['2026-11-24']=day('2026-11-24',10000);
  selected.total[20]=131;const r=A.unusualReadings(selected,history,'total');
  assert.equal(r.ready,true);assert.equal(r.days.length,4);assert.equal(r.flags.length,1);
  assert.equal(r.flags[0].index,20);assert.equal(r.flags[0].median,100);assert.equal(r.flags[0].upper,130);
});
test('too few reference days or different source coverage suppresses screening',()=>{
  const selected=day('2026-11-25',100),history={};
  ['2026-11-18','2026-11-11','2026-11-04'].forEach(date=>history[date]=day(date,100));
  assert.equal(A.unusualReadings(selected,history,'total').ready,false);
  history['2026-10-28']=day('2026-10-28',100,{});
  assert.equal(A.unusualReadings(selected,history,'Solar').ready,false);
  assert.equal(A.unusualReadings(selected,history,'Coal').ready,false);
});
test('MAD band tolerates ordinary variation while screening large departures',()=>{
  const selected=day('2026-11-25',105),history={};
  ['2026-11-18','2026-11-11','2026-11-04','2026-10-28'].forEach((date,i)=>history[date]=day(date,[80,100,120,140][i]));
  const r=A.unusualReadings(selected,history,'total');
  assert.equal(r.points[0].median,110);assert.equal(r.flags.length,0);
  assert.ok(Math.abs(r.points[0].upper-(110+3*1.4826*20))<1e-9);
});
test('heatmap preserves calendar gaps and assigns final midnight reading to the final hour',()=>{
  const selected=day('2026-11-25',100);selected.total[95]=200;
  const r=A.hourlyPattern(selected.date,{[selected.date]:selected},'total',7);
  assert.equal(r.available,1);assert.equal(r.rows[0].date,'2026-11-19');
  assert.equal(r.rows[0].values[0],null);assert.equal(r.rows.at(-1).values[23],125);
  assert.equal(r.peak.hour,23);assert.equal(r.averages[23].count,1);assert.equal(r.averages[23].value,125);
  assert.throws(()=>A.hourlyPattern(selected.date,{},'total',8));
});
test('similarity matches scaled profiles but excludes zero, future and incomplete profiles',()=>{
  const selected=day('2026-11-25',10);selected.total=Array.from({length:96},(_,i)=>i+1);
  const scaled=day('2026-11-24',10);scaled.total=selected.total.map(v=>v*2);
  const history={'2026-11-24':scaled,'2026-11-23':day('2026-11-23',50),'2026-11-22':day('2026-11-22',0),'2026-12-01':day('2026-12-01',10)};
  const r=A.similarDays(selected,history,'total');assert.equal(r.length,2);assert.equal(r[0].date,scaled.date);assert.equal(r[0].distance,0);
  assert.deepEqual(A.similarDays(day('2026-11-25',0),history,'total'),[]);
});
test('date math handles boundaries and weekday references are within eight weeks',()=>{
  assert.equal(A.shiftDate('2026-01-01',-1),'2025-12-31');assert.throws(()=>A.shiftDate('2026-02-30',1));
  assert.deepEqual(A.weekdayDates('2026-11-25',['2026-11-18','2026-11-24','2026-10-28','2026-09-23']),['2026-11-18','2026-10-28']);
});
test('real archived data supports a reproducible comparison, screen and hourly pattern',()=>{
  const read=date=>JSON.parse(fs.readFileSync(new URL('../data/days/'+date+'.json','file://'+__filename),'utf8'));
  const selected=read('2026-11-25'),reference=read('2026-11-24'),history={[reference.date]:reference};
  A.weekdayDates(selected.date,JSON.parse(fs.readFileSync(new URL('../data/index.json','file://'+__filename),'utf8')).dates).forEach(date=>history[date]=read(date));
  const c=A.compareDays(selected,reference,'total'),s=A.unusualReadings(selected,history,'total'),p=A.hourlyPattern(selected.date,{...history,[selected.date]:selected},'total',7);
  assert.ok(c);assert.equal(s.ready,true);assert.equal(s.days.length,8);assert.equal(p.total,7);assert.ok(p.available>0);
  assert.ok(s.flags.every(point=>Number.isFinite(point.deviation)));
});
