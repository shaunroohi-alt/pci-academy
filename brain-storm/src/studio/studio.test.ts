import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import type {AudioEngine,TriggerOptions} from '../contracts';
import type {AssetInfo,PatternNote,SessionState,SourceInfo} from '../model';
import {createSession} from '../model';
import {BrowserStudioController} from './BrowserStudioController';
import {planPerformance,planSong,timelineSlices} from './planner';

class FakeEngine implements AudioEngine {
  clock={currentTime:0};
  get context(){return this.clock as AudioContext;}
  triggers:{token:string;pad:number;options:TriggerOptions}[]=[];
  assets:{token:string;id:string;options:Parameters<AudioEngine['playAsset']>[1]}[]=[];
  releases:{token:string;time:number}[]=[];
  stops=0;
  initializePending:Promise<void>|null=null;
  private serial=0;
  async initialize(){if(this.initializePending)await this.initializePending;}
  dispose(){}
  setSession(_state:SessionState){}
  async loadSource(_file:File){return {} as SourceInfo;}
  async loadAsset(_file:File,_bpm:number){return {} as AssetInfo;}
  async loadDemo(){return {} as SourceInfo;}
  getBuffer(_id:string){return undefined;}
  installBuffer(_info:SourceInfo,_buffer:AudioBuffer){}
  getBuffers(){return new Map<string,AudioBuffer>();}
  triggerCue(pad:number,options:TriggerOptions={}){const token=`v${++this.serial}`;this.triggers.push({token,pad,options:{...options}});return token;}
  releaseVoice(token:string,time=this.clock.currentTime){this.releases.push({token,time});}
  stopVoices(){this.stops++;}
  playAsset(id:string,options:Parameters<AudioEngine['playAsset']>[1]){const token=`v${++this.serial}`;this.assets.push({token,id,options:{...options}});return token;}
  async audition(){}
  pauseSource(){}
  seekSource(_time:number){}
  snapshot(){return {sourcePlaying:false,sourceTime:0,activePads:[],trackPeaks:[],masterPeak:0,recording:false};}
  setStems(_buffers:(AudioBuffer|null)[]){}
  getStems(){return [];}
  async startRecording(){}
  async stopRecording(){return new Blob();}
  async exportCue(_pad:number){return new Blob();}
  async renderPattern(_pattern:number,_track:number){return {} as AudioBuffer;}
}
function note(id:string,pad:number,beat:number,duration=.25){return {id,pad,beat,duration,velocity:.8,pitch:0};}
function advance(engine:FakeEngine,seconds:number){
  const end=engine.clock.currentTime+seconds;
  while(engine.clock.currentTime<end-1e-9){const delta=Math.min(.025,end-engine.clock.currentTime);engine.clock.currentTime+=delta;vi.advanceTimersByTime(delta*1000);}
}
const asset:AssetInfo={assetId:'audio0',name:'Loop',duration:8,sampleRate:44100,channels:2,bpm:120,key:'Unknown',sourceBpm:120,lengthBeats:16};
let active:BrowserStudioController[]=[];
function setup(state=createSession()) {const engine=new FakeEngine();const studio=new BrowserStudioController(engine);studio.setSession(state);active.push(studio);return {state,engine,studio};}
beforeEach(()=>vi.useFakeTimers());
afterEach(()=>{for(const studio of active)studio.dispose();active=[];vi.useRealTimers();});

describe('timeline planning',()=>{
  it('splits an arrangement lookahead at loop wrap without dropping the first note',()=>{
    const state=createSession();state.loop=true;state.loopStart=4;state.loopEnd=8;state.patterns[0].length=4;state.patterns[0].notes=[note('first',31,0),note('last',3,3.75,.5)];
    state.clips=[{id:'clip',track:7,kind:'pattern',contentId:'p0',beat:4,length:4,offset:0,loop:true,gain:.5}];
    const slices=timelineSlices(state,'song',7.7,8.2);expect(slices).toHaveLength(2);expect(slices[1].timelineStart).toBeCloseTo(4);
    const events=planSong(state,7.7,8.2);expect(events).toHaveLength(2);expect(events[0].absoluteBeat).toBeCloseTo(7.75);expect(events[0].endBeat).toBeCloseTo(8);expect(events[1].absoluteBeat).toBeCloseTo(8);expect(events[1].track).toBe(7);expect(events[1].gain).toBe(.5);
  });
  it('applies pattern content offset, repeats only looped clips and carries clip gain',()=>{
    const state=createSession();state.patterns[0].length=4;state.patterns[0].notes=[note('a',0,0),note('b',17,2)];
    state.clips=[{id:'clip',track:3,kind:'pattern',contentId:'p0',beat:10,length:8,offset:1,loop:true,gain:.25}];
    const looped=planSong(state,10,18);expect(looped.map(e=>e.absoluteBeat)).toEqual([11,13,15,17]);expect(looped.every(e=>e.track===3&&e.gain===.25)).toBe(true);
    state.clips[0].loop=false;expect(planSong(state,10,18).map(e=>e.absoluteBeat)).toEqual([11]);
  });
  it('resumes an audio clip at its actual source offset and bounds one-shot playback',()=>{
    const state=createSession();state.tempo=90;state.assets=[asset];state.clips=[{id:'a',track:4,kind:'audio',contentId:'audio0',beat:8,length:20,offset:2,loop:false,gain:.6}];
    const event=planSong(state,11,11.2)[0];expect(event.kind).toBe('audio');if(event.kind!=='audio')return;
    expect(event.offset).toBeCloseTo(2.5);expect(event.rate).toBe(.75);expect(event.endBeat).toBeCloseTo(22);expect(event.gain).toBe(.6);expect(event.track).toBe(4);
  });
  it('plans independent performance audio cycles with aligned offsets after suspension',()=>{
    const state=createSession();state.assets=[asset];state.launchSlots[7][3]={kind:'audio',contentId:'audio0'};
    const event=planPerformance(state,20,20.2,[{track:7,scene:3,start:2,until:Infinity}])[0];expect(event.kind).toBe('audio');if(event.kind!=='audio')return;
    expect(event.absoluteBeat).toBe(20);expect(event.offset).toBe(1);expect(event.endBeat).toBe(34);expect(event.key).toContain(':audio:1');
  });
});

describe('real-time audio clock and voice ownership',()=>{
  it('schedules cue32 precisely on the audio clock and gates it across a pattern wrap',async()=>{
    const {state,engine,studio}=setup();state.patterns[0].length=4;state.patterns[0].notes=[note('late',31,3.75,1)];studio.setSession(state);await studio.play('pattern');
    advance(engine,1.9);const voice=engine.triggers.find(v=>v.pad===31);expect(voice).toBeDefined();expect(voice!.options.time).toBeCloseTo(1.895);expect(voice!.options.duration).toBeUndefined();
    advance(engine,.5);expect(engine.releases.some(r=>r.token===voice!.token&&Math.abs(r.time-2.395)<.001)).toBe(true);
    expect(studio.snapshot().beat).toBeCloseTo(.76,1);
  });
  it('Stop cancels future voices and prevents a pending async Play from restarting',async()=>{
    const {state,engine,studio}=setup();state.patterns[0].notes=[note('a',0,.1)];studio.setSession(state);await studio.play('pattern');const voice=engine.triggers[0];expect(voice.options.time).toBeGreaterThan(engine.clock.currentTime);
    studio.stop();expect(engine.releases.some(r=>r.token===voice.token&&r.time===0)).toBe(true);const count=engine.triggers.length;advance(engine,1);expect(engine.triggers).toHaveLength(count);expect(studio.snapshot().playing).toBe(false);
    let resolve!:()=>void;engine.initializePending=new Promise<void>(r=>{resolve=r;});const start=studio.play('song');studio.stop();resolve();await start;expect(studio.snapshot().playing).toBe(false);
  });
  it('keeps already playing notes alive when an unrelated overdub is published',async()=>{
    const {state,engine,studio}=setup();state.patterns[0].notes=[note('held',1,0,2)];studio.setSession(state);await studio.play('pattern');advance(engine,.05);
    const token=engine.triggers[0].token;state.patterns[0].notes.push(note('overdub',2,3));studio.setSession(state);
    expect(engine.releases.filter(r=>r.token===token&&r.time<=engine.clock.currentTime+.001)).toHaveLength(0);
    state.patterns[0].notes=state.patterns[0].notes.filter(n=>n.id!=='held');studio.setSession(state);expect(engine.releases.some(r=>r.token===token&&Math.abs(r.time-engine.clock.currentTime)<.001)).toBe(true);
  });
  it('retimes the musical clock continuously when tempo changes',async()=>{
    const {state,engine,studio}=setup();await studio.play('pattern');advance(engine,.52);expect(studio.snapshot().beat).toBeCloseTo(1);
    state.tempo=60;studio.setSession(state);advance(engine,1);expect(studio.snapshot().beat).toBeCloseTo(2);
  });
  it('seeks into audio clips without replaying their start or scheduling missed note bursts',async()=>{
    const {state,engine,studio}=setup();state.assets=[asset];state.clips=[{id:'loop',track:2,kind:'audio',contentId:'audio0',beat:0,length:16,offset:0,loop:false,gain:.8}];studio.setSession(state);studio.seek(8);await studio.play('song');
    expect(engine.assets[0].options.offset).toBe(4);expect(engine.assets[0].options.duration).toBe(4);expect(engine.assets[0].options.gain).toBe(.8);
    const count=engine.assets.length;advance(engine,.5);expect(engine.assets).toHaveLength(count);
  });
});

describe('performance launch quantization',()=>{
  it('queues a launch at the next bar and does not release that future voice early',async()=>{
    const {state,engine,studio}=setup();state.patterns[0].notes=[note('onset',3,0,.5)];state.launchSlots[0][1]={kind:'pattern',contentId:'p0'};studio.setSession(state);await studio.play('perform');advance(engine,.52);await studio.launch(0,1);
    expect(studio.snapshot().activeScene[0]).toBe(-1);expect(studio.snapshot().pendingScene[0]).toBe(1);
    advance(engine,1.43);const voice=engine.triggers.find(v=>v.pad===3);expect(voice).toBeDefined();expect(voice!.options.time).toBeCloseTo(2.02);expect(engine.releases.filter(r=>r.token===voice!.token&&r.time<2.02)).toHaveLength(0);
    advance(engine,.1);expect(studio.snapshot().activeScene[0]).toBe(1);expect(studio.snapshot().pendingScene[0]).toBe(-1);
  });
  it('stops track8 including a queued future launch without stopping track1',async()=>{
    const {state,engine,studio}=setup();state.launchQuantize=0;state.patterns[0].notes=[note('a',1,0,4)];state.patterns[1].notes=[note('b',31,0,4)];state.launchSlots[0][0]={kind:'pattern',contentId:'p0'};state.launchSlots[7][3]={kind:'pattern',contentId:'p1'};studio.setSession(state);
    await studio.launch(0,0);await studio.launch(7,3);advance(engine,.025);const first=engine.triggers.find(v=>v.options.track===0)!;const last=engine.triggers.find(v=>v.options.track===7)!;studio.stopTrack(7);
    expect(engine.releases.some(r=>r.token===last.token&&r.time===engine.clock.currentTime)).toBe(true);expect(engine.releases.filter(r=>r.token===first.token&&r.time<=engine.clock.currentTime)).toHaveLength(0);expect(studio.snapshot().activeScene[7]).toBe(-1);expect(studio.snapshot().activeScene[0]).toBe(0);
  });
});

describe('initial audio startup launch ownership',()=>{
  it('preserves two simultaneous track launches while the audio context initializes',async()=>{
    const {state,engine,studio}=setup();state.launchQuantize=0;state.patterns[0].notes=[note('a',0,0)];state.patterns[1].notes=[note('b',31,0)];state.launchSlots[0][0]={kind:'pattern',contentId:'p0'};state.launchSlots[7][3]={kind:'pattern',contentId:'p1'};studio.setSession(state);
    let resolve!:()=>void;engine.initializePending=new Promise<void>(r=>{resolve=r;});const first=studio.launch(0,0),last=studio.launch(7,3);resolve();await Promise.all([first,last]);
    expect(studio.snapshot().activeScene[0]).toBe(0);expect(studio.snapshot().activeScene[7]).toBe(3);expect(engine.triggers.some(v=>v.options.track===0)).toBe(true);expect(engine.triggers.some(v=>v.options.track===7)).toBe(true);
  });
  it('does not resurrect a pre-Stop launch when a new launch shares the pending initialization',async()=>{
    const {state,engine,studio}=setup();state.launchQuantize=0;state.patterns[0].notes=[note('a',0,0)];state.launchSlots[0][0]={kind:'pattern',contentId:'p0'};state.launchSlots[7][3]={kind:'pattern',contentId:'p0'};studio.setSession(state);
    let resolve!:()=>void;engine.initializePending=new Promise<void>(r=>{resolve=r;});const cancelled=studio.launch(0,0);studio.stop();const fresh=studio.launch(7,3);resolve();await Promise.all([cancelled,fresh]);
    expect(studio.snapshot().activeScene[0]).toBe(-1);expect(studio.snapshot().activeScene[7]).toBe(3);expect(engine.triggers.some(v=>v.options.track===0)).toBe(false);expect(engine.triggers.some(v=>v.options.track===7)).toBe(true);
  });
});

describe('recorded input ownership and duration',()=>{
  it('records cue, velocity, pitch, pattern and original track despite selection changes before key-up',async()=>{
    const {state,engine,studio}=setup();state.recordQuantize=.25;state.selectedTrack=2;studio.setSession(state);await studio.play('pattern');studio.armNotes(true);advance(engine,.52);
    const emitted:{pattern:number;note:unknown}[]=[];studio.onRecordedNote=(pattern,note)=>emitted.push({pattern,note});const token=studio.noteOn(17,.72,-7);advance(engine,.5);
    state.selectedPattern=15;state.selectedTrack=6;studio.setSession(state);studio.noteOff(token);
    expect(engine.triggers.find(v=>v.token===token)?.options.track).toBe(2);expect(emitted).toHaveLength(1);expect(emitted[0].pattern).toBe(0);expect(emitted[0].note).toMatchObject({pad:17,beat:1,duration:1,velocity:.72,pitch:-7});
  });
  it('uses an unwrapped recording clock for a held note crossing an arrangement loop',async()=>{
    const {state,engine,studio}=setup();state.loop=true;state.loopStart=4;state.loopEnd=8;state.patterns[0].length=4;state.recordQuantize=0;studio.setSession(state);studio.seek(7.5);await studio.play('song');studio.armNotes(true);advance(engine,.02);
    const emitted:PatternNote[]=[];studio.onRecordedNote=(_,note)=>emitted.push(note);const token=studio.noteOn(0);advance(engine,.5);studio.noteOff(token);
    expect(studio.snapshot().beat).toBeCloseTo(4.5);expect(emitted[0].beat).toBeCloseTo(3.5);expect(emitted[0].duration).toBeCloseTo(1);
  });
  it('Trigger key-up records its gate while the one-shot keeps sounding, and Stop still force-stops it',async()=>{
    const {state,engine,studio}=setup();state.hold=false;studio.setSession(state);await studio.play('pattern');studio.armNotes(true);advance(engine,.02);const recorded:PatternNote[]=[];studio.onRecordedNote=(_,n)=>recorded.push(n);
    const token=studio.noteOn(4);advance(engine,.3);studio.noteOff(token);expect(recorded).toHaveLength(1);expect(engine.releases.filter(r=>r.token===token)).toHaveLength(0);studio.stop();expect(engine.stops).toBeGreaterThan(0);expect(recorded).toHaveLength(1);
  });
  it('disarming flushes the recorded note once without cutting a held live voice',async()=>{
    const {engine,studio}=setup();await studio.play('pattern');studio.armNotes(true);advance(engine,.02);const recorded:PatternNote[]=[];studio.onRecordedNote=(_,n)=>recorded.push(n);const token=studio.noteOn(2);advance(engine,.25);studio.armNotes(false);
    expect(recorded).toHaveLength(1);expect(engine.releases.filter(r=>r.token===token)).toHaveLength(0);studio.noteOff(token);expect(recorded).toHaveLength(1);expect(engine.releases.some(r=>r.token===token)).toBe(true);
  });
});
