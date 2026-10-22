/** Independent reader of Serato's public embedded hotcue formats.
 * Format references: Mixxx track/serato/{markers2,markers,tags}.cpp and
 * Holzhaus/serato-tags. No tag rewriting or external Serato database access.
 */
export interface SeratoCue {index:number;time:number;name:string;colour:string}
interface Cue {milliseconds:number;rgb:number;name:string}
interface Tags {modern:(Cue|undefined)[];legacy?:(Cue|undefined)[]}
const MAX_TAG=16*1024*1024, MAX_OBJECT=8*1024*1024, MAX_ENTRIES=4096;
const decoder=new TextDecoder('utf-8',{fatal:true});
const ascii=(data:Uint8Array)=>Array.from(data,c=>String.fromCharCode(c)).join('');
const equal=(data:Uint8Array,at:number,text:string)=>at>=0&&at+text.length<=data.length&&Array.from(text).every((c,i)=>data[at+i]===c.charCodeAt(0));
const be=(data:Uint8Array,at=0)=>new DataView(data.buffer,data.byteOffset+at,4).getUint32(0,false);
const le=(data:Uint8Array,at=0)=>new DataView(data.buffer,data.byteOffset+at,4).getUint32(0,true);
const safe=(data:Uint8Array,at=0)=>((data[at]|data[at+1]|data[at+2]|data[at+3])&128)?null:(data[at]*2097152+data[at+1]*16384+data[at+2]*128+data[at+3]);
const emptyTags=():Tags=>({modern:Array(32).fill(undefined)});
const clone=(tags:Tags):Tags=>({modern:tags.modern.slice(),legacy:tags.legacy?.slice()});
function unSync(data:Uint8Array) {const out:number[]=[];for(let i=0;i<data.length;i++){out.push(data[i]);if(data[i]===255&&data[i+1]===0)i++;}return new Uint8Array(out);}
function base64(data:Uint8Array):Uint8Array|null {
 let encoded='',padded=false,nul=false;
 for(const byte of data){
  if(byte===0){nul=true;continue;}if([9,10,13,32].includes(byte))continue;if(nul)return null;
  if(byte===61){padded=true;continue;}if(padded)return null;
  if(!((byte>=65&&byte<=90)||(byte>=97&&byte<=122)||(byte>=48&&byte<=57)||byte===43||byte===47))return null;
  encoded+=String.fromCharCode(byte);
 }
 if(encoded.length%4===1)encoded+='A';
 try{return Uint8Array.from(atob(encoded+'='.repeat((4-encoded.length%4)%4)),c=>c.charCodeAt(0));}catch{return null;}
}
function markers2(outer:Uint8Array):(Cue|undefined)[]|null {
 if(outer.length<3||outer[0]!==1||outer[1]!==1)return null;
 const data=base64(outer.subarray(2));if(!data||data.length<3||data[0]!==1||data[1]!==1)return null;
 const cues:(Cue|undefined)[]=Array(32).fill(undefined);let at=2;
 for(let entries=0;entries<MAX_ENTRIES&&at<data.length;entries++){
  const end=data.indexOf(0,at);if(end<0)return null;
  if(end===at)return data.subarray(at).every(byte=>byte===0)?cues:null;
  if(end-at>32)return null;const type=ascii(data.subarray(at,end));at=end+1;
  if(data.length-at<4)return null;const length=be(data,at);at+=4;if(length>data.length-at)return null;
  const entry=data.subarray(at,at+length);at+=length;if(type!=='CUE')continue;
  if(entry.length<13||entry[0]!==0||entry[6]!==0||entry[10]!==0||entry[11]!==0)return null;
  const label=entry.subarray(12),zero=label.indexOf(0);if(zero!==label.length-1||label.length>1025)return null;
  let name:string;try{name=decoder.decode(label.subarray(0,-1));}catch{return null;}
  const index=entry[1],milliseconds=be(entry,2),rgb=entry[7]*65536+entry[8]*256+entry[9];
  if(index<32&&(milliseconds!==0||rgb!==0))cues[index]={milliseconds,rgb,name};
 }
 return null;
}
const serato24=(p:Uint8Array)=>((((p[1]&127)>>2)|((p[0]&7)<<5))<<16)|((((p[2]&127)>>1)|((p[1]&3)<<6))<<8)|((p[3]&127)|((p[2]&1)<<7));
function legacy(data:Uint8Array):(Cue|undefined)[]|null {
 if(data.length!==318||data[0]!==2||data[1]!==5||be(data,2)!==14)return null;
 const result:(Cue|undefined)[]=Array(5).fill(undefined);
 for(let i=0;i<14;i++){
  const e=data.subarray(6+i*22,6+(i+1)*22);
  if(!equal(e,10,'\0\x7f\x7f\x7f\x7f\x7f')||(i<5?e[20]!==0&&e[20]!==1:e[20]!==3))return null;
  if((e[0]!==0&&e[0]!==127)||(e[5]!==0&&e[5]!==127)||(e[0]===127&&be(e,1)!==0x7f7f7f7f)||(e[5]===127&&be(e,6)!==0x7f7f7f7f)||(i<5&&e[21]!==0))return null;
  if(i<5&&e[0]===0){const milliseconds=serato24(e.subarray(1,5)),rgb=serato24(e.subarray(16,20));if(milliseconds||rgb)result[i]={milliseconds,rgb,name:''};}
 }
 return result;
}
function zeroText(data:Uint8Array,state:{at:number;little:boolean},encoding:number):string|null {
 if(state.at>=data.length)return null;
 if(encoding===0||encoding===3){const end=data.indexOf(0,state.at);if(end<0||end-state.at>4096)return null;const text=ascii(data.subarray(state.at,end));state.at=end+1;return text;}
 if(encoding!==1&&encoding!==2)return null;if(encoding===2)state.little=false;
 if(data.length-state.at>=2){if(data[state.at]===255&&data[state.at+1]===254){state.little=true;state.at+=2;}else if(data[state.at]===254&&data[state.at+1]===255){state.little=false;state.at+=2;}}
 let text='';while(data.length-state.at>=2&&text.length<=4096){const a=data[state.at++],b=data[state.at++],value=state.little?a+b*256:a*256+b;if(value===0)return text;text+=value<128?String.fromCharCode(value):'?';}return null;
}
function object(bytes:Uint8Array,tags:Tags) {
 if(!bytes.length||bytes.length>MAX_OBJECT)return;const state={at:1,little:true},encoding=bytes[0];
 if(zeroText(bytes,state,0)!=='application/octet-stream'||zeroText(bytes,state,encoding)===null)return;
 const description=zeroText(bytes,state,encoding);if(description===null)return;
 if(description==='Serato Markers2'){const parsed=markers2(bytes.subarray(state.at));if(parsed)tags.modern=parsed;}
 else if(description==='Serato Markers_'){const parsed=legacy(bytes.subarray(state.at));if(parsed)tags.legacy=parsed;}
}
function id3Body(body:Uint8Array,version:number,flags:number,tags:Tags):boolean {
 let at=0;if(flags&64){if(version===2||body.length<4)return false;const size=version===4?safe(body):be(body);if(size===null||size<6)return false;const skip=size+(version===4?0:4);if(skip>body.length)return false;at=skip;}
 const headerSize=version===2?6:10,idLength=version===2?3:4;
 for(let entry=0;entry<MAX_ENTRIES&&body.length-at>=headerSize;entry++){
  const header=body.subarray(at,at+headerSize);if(header[0]===0)return true;
  if(!header.subarray(0,idLength).every(c=>(c>=65&&c<=90)||(c>=48&&c<=57)))return false;
  const size=version===2?header[3]*65536+header[4]*256+header[5]:version===4?safe(header,4):be(header,4);if(size===null)return false;
  at+=headerSize;if(size>body.length-at)return false;
  const format=version===2?0:header[9],compressed=version===4?(format&12)!==0:(format&192)!==0;
  if(equal(header,0,version===2?'GEO':'GEOB')&&!compressed&&size<=MAX_OBJECT){
   let payload=body.subarray(at,at+size);if(version===4&&((format&2)||(flags&128)))payload=unSync(payload);
   let prefix=(version===4?(format&64):(format&32))?1:0;if(version===4&&(format&1))prefix+=4;if(prefix<=payload.length)object(payload.subarray(prefix),tags);
  }
  at+=size;
 }
 return at===body.length||(body.length-at<headerSize&&body.subarray(at).every(c=>c===0));
}
async function read(file:File,start:number,count:number,budget=MAX_TAG):Promise<Uint8Array> {
 if(count<0||count>budget||start<0||start+count>file.size)throw new Error('Metadata bounds');
 const bytes=new Uint8Array(await file.slice(start,start+count).arrayBuffer());if(bytes.length!==count)throw new Error('Truncated metadata');return bytes;
}
async function id3(file:File,start:number,end:number,tags:Tags) {
 if(end-start<10)return;const header=await read(file,start,10);
 if(!equal(header,0,'ID3')||header[3]<2||header[3]>4)return;
 const size=safe(header,6);if(size===null||size>MAX_TAG||size>end-start-10)return;
 let body=await read(file,start+10,size);
 if(header[3]===4&&(header[5]&16)){
  if(size<10)return;const footer=body.subarray(size-10);if(!equal(footer,0,'3DI')||!footer.subarray(3).every((value,i)=>value===header[i+3]))return;body=body.subarray(0,-10);
 }
 if(header[3]<4&&(header[5]&128))body=unSync(body);
 const candidate=clone(tags);if(id3Body(body,header[3],header[3]<4?header[5]&~128:header[5],candidate)){tags.modern=candidate.modern;tags.legacy=candidate.legacy;}
}
function vorbis(data:Uint8Array,tags:Tags) {
 if(data.length<8)return;const vendor=le(data);if(vendor>data.length-8)return;let at=4+vendor;const entries=le(data,at);at+=4;if(entries>MAX_ENTRIES)return;
 const candidate=clone(tags);
 for(let i=0;i<entries;i++){
  if(data.length-at<4)return;const size=le(data,at);at+=4;if(size>data.length-at)return;const field=data.subarray(at,at+size);at+=size;
  const equalAt=field.indexOf(61);if(equalAt<0||equalAt>64||ascii(field.subarray(0,equalAt)).toUpperCase()!=='SERATO_MARKERS_V2')continue;
  const decoded=base64(field.subarray(equalAt+1));if(!decoded||decoded.length>MAX_OBJECT-1)continue;
  const geob=new Uint8Array(decoded.length+1);geob.set(decoded,1);object(geob,candidate);
 }
 if(at===data.length){tags.modern=candidate.modern;tags.legacy=candidate.legacy;}
}
const saved=[0xcc0000,0xcc4400,0xcc8800,0xcccc00,0x88cc00,0x44cc00,0x00cc00,0x00cc44,0x00cc88,0x00cccc,0x0088cc,0x0044cc,0x0000cc,0x4400cc,0x8800cc,0xcc00cc,0xcc0088,0xcc0044];
const shown=[0xc02626,0xdb4e27,0xf8821a,0xfac313,0x4eb648,0x006838,0x1fad26,0x8dc63f,0x2b3673,0x1dbebd,0x0f88ca,0x16308b,0x173ba2,0x5c3f97,0x6823b6,0xce359e,0xdc1d49,0xc71136];
function colour(rgb:number){const index=saved.indexOf(rgb);return '#'+(index<0?rgb:shown[index]).toString(16).padStart(6,'0');}
/** Empty/unsupported/malformed metadata produces no invented hotcues. */
export async function readSeratoCues(file:File,duration:number):Promise<SeratoCue[]> {
 if(!Number.isFinite(duration)||duration<=0||file.size<10)return [];
 try {
  const header=await read(file,0,Math.min(12,file.size)),tags=emptyTags();
  if(equal(header,0,'ID3'))await id3(file,0,file.size,tags);
  else if(equal(header,0,'fLaC')){
   let at=4;for(let entry=0;entry<MAX_ENTRIES&&file.size-at>=4;entry++){
    const h=await read(file,at,4),size=h[1]*65536+h[2]*256+h[3];at+=4;if(size>file.size-at)return [];
    if((h[0]&127)===4)vorbis(await read(file,at,size),tags);at+=size;if(h[0]&128)break;
   }
  } else {
   const aiff=equal(header,0,'FORM')&&(equal(header,8,'AIFF')||equal(header,8,'AIFC')),wave=equal(header,0,'RIFF')&&equal(header,8,'WAVE');if(!aiff&&!wave)return [];
   const end=8+(aiff?be(header,4):le(header,4));if(end<12||end>file.size)return [];
   let at=12;for(let entry=0;entry<MAX_ENTRIES&&end-at>=8;entry++){
    const h=await read(file,at,8),size=aiff?be(h,4):le(h,4);at+=8;if(size>end-at)return [];
    if(equal(h,0,'ID3 ')||equal(h,0,'id3 '))await id3(file,at,at+size,tags);at+=size+(size&1);
   }
  }
  if(tags.legacy)for(let i=0;i<5;i++){const older=tags.legacy[i];tags.modern[i]=older?{...older,name:tags.modern[i]?.name||''}:undefined;}
  const cues:SeratoCue[]=[];
  tags.modern.forEach((cue,index)=>{if(cue&&cue.milliseconds/1000<duration)cues.push({index,time:cue.milliseconds/1000,name:cue.name,colour:colour(cue.rgb)});});return cues;
 } catch{return [];}
}
