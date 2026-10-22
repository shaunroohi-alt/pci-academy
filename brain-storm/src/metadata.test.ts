import {describe,it,expect} from 'vitest';
import {readSeratoCues} from './metadata';
const text=(s:string)=>[...new TextEncoder().encode(s)];
const be=(v:number,n=4)=>Array.from({length:n},(_,i)=>(v>>>(8*(n-i-1)))&255);
const le=(v:number)=>be(v).reverse();
const safe=(v:number)=>Array.from({length:4},(_,i)=>(v>>>(7*(3-i)))&127);
const b64=(bytes:number[])=>text(btoa(String.fromCharCode(...bytes)));
const cue=(index:number,ms:number,rgb:number,name:string)=>{const e=[0,index,...be(ms),0,...be(rgb,3),0,0,...text(name),0];return [...text('CUE\0'),...be(e.length),...e];};
const modern=(entries:number[][])=>[1,1,...b64([1,1,...entries.flat(),0])];
function object(description:string,data:number[],utf16=false){return [utf16?1:0,...text('application/octet-stream'),0,...(utf16?[255,254,0,0,255,254,...Array.from(description,c=>[c.charCodeAt(0),0]).flat(),0,0]:[0,...text(description),0]),...data];}
const frame=(data:number[],version=4,flags=0)=>[...text(version===2?'GEO':'GEOB'),...(version===2?be(data.length,3):[...(version===4?safe(data.length):be(data.length)),0,flags]),...data];
const unsync=(data:number[])=>data.flatMap(c=>c===255?[255,0]:[c]);
function id3(frames:number[][],version=4,extended=false,globalUnsync=false,padding=0){let body=[...(extended?(version===4?[...safe(6),1,0]:[...be(6),0,0,0,0,0,0]):[]),...frames.flat(),...Array(padding).fill(0)];if(globalUnsync)body=unsync(body);return [...text('ID3'),version,0,(extended?64:0)|(globalUnsync?128:0),...safe(body.length),...body];}
function container(tag:number[],aiff=false,odd=false){const body=[...text(aiff?'AIFF':'WAVE'),...(odd?[...text('JUNK'),...(aiff?be(1):le(1)),1,0]:[]),...text(aiff?'ID3 ':'id3 '),...(aiff?be(tag.length):le(tag.length)),...tag,...(tag.length&1?[0]:[])];return [...text(aiff?'FORM':'RIFF'),...(aiff?be(body.length):le(body.length)),...body];}
function flac(data:number[]){const field=text('SERATO_MARKERS_V2='+String.fromCharCode(...b64(object('Serato Markers2',data).slice(1)))),comment=[...le(4),...text('test'),...le(1),...le(field.length),...field];return [...text('fLaC'),0,0,0,34,...Array(34).fill(0),132,...be(comment.length,3),...comment];}
const file=(bytes:number[],name='fixture.mp3')=>new File([new Uint8Array(bytes)],name);
function packed(bytes:number[],at:number,value:number){const a=(value>>>16)&255,b=(value>>>8)&255,c=value&255;bytes.splice(at,4,a>>>5,((b>>>6)|(a<<2))&127,((c>>>7)|(b<<1))&127,c&127);}
function legacy(){return [2,5,...be(14),...Array.from({length:14},(_,i)=>[...Array(10).fill(127),0,...Array(5).fill(127),0,0,0,0,i<5?0:3,0]).flat(),0,0,0,0];}
const good=modern([cue(0,1000,0x123456,'Intro'),cue(7,2000,0xcc0000,'Verse α')]);
describe('embedded Serato hotcue import',()=>{
 for(const version of [2,3,4])it(`reads sparse positions, UTF8 and native display palette in ID3v2.${version}`,async()=>{
  const result=await readSeratoCues(file(id3([frame(object('Serato Markers2',good),version)],version)),10);
  expect(result).toEqual([{index:0,time:1,name:'Intro',colour:'#123456'},{index:7,time:2,name:'Verse α',colour:'#c02626'}]);
 });
 for(const [name,bytes] of [['WAV',container(id3([frame(object('Serato Markers2',good))]),false,true)],['AIFF',container(id3([frame(object('Serato Markers2',good))]),true,true)],['FLAC',flac(good)]] as const)it(`reads ${name} container metadata`,async()=>{expect((await readSeratoCues(file([...bytes]),10)).map(c=>c.index)).toEqual([0,7]);});
 for(const version of [3,4])it(`handles extended ID3v2.${version} header and short padding`,async()=>{expect(await readSeratoCues(file(id3([frame(object('Serato Markers2',good),version)],version,true,false,3)),10)).toHaveLength(2);});
 it('handles UTF16 descriptions and v3 global / v4 frame unsynchronisation',async()=>{
  const utf=object('Serato Markers2',good,true);
  expect(await readSeratoCues(file(id3([frame(utf,3)],3,false,true)),10)).toHaveLength(2);
  expect(await readSeratoCues(file(id3([frame(unsync(utf),4,2)])),10)).toHaveLength(2);
 });
 it('validates and excludes the ID3v2.4 footer',async()=>{
  const bytes=id3([frame(object('Serato Markers2',good))]);bytes[5]=16;bytes.splice(6,4,...safe(bytes.length));bytes.push(...text('3DI'),...bytes.slice(3,10));
  expect(await readSeratoCues(file(bytes),10)).toHaveLength(2);bytes[bytes.length-1]^=1;expect(await readSeratoCues(file(bytes),10)).toEqual([]);
 });
 it('uses legacy times/colors and cleared first-five slots while preserving modern names and later cues',async()=>{
  const older=legacy();older[6]=0;older[26]=1;packed(older,7,1500);packed(older,22,0xcccc00);
  const newer=modern([cue(0,1000,0xcc0000,'Keep label'),cue(1,1000,0xcc0000,'Cleared'),cue(6,3000,0x123456,'Extra')]);
  expect(await readSeratoCues(file(id3([frame(object('Serato Markers_',older)),frame(object('Serato Markers2',newer))])),10)).toEqual([{index:0,time:1.5,name:'Keep label',colour:'#fac313'},{index:6,time:3,name:'Extra',colour:'#123456'}]);
 });
 it('repairs the documented missing final Base64 sextet',async()=>{
  const data=modern([cue(0,1000,0x123456,'A')]);while(data.at(-1)===61)data.pop();data.pop();expect(await readSeratoCues(file(id3([frame(object('Serato Markers2',data))])),10)).toHaveLength(1);
 });
 it('rejects malformed tags transactionally after a valid GEOB',async()=>{
  const validFrame=frame(object('Serato Markers2',good));const badFrame=[...text('GEOB'),127,127,127,127,0,0];
  expect(await readSeratoCues(file(id3([validFrame,badFrame])),10)).toEqual([]);
  const bytes=id3([validFrame]);bytes.pop();expect(await readSeratoCues(file(bytes),10)).toEqual([]);
  const invalid=id3([validFrame]);invalid[6]=128;expect(await readSeratoCues(file(invalid),10)).toEqual([]);
 });
 it('rejects malformed Base64 and invalid UTF8 labels',async()=>{
  expect(await readSeratoCues(file(id3([frame(object('Serato Markers2',[1,1,64,64]))])),10)).toEqual([]);
  const entry=cue(0,1000,0xcc0000,'A');entry[entry.length-2]=255;
  expect(await readSeratoCues(file(id3([frame(object('Serato Markers2',modern([entry])))])),10)).toEqual([]);
 });
 it('rejects a partial FLAC comment list instead of exposing its first valid object',async()=>{
  const bytes=flac(good);bytes[54]=2;expect(await readSeratoCues(file(bytes),10)).toEqual([]);
 });
 it('bounds cue indices and excludes positions at/past the source end',async()=>{
  const data=modern([cue(31,1000,0x123456,'Last'),cue(32,1000,0x123456,'Outside'),cue(2,10000,0xcc0000,'End'),cue(3,0xffffffff,0xcc0000,'Late')]);
  expect(await readSeratoCues(file(id3([frame(object('Serato Markers2',data))])),10)).toEqual([{index:31,time:1,name:'Last',colour:'#123456'}]);
  expect(await readSeratoCues(file(id3([])),NaN)).toEqual([]);
 });
 it('ignores unsupported compressed GEOB without inventing cues',async()=>{expect(await readSeratoCues(file(id3([frame(object('Serato Markers2',good),4,8)])),10)).toEqual([]);});
 it('skips a large WAV audio chunk using bounded file slices',async()=>{
  const tag=id3([frame(object('Serato Markers2',good))]),audio=64*1024*1024,head=[...text('RIFF'),...le(4+8+audio+8+tag.length+(tag.length&1)),...text('WAVEdata'),...le(audio)],tail=[...text('id3 '),...le(tag.length),...tag,...(tag.length&1?[0]:[])];let readBytes=0;
  const size=head.length+audio+tail.length;
  const virtual={size,slice(start:number,end:number){const length=end-start;readBytes+=length;const part=new Uint8Array(length);for(let i=0;i<length;i++){const at=start+i;part[i]=at<head.length?head[at]:at>=head.length+audio?tail[at-head.length-audio]:0;}return new Blob([part]);}} as File;
  expect(await readSeratoCues(virtual,10)).toHaveLength(2);expect(readBytes).toBeLessThan(2048);
 });
});

// Metadata-only goldens published by Jan Holthuis, Holzhaus/serato-tags,
// CC BY-SA 4.0; no source music copied.
// https://github.com/Holzhaus/serato-tags/tree/main/data/id3/
// https://creativecommons.org/licenses/by-sa/4.0/
const publishedLegacy=Array.from(atob("AgUAAAAOAAAAAAB/f39/fwB/f39/fwYwAAABAAAADSpYf39/f38Af39/f38GMhAAAQAAAANUZH9/f39/AH9/f39/AAABTAEAAAAAAGx/f39/fwB/f39/fwYzGAABAAAAAAd3f39/f38Af39/f38AAxgAAQB/f39/f39/f39/AH9/f39/AAAAAAMAf39/f39/f39/fwB/f39/fwAAAAADAH9/f39/f39/f38Af39/f38AAAAAAwB/f39/f39/f39/AH9/f39/AAAAAAMAf39/f39/f39/fwB/f39/fwAAAAADAH9/f39/f39/f38Af39/f38AAAAAAwB/f39/f39/f39/AH9/f39/AAAAAAMAf39/f39/f39/fwB/f39/fwAAAAADAH9/f39/f39/f38Af39/f38AAAAAAwAHf39/"),c=>c.charCodeAt(0));
const publishedModern=Array.from(atob("AQFBUUZEVDB4UFVnQUFBQUFFQVAvLy8wTlZSUUFBQUFBTkFBQUFBQUFBQU13QUFBQUFBRU5WUlFBQUFBQU5BQUVBQTFWWUFNeUkKQUFBQUFFTlZSUUFBQUFBTkFBSUFBT3BrQUFBQXpBQUFBRU5WUlFBQUFBQU5BQU1BQUFCc0FNek1BQUFBQUVOVlJRQUFBQUFOCkFBUUFBQVAzQUFETUFBQUFBRUpRVFV4UFEwc0FBQUFBQVFBQQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="),c=>c.charCodeAt(0));
it('imports actual Serato-generated modern marker goldens',async()=>{
 const cues=await readSeratoCues(file(id3([frame(object('Serato Markers2',publishedModern))])),300);
 expect(cues.map(c=>c.time)).toEqual([0,218.456,60.004,.108,1.015]);
 expect(cues.map(c=>c.colour)).toEqual(['#c02626','#f8821a','#173ba2','#fac313','#1fad26']);
});
it('imports actual Serato-generated legacy positions in AIFF',async()=>{
 const cues=await readSeratoCues(file(container(id3([frame(object('Serato Markers_',publishedLegacy))]),true)),300);
 expect(cues).toHaveLength(5);expect(cues[1].time).toBe(218.456);expect(cues[4].time).toBe(1.015);
});
