import {chromium} from '@playwright/test';
const base=process.env.STEMS_TEST_BASE_URL||'http://127.0.0.1:5187/brain-storm/';
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
try {
 const page=await browser.newPage();page.setDefaultTimeout(180000);
 await page.goto(new URL('stems/Demucs-MIT.txt',base).href);
 const result=await page.evaluate(async ({base})=>{
  const {BrowserStemService}=await import(new URL('src/stems/BrowserStemService.ts',base).href);
  const service=new BrowserStemService();const rate=48000,length=12000;
  const input=new AudioBuffer({length,numberOfChannels:2,sampleRate:rate});
  for(let channel=0;channel<2;channel++){
   const samples=input.getChannelData(channel);
   for(let i=0;i<length;i++){const t=i/rate;samples[i]=.3*Math.sin(2*Math.PI*(channel?330:220)*t)+.2*Math.sin(2*Math.PI*70*t)*Math.exp(-t*8)+(i%1200<20?.2:0);}
  }
  const progress=[],started=performance.now();
  const stems=await service.separate(input,p=>{progress.push(p);},new AbortController().signal);
  if(stems.length!==4||stems.some(s=>s.length!==length||s.sampleRate!==rate||s.numberOfChannels!==2))throw new Error('Neural stem dimensions do not match source');
  let difference=0,energy=0;for(let i=0;i<length;i++)for(const stem of stems){const value=stem.getChannelData(0)[i];if(!Number.isFinite(value))throw new Error('Nonfinite model output');energy+=value*value;difference+=Math.abs(stems[0].getChannelData(0)[i]-stems[3].getChannelData(0)[i]);}
  if(energy<1e-7||difference<1e-5)throw new Error('Real model did not produce distinct nonzero stems');
  if(!progress.some(p=>p.message.startsWith('Separating vocals'))||progress.at(-1)?.progress!==1)throw new Error('Neural inference progress missing');
  if(input.getChannelData(0).length!==length)throw new Error('Original source PCM was transferred away');
  const constant=new AudioBuffer({length:8000,numberOfChannels:1,sampleRate:8000});constant.getChannelData(0).fill(.125);
  const preserved=await service.separate(constant,()=>{},new AbortController().signal);
  if(preserved[1].getChannelData(0).some(v=>Math.abs(v-.125)>1e-7)||preserved[0].getChannelData(0).some(v=>v!==0))throw new Error('Constant source was not preserved in melody');
  const abort=new AbortController();let aborted=false;
  try{await service.separate(input,p=>{if(p.progress>0)abort.abort();},abort.signal);}catch(error){aborted=error.name==='AbortError';}
  if(!aborted)throw new Error('Cancellation did not abort and terminate the worker');
  return {realInference:true,aligned:true,finite:true,distinct:true,sourceRetained:true,constantPreserved:true,cancelled:true,seconds:(performance.now()-started)/1000,progressEvents:progress.length,last:progress.at(-1)};
 },{base});
 await page.route('**/models/manifest.json',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({sha256:'invalid',bytes:42,parts:[]})}));
 const corrupt=await page.evaluate(async({base})=>{const{BrowserStemService}=await import(new URL('src/stems/BrowserStemService.ts',base).href);const b=new AudioBuffer({length:128,numberOfChannels:1,sampleRate:44100});b.getChannelData(0)[0]=1;try{await new BrowserStemService().separate(b,()=>{},new AbortController().signal);return false;}catch(error){return error.message.includes('manifest failed verification');}},{base});
 if(!corrupt)throw new Error('Corrupt model manifest was accepted');
 console.log(JSON.stringify({...result,corruptManifestRejected:true},null,2));
} finally {await browser.close();}
