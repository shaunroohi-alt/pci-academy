import type {StemRequest, StemResponse} from './protocol';

const MODEL_SHA = '72b17c42d308982ddb5069bc3bf48b81a5aac4cb6516e4366c0fa7cef6df0064';
const MODEL_RATE = 44100;
const WINDOW = 30 * MODEL_RATE;
const OVERLAP = MODEL_RATE;
interface ModelManifest {sha256:string; bytes:number; parts:{file:string; bytes:number; sha256:string}[]}
interface DemucsModule {
  HEAPU8: Uint8Array;
  HEAPF32: Float32Array;
  _malloc(bytes:number):number;
  _free(pointer:number):void;
  _stem_model_init(pointer:number,bytes:number):number;
  _stem_demix(left:number,right:number,frames:number,output:number):number;
}
type Scope = {
  onmessage: ((event:MessageEvent<StemRequest>)=>void)|null;
  postMessage(message:StemResponse,transfer?:Transferable[]):void;
  __samplifyStemProgress?: (progress:number)=>void;
};
const scope = self as unknown as Scope;
let progress = 0;
function announce(value:number,message:string) {
  progress=Math.max(progress,Math.min(1,value));
  scope.postMessage({type:'progress',progress,message});
}
function requireValue(condition:unknown,message:string):asserts condition {if(!condition)throw new Error(message);}
function clock(frames:number) {const seconds=Math.floor(frames/MODEL_RATE);return `${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;}
function hash(bytes:ArrayBuffer):Promise<string> {
  return crypto.subtle.digest('SHA-256',bytes).then(value=>Array.from(new Uint8Array(value),n=>n.toString(16).padStart(2,'0')).join(''));
}
async function loadWeights(url:string) {
  const response=await fetch(url,{cache:'force-cache'});
  requireValue(response.ok,'The stem model is not available. Check your connection and retry, or import aligned stems.');
  const manifest=await response.json() as ModelManifest;
  requireValue(manifest.sha256===MODEL_SHA && Number.isSafeInteger(manifest.bytes) && manifest.bytes>0 && manifest.bytes<128*1024*1024 && Array.isArray(manifest.parts) && manifest.parts.length>0 && manifest.parts.length<16,'The stem model manifest failed verification.');
  requireValue(manifest.parts.every(p=>/^htdemucs-4s-f16\.part-\d\d\.bin$/.test(p.file) && Number.isSafeInteger(p.bytes) && p.bytes>0 && p.bytes<=16*1024*1024),'The stem model manifest contains invalid parts.');
  requireValue(manifest.parts.reduce((sum,p)=>sum+p.bytes,0)===manifest.bytes,'The stem model parts do not match its declared length.');
  const bytes=new Uint8Array(manifest.bytes);let completed=0;
  for(const part of manifest.parts) {
    const r=await fetch(new URL(part.file,url),{cache:'force-cache'});
    requireValue(r.ok,'A stem model download failed. Check your connection and retry.');
    const reader=r.body?.getReader();let partBytes=0;
    if(reader) {
      for(;;) {
        const chunk=await reader.read();if(chunk.done)break;
        requireValue(partBytes+chunk.value.length<=part.bytes,'A stem model part has an unexpected length.');
        bytes.set(chunk.value,completed+partBytes);partBytes+=chunk.value.length;
        announce(.14*(completed+partBytes)/manifest.bytes,`Downloading stem model · ${Math.round((completed+partBytes)/1048576)} / ${Math.round(manifest.bytes/1048576)} MB`);
      }
    } else {const chunk=new Uint8Array(await r.arrayBuffer());requireValue(chunk.length===part.bytes,'A stem model part is incomplete.');bytes.set(chunk,completed);partBytes=chunk.length;}
    requireValue(partBytes===part.bytes,'A stem model download is incomplete.');
    completed+=partBytes;
  }
  announce(.145,'Verifying the stem model…');
  requireValue(await hash(bytes.buffer)===MODEL_SHA,'The stem model checksum did not match. Clear the site cache and retry.');
  return bytes;
}
/** Band-limited, phase-table resampling preserves exact requested frame count. */
function resample(input:Float32Array,inputRate:number,outputRate:number,length:number):Float32Array {
  if(inputRate===outputRate && input.length===length)return input;
  const output=new Float32Array(length), taps=32, phases=1024, half=taps/2;
  const ratio=inputRate/outputRate,cutoff=Math.min(1,1/ratio)*.96;
  const filters=new Float32Array(phases*taps);
  for(let phase=0;phase<phases;++phase) {
    const fraction=phase/phases;let sum=0;
    for(let tap=0;tap<taps;++tap) {
      const distance=tap-(half-1)-fraction;
      const x=distance*cutoff;
      const sinc=Math.abs(x)<1e-10?1:Math.sin(Math.PI*x)/(Math.PI*x);
      const window=Math.abs(distance)<half?.5+.5*Math.cos(Math.PI*distance/half):0;
      const weight=cutoff*sinc*window;filters[phase*taps+tap]=weight;sum+=weight;
    }
    for(let tap=0;tap<taps;++tap)filters[phase*taps+tap]/=sum;
  }
  for(let frame=0;frame<length;++frame) {
    const position=frame*ratio,integer=Math.floor(position),phase=Math.min(phases-1,Math.floor((position-integer)*phases));let value=0;
    for(let tap=0;tap<taps;++tap) value+=input[Math.max(0,Math.min(input.length-1,integer+tap-(half-1)))]*filters[phase*taps+tap];
    output[frame]=value;
  }
  return output;
}
function constantSource(request:StemRequest):Float32Array[][]|null {
  let minimum=Infinity,maximum=-Infinity;
  for(const channel of request.channels) for(const value of channel) {
    requireValue(Number.isFinite(value),'The source contains invalid audio samples.');
    minimum=Math.min(minimum,value);maximum=Math.max(maximum,value);
  }
  if(maximum-minimum>=1e-9)return null;
  return Array.from({length:4},(_,stem)=>request.channels.map(channel=>stem===1?channel:new Float32Array(request.frames)));
}
async function separate(request:StemRequest) {
  requireValue(request.channels.length>=1&&request.channels.length<=2&&request.frames>=2&&request.frames<=32_000_000,'Stem separation requires a valid mono or stereo source.');
  requireValue(request.channels.every(channel=>channel.length===request.frames),'The source has mismatched channel lengths.');
  const constant=constantSource(request);
  if(constant) {
    announce(1,'Constant or silent source preserved in Melody.');
    scope.postMessage({type:'complete',channels:constant,sampleRate:request.sampleRate,frames:request.frames,inferred:false},constant.flat().map(channel=>channel.buffer));return;
  }
  let weights:Uint8Array|null=await loadWeights(request.manifestUrl);
  announce(.15,'Loading the local stem engine…');
  const imported=await import(/* @vite-ignore */ request.moduleUrl) as {default:(options:Record<string,unknown>)=>Promise<DemucsModule>};
  const module=await imported.default({locateFile:(name:string)=>new URL(name,request.moduleUrl).href,print:()=>{},printErr:()=>{}});
  const modelPointer=module._malloc(weights.byteLength);
  requireValue(modelPointer,'This browser does not have enough memory to load the stem model. Import aligned stems instead.');
  try {module.HEAPU8.set(weights,modelPointer);requireValue(module._stem_model_init(modelPointer,weights.byteLength)===1,'The stem model could not be initialized.');}
  finally {module._free(modelPointer);weights=null;}
  announce(.17,'Preparing source audio…');
  const modelFrames=Math.max(2,Math.round(request.frames*MODEL_RATE/request.sampleRate));
  const channels=request.channels.map(channel=>resample(channel,request.sampleRate,MODEL_RATE,modelFrames));
  const outputs=Array.from({length:4},()=>Array.from({length:request.channels.length},()=>new Float32Array(modelFrames)));
  const accumulatedWeight=new Float32Array(modelFrames),order=[3,2,1,0];
  for(let start=0;start<modelFrames;start+=WINDOW-OVERLAP) {
    const length=Math.min(WINDOW,modelFrames-start),inputPointers:number[]=[],outputPointer=module._malloc(length*8*4);
    requireValue(outputPointer,'This browser ran out of memory during stem separation. Try a shorter source or import aligned stems.');
    scope.__samplifyStemProgress=(p:number)=>announce(.18+.77*(start+Math.max(0,Math.min(1,p))*length)/modelFrames,`Separating vocals, melody, bass and drums · ${clock(start)} / ${clock(modelFrames)}`);
    try {
      for(let c=0;c<2;++c) {
        const pointer=module._malloc(length*4);requireValue(pointer,'This browser ran out of memory while preparing stem audio.');inputPointers.push(pointer);
        module.HEAPF32.set(channels[Math.min(c,channels.length-1)].subarray(start,start+length),pointer/4);
      }
      requireValue(module._stem_demix(inputPointers[0],inputPointers[1],length,outputPointer)===1,'Stem inference returned invalid audio. Try another source or import aligned stems.');
      const heap=module.HEAPF32,offset=outputPointer/4;
      for(let frame=0;frame<length;++frame) {
        const fadeIn=start===0?1:Math.min(1,(frame+1)/OVERLAP),fadeOut=start+length===modelFrames?1:Math.min(1,(length-frame)/OVERLAP),weight=Math.min(fadeIn,fadeOut);
        accumulatedWeight[start+frame]+=weight;
        for(let stem=0;stem<4;++stem) for(let channel=0;channel<request.channels.length;++channel) {
          const left=heap[offset+(order[stem]*2+channel)*length+frame];
          const value=request.channels.length===1?.5*(left+heap[offset+(order[stem]*2+1)*length+frame]):left;
          outputs[stem][channel][start+frame]+=value*weight;
        }
      }
    } finally {for(const pointer of inputPointers)module._free(pointer);module._free(outputPointer);}
  }
  scope.__samplifyStemProgress=undefined;
  announce(.96,'Aligning stems to the source…');
  const aligned=outputs.map(stem=>stem.map(channel=>{
    for(let frame=0;frame<modelFrames;++frame)channel[frame]/=Math.max(accumulatedWeight[frame],1e-9);
    return resample(channel,MODEL_RATE,request.sampleRate,request.frames);
  }));
  for(const stem of aligned)for(const channel of stem)for(const value of channel)requireValue(Number.isFinite(value),'The stem engine returned a nonfinite sample.');
  announce(1,'Four stems ready.');
  scope.postMessage({type:'complete',channels:aligned,sampleRate:request.sampleRate,frames:request.frames,inferred:true},aligned.flat().map(channel=>channel.buffer));
}
scope.onmessage=(event)=>{void separate(event.data).catch(error=>scope.postMessage({type:'error',message:error instanceof Error?error.message:'Stem separation failed. Import four aligned stems or retry with a shorter source.'}));};
