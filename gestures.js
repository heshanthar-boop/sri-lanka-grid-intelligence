// Touch gestures live on the chart container so redraws never lose a finger.
(function(root){
  'use strict';
  const analysis=typeof module!=='undefined'&&module.exports?require('./analysis.js'):root.SLGIAnalysis;
  const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
  function pinchRange(view,initialDistance,distance,initialFraction,fraction){
    const length=clamp(Math.round((view.length-1)*Math.max(8,initialDistance)/Math.max(8,distance))+1,Math.min(4,view.total),view.total);
    const anchor=view.start+clamp(initialFraction,0,1)*(view.length-1);
    return {start:clamp(Math.round(anchor-clamp(fraction,0,1)*(length-1)),0,view.total-length),length};
  }
  function attach(node,adapter){
    const fingers=new Map();let gesture=null;
    const fraction=(x,bounds)=>clamp((x-bounds.left)/Math.max(1,bounds.width),0,1);
    function begin(forcePan=false){
      const view=adapter.view(),bounds=adapter.bounds(),points=[...fingers.values()];
      if(!view||!bounds||!points.length){gesture=null;return}
      adapter.preview(null);
      if(points.length>1){
        const [a,b]=points;
        gesture={mode:'pinch',view:{...view},bounds,distance:Math.hypot(a.x-b.x,a.y-b.y),fraction:fraction((a.x+b.x)/2,bounds)};
      }else{
        const point=points[0],anchor=view.start+Math.round(fraction(point.x,bounds)*(view.length-1));
        gesture={mode:!forcePan&&view.length===view.total?'select':'pan',view:{...view},bounds,origin:point.x,anchor,end:anchor,moved:false};
      }
    }
    function down(event){
      if(event.pointerType!=='touch'||!adapter.view()||!adapter.bounds())return;
      event.preventDefault();fingers.set(event.pointerId,{x:event.clientX,y:event.clientY});
      node.focus({preventScroll:true});
      try{node.setPointerCapture(event.pointerId)}catch(_){}
      if(fingers.size===1)adapter.inspect(event.clientX);
      begin(fingers.size>1);
    }
    function move(event){
      if(!fingers.has(event.pointerId)||!gesture)return;
      event.preventDefault();fingers.set(event.pointerId,{x:event.clientX,y:event.clientY});
      const points=[...fingers.values()],g=gesture;
      if(g.mode==='pinch'&&points.length>1){
        const [a,b]=points,mid=(a.x+b.x)/2;
        adapter.change(pinchRange(g.view,g.distance,Math.hypot(a.x-b.x,a.y-b.y),g.fraction,fraction(mid,g.bounds)),fraction(mid,g.bounds));
      }else{
        const delta=event.clientX-g.origin;
        if(Math.abs(delta)<6&&!g.moved)return;
        g.moved=true;node.classList.add('dragging');
        if(g.mode==='select'){
          g.end=g.view.start+Math.round(fraction(event.clientX,g.bounds)*(g.view.length-1));
          adapter.preview({start:g.anchor,end:g.end});adapter.inspect(event.clientX);
        }else{
          adapter.change({start:analysis.dragRange(g.view.total,g.view.start,g.view.length,delta,g.bounds.width),length:g.view.length},fraction(event.clientX,g.bounds));
        }
      }
    }
    function finish(event){
      if(!fingers.has(event.pointerId))return;
      // Include the final position even if it arrived without a pointermove.
      if(event.type==='pointerup')move(event);
      const selected=gesture;
      fingers.delete(event.pointerId);
      if(event.type==='pointerup'&&selected?.mode==='select'&&selected.moved){
        adapter.change(analysis.selectionRange(selected.view.total,selected.anchor,selected.end),0.5);
      }
      gesture=null;adapter.preview(null);node.classList.remove('dragging');
      if(fingers.size)begin(true); // Lifting one finger after a pinch continues panning.
      try{if(node.hasPointerCapture(event.pointerId))node.releasePointerCapture(event.pointerId)}catch(_){}
    }
    function cancel(){
      const ids=[...fingers.keys()];fingers.clear();gesture=null;
      adapter.preview(null);node.classList.remove('dragging');
      ids.forEach(id=>{try{if(node.hasPointerCapture(id))node.releasePointerCapture(id)}catch(_){}});
    }
    node.addEventListener('pointerdown',down,{passive:false});
    node.addEventListener('pointermove',move,{passive:false});
    node.addEventListener('pointerup',finish);
    node.addEventListener('pointercancel',finish);
    node.addEventListener('lostpointercapture',finish);
    root.addEventListener?.('blur',cancel);
    return {cancel};
  }
  const api={pinchRange,attach};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  root.SLGIGestures=api;
})(typeof globalThis==='undefined'?this:globalThis);
