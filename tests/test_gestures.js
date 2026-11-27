const test=require('node:test');
const assert=require('node:assert/strict');
const {pinchRange,attach}=require('../gestures.js');

function chart(view={start:0,length:96,total:96}){
  const handlers={},captures=new Set(),previews=[],inspections=[],changes=[];
  const node={classList:{add(){},remove(){}},focus(){},
    addEventListener(type,handler){handlers[type]=handler},
    setPointerCapture(id){captures.add(id)},hasPointerCapture(id){return captures.has(id)},
    releasePointerCapture(id){captures.delete(id)}};
  const controller=attach(node,{
    view:()=>view,bounds:()=>({left:50,width:380}),
    inspect:x=>inspections.push(x),preview:value=>previews.push(value),
    change:range=>{changes.push(range);view={...range,total:view.total}}
  });
  function send(type,id,x,y=100,pointerType='touch'){
    let prevented=false;
    handlers[type]({type,pointerId:id,clientX:x,clientY:y,pointerType,preventDefault(){prevented=true}});
    return prevented;
  }
  return {send,controller,previews,inspections,changes,captures,view:()=>view};
}
test('pinching preserves the time under the moving finger midpoint',()=>{
  const v=pinchRange({start:20,length:41,total:200},100,200,.5,.4);
  assert.deepEqual(v,{start:32,length:21});
  assert.equal(v.start+.4*(v.length-1),40);
});
test('pinch limits support a four-point minimum, full period and edges',()=>{
  assert.deepEqual(pinchRange({start:0,length:96,total:96},100,10000,0,0),{start:0,length:4});
  assert.deepEqual(pinchRange({start:40,length:10,total:96},200,1,.5,.5),{start:0,length:96});
  assert.deepEqual(pinchRange({start:92,length:4,total:96},100,100,1,0),{start:92,length:4});
  assert.deepEqual(pinchRange({start:0,length:2,total:2},0,0,.5,.5),{start:0,length:2});
});
test('a phone tap inspects without zooming or moving the chart',()=>{
  const c=chart();assert.equal(c.send('pointerdown',1,150),true);
  c.send('pointerup',1,150);
  assert.deepEqual(c.inspections,[150]);assert.equal(c.changes.length,0);assert.equal(c.captures.size,0);
});
test('one finger selects a zoom range in either direction, then pans',()=>{
  for(const [from,to] of [[130,290],[290,130]]){
    const c=chart();c.send('pointerdown',1,from);c.send('pointermove',1,to);c.send('pointerup',1,to);
    assert.deepEqual(c.view(),{start:20,length:41,total:96});
    c.send('pointerdown',2,200);c.send('pointermove',2,295);c.send('pointerup',2,295);
    assert.deepEqual(c.view(),{start:10,length:41,total:96});
  }
});
test('two fingers zoom in, zoom out and continue panning when one lifts',()=>{
  const c=chart();c.send('pointerdown',1,180);c.send('pointerdown',2,280);
  c.send('pointermove',1,130);c.send('pointermove',2,330);
  assert.equal(c.view().length,49);assert.equal(c.view().start,22);
  c.send('pointermove',1,180);c.send('pointermove',2,280);
  assert.equal(c.view().length,96);assert.equal(c.view().start,0);
  c.send('pointermove',1,130);c.send('pointermove',2,330);
  c.send('pointerup',2,330);
  const before=c.view().start;c.send('pointermove',1,90);
  assert.ok(c.view().start>before);assert.equal(c.view().length,49);
  c.send('pointerup',1,90);assert.equal(c.captures.size,0);
});
test('cancelling a range selection never commits an accidental zoom',()=>{
  const c=chart();c.send('pointerdown',1,100);c.send('pointermove',1,300);c.send('pointercancel',1,300);
  assert.equal(c.changes.length,0);assert.equal(c.previews.at(-1),null);
  c.send('pointerdown',2,100);c.send('pointermove',2,300);c.controller.cancel();
  c.send('pointerup',2,300);assert.equal(c.changes.length,0);assert.equal(c.captures.size,0);
});
test('capture loss cleans up a gesture and mouse events retain desktop behavior',()=>{
  const c=chart();assert.equal(c.send('pointerdown',1,100,100,'mouse'),false);
  assert.equal(c.inspections.length,0);
  c.send('pointerdown',2,100);c.send('pointermove',2,300);c.send('lostpointercapture',2,300);
  assert.equal(c.changes.length,0);assert.equal(c.captures.size,0);
  c.send('pointerdown',3,130);c.send('pointerup',3,290);
  assert.equal(c.view().length,41); // final position is honored without an intermediate move
});
