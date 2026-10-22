import type {AudioEngine,StudioController,StudioSnapshot} from '../contracts';
import type {PatternNote,PlayMode,SessionState} from '../model';
import {cloneSession,createSession,quantize,uid} from '../model';
import {EPSILON,ownerIsCurrent,planPattern,planPerformance,planSong,timelineBeat,wrap} from './planner';
import type {EventOwner,LanePlan,PlannedEvent} from './planner';

const LOOKAHEAD=.1;
const START_LEAD=.02;
interface ScheduledVoice {key:string;token:string;start:number;end:number;owner:EventOwner;kind:'note'|'audio';releaseTime:number|null}
interface PendingLaunch {scene:number;beat:number}
interface Lane {scene:number;start:number;pending:PendingLaunch|null}
interface CapturedNote {pattern:number;length:number;phase:number;onset:number;quantum:number;pad:number;velocity:number;pitch:number}
interface InputVoice {token:string;track:number;hold:boolean;released:boolean;expires:number;capture:CapturedNote|null}

function timelineFingerprint(state:SessionState):string {
  return JSON.stringify([state.source?.assetId,state.selectedPattern,state.selectedTrack,state.patterns,state.clips,state.assets,state.launchSlots,state.loop,state.loopStart,state.loopEnd]);
}

/** Audio-clock driven note/clip scheduling; UI timers never determine note times. */
export class BrowserStudioController implements StudioController {
  onRecordedNote:((pattern:number,note:PatternNote)=>void)|null=null;
  private state:SessionState=createSession();
  private signature=timelineFingerprint(this.state);
  private playing=false;
  private recording=false;
  private mode:PlayMode='pattern';
  private anchorTime=0;
  private anchorBeat=0;
  private stoppedBeat=0;
  private scheduledUntil=0;
  private epoch=0;
  private launchEpoch=0;
  private performanceStart:Promise<void>|null=null;
  private disposed=false;
  private timer:ReturnType<typeof setInterval>|undefined;
  private clockWorker:Worker|null=null;
  private workerFailed=false;
  private voices=new Map<string,ScheduledVoice>();
  private inputs=new Map<string,InputVoice>();
  private lanes:Lane[]=Array.from({length:8},()=>({scene:-1,start:0,pending:null}));
  constructor(private readonly engine:AudioEngine) {}

  setSession(state:SessionState):void {
    if(this.disposed)return;
    const now=this.time(),absolute=this.absoluteAt(now);
    const old=this.state;
    const tempoChanged=Math.abs(old.tempo-state.tempo)>1e-9;
    const signature=timelineFingerprint(state);
    const changed=signature!==this.signature;
    this.state=cloneSession(state);
    this.signature=signature;
    if(!this.playing)return;
    if(tempoChanged) {this.anchorTime=now;this.anchorBeat=absolute;}
    if(changed||tempoChanged) {
      const sourceChanged=old.source?.assetId!==state.source?.assetId;
      for(const [key,voice] of this.voices) {
        const remove=voice.start>=absolute-EPSILON || !ownerIsCurrent(this.state,this.mode,voice.owner) || (sourceChanged&&voice.kind==='note') || (tempoChanged&&voice.kind==='audio');
        if(remove) {this.engine.releaseVoice(voice.token,now);this.voices.delete(key);}
        else if(tempoChanged)voice.releaseTime=null;
      }
      this.scheduledUntil=absolute;
      this.tick();
    }
  }

  async play(mode:PlayMode):Promise<void> {
    if(this.disposed)throw new Error('The sequencer has been disposed.');
    if(this.playing&&this.mode===mode)return;
    const request=++this.epoch;
    await this.engine.initialize();
    if(this.disposed||request!==this.epoch)return;
    const now=this.time();
    const position=this.playing?timelineBeat(this.state,this.mode,this.absoluteAt(now)):this.stoppedBeat;
    this.cancelSequenced(now);
    this.mode=mode;
    this.anchorTime=now+START_LEAD;
    this.anchorBeat=Math.max(0,position);
    this.scheduledUntil=this.anchorBeat;
    this.playing=true;
    if(mode!=='perform')this.clearLanes();
    this.startClock();
    this.tick();
  }

  stop():void {
    if(this.disposed)return;
    ++this.epoch;++this.launchEpoch;this.performanceStart=null;
    const now=this.time(),absolute=this.absoluteAt(now);
    this.stoppedBeat=timelineBeat(this.state,this.mode,absolute);
    this.finishCaptures(absolute);
    this.playing=false;this.recording=false;
    this.cancelSequenced(now);
    this.engine.stopVoices();
    this.inputs.clear();
    this.clearLanes();this.stopClock();
  }

  seek(beat:number):void {
    if(this.disposed)return;
    const position=Math.max(0,Math.min(1_000_000,Number.isFinite(beat)?beat:0));
    const now=this.time();
    this.finishCaptures(this.absoluteAt(now));
    this.cancelSequenced(now);this.engine.stopVoices();this.inputs.clear();
    this.stoppedBeat=position;this.anchorBeat=position;this.anchorTime=now+START_LEAD;this.scheduledUntil=position;
    if(this.mode==='perform') {
      for(const lane of this.lanes) {lane.start=position;lane.pending=null;}
    }
    if(this.playing)this.tick();
  }

  armNotes(value:boolean):void {
    if(this.disposed)return;
    if(!value) {this.finishCaptures(this.absoluteAt(this.time()));this.recording=false;return;}
    this.recording=true;
    if(!this.playing)void this.play('pattern').catch(()=>{this.recording=false;});
  }

  noteOn(pad:number,velocity=1,pitch=0):string {
    if(this.disposed||!Number.isInteger(pad)||pad<0||pad>=32)return '';
    const now=this.time(),absolute=this.absoluteAt(now);
    this.pruneInputs(now);
    const track=this.state.selectedTrack;
    const strength=Math.max(0,Math.min(1,Number.isFinite(velocity)?velocity:1));
    const semitones=Number.isFinite(pitch)?pitch:0;
    const token=this.engine.triggerCue(pad,{velocity:strength,pitch:semitones,track});
    const cue=this.state.cues[pad],sourceDuration=this.state.source?.duration??30;
    const duration=Math.max(.01,(cue.end>cue.start?cue.end:sourceDuration)-cue.start)/Math.max(.01,cue.speed);
    const pattern=this.state.patterns[this.state.selectedPattern];
    const capture:CapturedNote|null=this.recording&&pattern?{pattern:this.state.selectedPattern,length:pattern.length,phase:wrap(timelineBeat(this.state,this.mode,absolute),pattern.length),onset:absolute,quantum:this.state.recordQuantize,pad,velocity:strength,pitch:semitones}:null;
    this.inputs.set(token,{token,track,hold:this.state.hold,released:false,expires:now+duration+2,capture});
    return token;
  }

  noteOff(token:string):void {
    const input=this.inputs.get(token);
    if(!input||input.released)return;
    const now=this.time(),absolute=this.absoluteAt(now);
    input.released=true;
    const result=input.capture?this.finishCapture(input.capture,absolute):null;
    input.capture=null;
    if(input.hold) {this.engine.releaseVoice(token,now);this.inputs.delete(token);}
    if(result)this.onRecordedNote?.(result.pattern,result.note);
    this.pruneInputs(now);
  }

  async launch(track:number,scene:number):Promise<void> {
    if(!Number.isInteger(track)||track<0||track>=8||!Number.isInteger(scene)||scene<0||scene>=4)return;
    const launchRequest=this.launchEpoch;
    await this.ensurePerformance();
    if(!this.playing||this.mode!=='perform'||this.disposed||launchRequest!==this.launchEpoch)return;
    const now=this.time(),absolute=this.absoluteAt(now);
    this.advanceLanes(absolute);
    const quantum=this.state.launchQuantize;
    const at=quantum>0?Math.ceil((absolute-EPSILON)/quantum)*quantum:absolute;
    this.queueLane(track,this.state.launchSlots[track]?.[scene]?scene:-1,Math.max(absolute,at));
    this.tick();
  }

  async launchScene(scene:number):Promise<void> {
    if(!Number.isInteger(scene)||scene<0||scene>=4)return;
    const launchRequest=this.launchEpoch;
    await this.ensurePerformance();
    if(!this.playing||this.mode!=='perform'||this.disposed||launchRequest!==this.launchEpoch)return;
    const absolute=this.absoluteAt(this.time());this.advanceLanes(absolute);
    const quantum=this.state.launchQuantize;
    const at=quantum>0?Math.ceil((absolute-EPSILON)/quantum)*quantum:absolute;
    for(let track=0;track<8;track++)this.queueLane(track,this.state.launchSlots[track]?.[scene]?scene:-1,Math.max(absolute,at));
    this.tick();
  }

  stopTrack(track:number):void {
    if(!Number.isInteger(track)||track<0||track>=8)return;
    const now=this.time(),absolute=this.absoluteAt(now);
    for(const [key,voice] of this.voices)if(voice.owner.track===track) {this.engine.releaseVoice(voice.token,now);this.voices.delete(key);}
    const finished:{pattern:number;note:PatternNote}[]=[];
    for(const [token,input] of this.inputs)if(input.track===track) {
      this.engine.releaseVoice(token,now);
      if(input.capture)finished.push(this.finishCapture(input.capture,absolute));
      this.inputs.delete(token);
    }
    this.lanes[track]={scene:-1,start:absolute,pending:null};
    this.scheduledUntil=absolute;
    for(const result of finished)this.onRecordedNote?.(result.pattern,result.note);
    // Song/pattern tracks resume only at later note/clip events; Perform lanes
    // remain stopped until an explicit clip or scene launch.
  }

  snapshot():StudioSnapshot {
    const absolute=this.absoluteAt(this.time());
    if(this.playing)this.advanceLanes(absolute);
    this.pruneInputs(this.time());
    return {playing:this.playing,recordingNotes:this.recording,mode:this.mode,beat:this.playing?timelineBeat(this.state,this.mode,absolute):this.stoppedBeat,activeScene:this.lanes.map(l=>l.scene),pendingScene:this.lanes.map(l=>l.pending?.scene??-1)};
  }

  dispose():void {
    if(this.disposed)return;
    this.stop();this.disposed=true;this.onRecordedNote=null;
    this.clockWorker?.terminate();this.clockWorker=null;
  }

  private async ensurePerformance():Promise<void> {
    if(this.playing&&this.mode==='perform')return;
    if(!this.performanceStart) {
      const pending=this.play('perform');this.performanceStart=pending;
      void pending.finally(()=>{if(this.performanceStart===pending)this.performanceStart=null;}).catch(()=>undefined);
    }
    await this.performanceStart;
  }
  private time():number {return this.engine.context?.currentTime??0;}
  private absoluteAt(time:number):number {
    if(!this.playing)return this.stoppedBeat;
    return this.anchorBeat+Math.max(0,time-this.anchorTime)*this.state.tempo/60;
  }
  private audioTime(beat:number):number {return this.anchorTime+(beat-this.anchorBeat)*60/this.state.tempo;}
  private clearLanes():void {this.lanes=Array.from({length:8},()=>({scene:-1,start:0,pending:null}));}

  private queueLane(track:number,scene:number,beat:number):void {
    const now=this.time(),absolute=this.absoluteAt(now);
    for(const [key,voice] of this.voices)if(voice.owner.track===track && voice.start>=absolute-EPSILON) {this.engine.releaseVoice(voice.token,now);this.voices.delete(key);}
    this.lanes[track].pending={scene,beat};this.scheduledUntil=absolute;
  }
  private advanceLanes(absolute:number):void {
    for(const lane of this.lanes)if(lane.pending&&lane.pending.beat<=absolute+EPSILON) {
      lane.scene=lane.pending.scene;lane.start=lane.pending.beat;lane.pending=null;
    }
  }
  private lanePlans(from:number,to:number):LanePlan[] {
    const result:LanePlan[]=[];
    for(let track=0;track<8;track++) {
      const lane=this.lanes[track],until=lane.pending?.beat??Infinity;
      if(lane.scene>=0&&from<until-EPSILON)result.push({track,scene:lane.scene,start:lane.start,until});
      if(lane.pending&&lane.pending.scene>=0&&lane.pending.beat<to-EPSILON)result.push({track,scene:lane.pending.scene,start:lane.pending.beat,until:Infinity});
    }
    return result;
  }

  private tick=():void=>{
    if(!this.playing||this.disposed||!this.engine.context)return;
    const now=this.time(),absolute=this.absoluteAt(now),until=this.absoluteAt(now+LOOKAHEAD);
    this.advanceLanes(absolute);
    for(const [key,voice] of this.voices)if(voice.end<absolute-EPSILON)this.voices.delete(key);
    // Do not replay a burst of old notes after tab suspension. Audio assets can
    // resume at their correct musical offset when the next window is planned.
    const from=Math.max(absolute,this.scheduledUntil);
    if(until>from+EPSILON) {
      const events=this.mode==='pattern'?planPattern(this.state,from,until):this.mode==='song'?planSong(this.state,from,until):planPerformance(this.state,from,until,this.lanePlans(from,until));
      events.sort((a,b)=>a.absoluteBeat-b.absoluteBeat);
      for(const event of events)if(!this.voices.has(event.key))this.schedule(event,now);
      this.scheduledUntil=until;
    }
    for(const voice of this.voices.values()) {
      let end=voice.end;
      if(voice.owner.kind==='lane') {
        const lane=this.lanes[voice.owner.track];
        const queued=lane.pending&&voice.owner.laneStart===lane.pending.beat&&voice.owner.scene===lane.pending.scene;
        if(!queued) {
          if(lane.pending)end=Math.min(end,lane.pending.beat);
          else if(lane.scene<0||voice.owner.laneStart!==lane.start||voice.owner.scene!==lane.scene)end=Math.min(end,absolute);
        }
      }
      const at=Math.max(now,this.audioTime(end));
      if(at<=now+LOOKAHEAD+EPSILON && (voice.releaseTime===null||Math.abs(voice.releaseTime-at)>.001)) {
        this.engine.releaseVoice(voice.token,at);voice.releaseTime=at;
      }
    }
    this.pruneInputs(now);
  };

  private schedule(event:PlannedEvent,now:number):void {
    const at=Math.max(now,this.audioTime(event.absoluteBeat));
    let token:string;
    if(event.kind==='note')token=this.engine.triggerCue(event.pad,{time:at,velocity:event.velocity,pitch:event.pitch,track:event.track,gain:event.gain});
    else token=this.engine.playAsset(event.assetId,{time:at,offset:event.offset,duration:Math.max(.001,(event.endBeat-event.absoluteBeat)*60/this.state.tempo),rate:event.rate,track:event.track,gain:event.gain,loop:event.loop});
    this.voices.set(event.key,{key:event.key,token,start:event.absoluteBeat,end:event.endBeat,owner:event.owner,kind:event.kind,releaseTime:null});
  }
  private cancelSequenced(now:number):void {for(const voice of this.voices.values())this.engine.releaseVoice(voice.token,now);this.voices.clear();}
  private finishCapture(capture:CapturedNote,absolute:number):{pattern:number;note:PatternNote} {
    const quantum=capture.quantum;
    const phase=wrap(quantize(capture.phase,quantum),capture.length);
    const raw=Math.max(1/960,absolute-capture.onset);
    const duration=Math.min(capture.length,Math.max(quantum>0?quantum:1/960,quantize(raw,quantum)));
    return {pattern:capture.pattern,note:{id:uid(),pad:capture.pad,beat:phase,duration,velocity:capture.velocity,pitch:capture.pitch}};
  }
  private finishCaptures(absolute:number):void {
    const finished:{pattern:number;note:PatternNote}[]=[];
    for(const input of this.inputs.values())if(input.capture) {finished.push(this.finishCapture(input.capture,absolute));input.capture=null;}
    for(const result of finished)this.onRecordedNote?.(result.pattern,result.note);
  }
  private pruneInputs(now:number):void {
    for(const [key,input] of this.inputs)if(input.released&&input.expires<now)this.inputs.delete(key);
    if(this.inputs.size>256)for(const [key,input] of this.inputs) {
      if(!input.released)continue;this.engine.releaseVoice(key,now);this.inputs.delete(key);if(this.inputs.size<=128)break;
    }
  }
  private startClock():void {
    if(this.clockWorker){this.clockWorker.postMessage('start');return;}
    if(this.timer!==undefined)return;
    if(typeof Worker!=='undefined'&&!this.workerFailed) {
      try {
        this.clockWorker=new Worker(new URL('./clock.worker.ts',import.meta.url),{type:'module'});
        this.clockWorker.onmessage=this.tick;
        this.clockWorker.onerror=()=>{this.workerFailed=true;this.clockWorker?.terminate();this.clockWorker=null;if(this.playing)this.startClock();};
        this.clockWorker.postMessage('start');return;
      } catch {this.workerFailed=true;}
    }
    this.timer=setInterval(this.tick,25);
  }
  private stopClock():void {this.clockWorker?.postMessage('stop');if(this.timer!==undefined)clearInterval(this.timer);this.timer=undefined;}
}
