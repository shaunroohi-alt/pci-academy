const clockWorker=self as unknown as DedicatedWorkerGlobalScope;
let timer:ReturnType<typeof setInterval>|undefined;
clockWorker.onmessage=(event:MessageEvent<'start'|'stop'>)=>{
  if(timer!==undefined)clearInterval(timer);
  timer=undefined;
  if(event.data==='start')timer=setInterval(()=>clockWorker.postMessage('tick'),25);
};
export {};
