import type {AssetInfo, Clip, Pattern, PatternNote, PlayMode, SessionState} from '../model';

export const EPSILON = 1e-7;
const MAX_EVENTS = 4096;
export interface TimelineSlice {absoluteStart:number;absoluteEnd:number;timelineStart:number;timelineEnd:number;origin:number}
export interface EventOwner {kind:'pattern'|'clip'|'lane';track:number;patternId?:string;noteId?:string;clipId?:string;scene?:number;laneStart?:number;assetId?:string;fingerprint:string}
export interface PlannedNote {kind:'note';key:string;absoluteBeat:number;endBeat:number;pad:number;velocity:number;pitch:number;track:number;gain:number;owner:EventOwner}
export interface PlannedAudio {kind:'audio';key:string;absoluteBeat:number;endBeat:number;assetId:string;offset:number;rate:number;gain:number;loop:boolean;track:number;owner:EventOwner}
export type PlannedEvent = PlannedNote|PlannedAudio;
export interface LanePlan {track:number;scene:number;start:number;until:number}

export const wrap = (value:number,length:number) => length > 0 ? ((value % length) + length) % length : 0;
export function timelineBeat(state:SessionState,mode:PlayMode,absolute:number):number {
  const beat=Math.max(0,absolute);
  if(mode==='pattern') return wrap(beat,Math.max(.25,state.patterns[state.selectedPattern]?.length??16));
  if(mode==='song' && state.loop && state.loopEnd>state.loopStart && beat>=state.loopEnd)
    return state.loopStart+wrap(beat-state.loopStart,state.loopEnd-state.loopStart);
  return beat;
}

// A scheduler window may cross a pattern or arrangement-loop boundary. Split it
// into monotonic slices so neither the boundary note nor an offset clip is lost.
export function timelineSlices(state:SessionState,mode:PlayMode,from:number,to:number):TimelineSlice[] {
  const result:TimelineSlice[]=[];
  let position=Math.max(0,from);
  for(let guard=0;position<to-EPSILON && guard<MAX_EVENTS;guard++) {
    const phase=timelineBeat(state,mode,position);
    let length=to-position;
    if(mode==='pattern') length=Math.min(length,Math.max(.25,state.patterns[state.selectedPattern]?.length??16)-phase);
    else if(mode==='song' && state.loop && state.loopEnd>state.loopStart) length=Math.min(length,state.loopEnd-phase);
    if(length<EPSILON) length=Math.min(to-position,EPSILON*2);
    result.push({absoluteStart:position,absoluteEnd:position+length,timelineStart:phase,timelineEnd:phase+length,origin:position-phase});
    position+=length;
  }
  return result;
}

function noteFingerprint(note:PatternNote,pattern:Pattern,track:number,clip?:Clip):string {
  return JSON.stringify([note,pattern.length,track,clip??null]);
}
function audioFingerprint(asset:AssetInfo,clip?:Clip):string {return JSON.stringify([asset,clip??null]);}
function patternNotes(pattern:Pattern,track:number,from:number,to:number,origin:number,offset:number,end:number,loop:boolean,gain:number,keyPrefix:string,ownerBase:Omit<EventOwner,'fingerprint'|'noteId'>,clip?:Clip):PlannedNote[] {
  const events:PlannedNote[]=[];
  const length=pattern.length;
  if(!(length>0))return events;
  const firstCycle=loop?Math.floor((from-origin+offset)/length)-1:0;
  const lastCycle=loop?Math.floor((to-origin+offset)/length)+1:0;
  for(let cycle=firstCycle;cycle<=lastCycle && events.length<MAX_EVENTS;cycle++) {
    for(const note of pattern.notes) {
      const onset=origin+cycle*length+note.beat-offset;
      if(onset<origin-EPSILON || onset<from-EPSILON || onset>=to-EPSILON || onset>=end-EPSILON)continue;
      const gate=Math.min(end,onset+Math.max(1/960,note.duration));
      events.push({kind:'note',key:`${keyPrefix}:${cycle}:${note.id}`,absoluteBeat:onset,endBeat:gate,pad:note.pad,velocity:note.velocity,pitch:note.pitch,track,gain,owner:{...ownerBase,noteId:note.id,fingerprint:noteFingerprint(note,pattern,track,clip)}});
      if(events.length>=MAX_EVENTS)break;
    }
  }
  return events;
}

export function planPattern(state:SessionState,from:number,to:number):PlannedEvent[] {
  const pattern=state.patterns[state.selectedPattern];
  if(!pattern)return [];
  const track=state.selectedTrack;
  return patternNotes(pattern,track,from,to,0,0,Infinity,true,1,`pattern:${pattern.id}:${track}`,{kind:'pattern',track,patternId:pattern.id});
}

export function planSong(state:SessionState,from:number,to:number):PlannedEvent[] {
  const events:PlannedEvent[]=[];
  for(const slice of timelineSlices(state,'song',from,to)) {
    for(const clip of state.clips) {
      if(clip.beat>=slice.timelineEnd-EPSILON || clip.beat+clip.length<=slice.timelineStart+EPSILON)continue;
      const origin=slice.origin+clip.beat;
      // For a host loop, each clip is confined to that iteration. A non-looping
      // song's scheduler slice is just a lookahead window, not a clip boundary.
      const clipEnd=state.loop && state.loopEnd>state.loopStart?Math.min(origin+clip.length,slice.origin+state.loopEnd):origin+clip.length;
      if(clip.kind==='pattern') {
        const pattern=state.patterns.find(p=>p.id===clip.contentId);
        if(!pattern)continue;
        events.push(...patternNotes(pattern,clip.track,slice.absoluteStart,slice.absoluteEnd,origin,clip.offset,clipEnd,clip.loop,clip.gain,`clip:${clip.id}:${slice.origin.toFixed(6)}`,{kind:'clip',track:clip.track,clipId:clip.id,patternId:pattern.id},clip));
      } else {
        const asset=state.assets.find(a=>a.assetId===clip.contentId);
        if(!asset || !(asset.sourceBpm>0))continue;
        const onset=Math.max(origin,slice.absoluteStart);
        let finish=clipEnd;
        const offsetBeats=clip.offset+onset-origin;
        if(!clip.loop)finish=Math.min(finish,onset+Math.max(0,asset.lengthBeats-offsetBeats));
        if(finish<=onset+EPSILON)continue;
        const sourceBeat=clip.loop?wrap(offsetBeats,asset.lengthBeats):offsetBeats;
        events.push({kind:'audio',key:`audio:${clip.id}:${slice.origin.toFixed(6)}`,absoluteBeat:onset,endBeat:finish,assetId:asset.assetId,offset:sourceBeat*60/asset.sourceBpm,rate:state.tempo/asset.sourceBpm,gain:clip.gain,loop:clip.loop,track:clip.track,owner:{kind:'clip',track:clip.track,clipId:clip.id,assetId:asset.assetId,fingerprint:audioFingerprint(asset,clip)}});
      }
      if(events.length>=MAX_EVENTS)return events.slice(0,MAX_EVENTS);
    }
  }
  return events;
}

export function planPerformance(state:SessionState,from:number,to:number,lanes:LanePlan[]):PlannedEvent[] {
  const events:PlannedEvent[]=[];
  for(const lane of lanes) {
    const slot=state.launchSlots[lane.track]?.[lane.scene];
    const start=Math.max(from,lane.start),end=Math.min(to,lane.until);
    if(!slot || end<=start+EPSILON)continue;
    const prefix=`lane:${lane.track}:${lane.scene}:${lane.start.toFixed(6)}`;
    const ownerBase:Omit<EventOwner,'fingerprint'|'noteId'>={kind:'lane',track:lane.track,scene:lane.scene,laneStart:lane.start};
    if(slot.kind==='pattern') {
      const pattern=state.patterns.find(p=>p.id===slot.contentId);
      if(pattern)events.push(...patternNotes(pattern,lane.track,start,end,lane.start,0,lane.until,true,1,prefix,{...ownerBase,patternId:pattern.id}));
    } else {
      const asset=state.assets.find(a=>a.assetId===slot.contentId);
      if(!asset || !(asset.sourceBpm>0 && asset.lengthBeats>0))continue;
      const firstCycle=Math.max(0,Math.floor((start-lane.start)/asset.lengthBeats));
      const lastCycle=Math.floor((end-lane.start)/asset.lengthBeats);
      for(let cycle=firstCycle;cycle<=lastCycle;cycle++) {
        const origin=lane.start+cycle*asset.lengthBeats;
        const onset=Math.max(origin,start),finish=Math.min(origin+asset.lengthBeats,lane.until);
        if(onset>=end-EPSILON || finish<=onset+EPSILON)continue;
        events.push({kind:'audio',key:`${prefix}:audio:${cycle}`,absoluteBeat:onset,endBeat:finish,assetId:asset.assetId,offset:(onset-origin)*60/asset.sourceBpm,rate:state.tempo/asset.sourceBpm,gain:1,loop:true,track:lane.track,owner:{...ownerBase,assetId:asset.assetId,fingerprint:audioFingerprint(asset)}});
      }
    }
    if(events.length>=MAX_EVENTS)return events.slice(0,MAX_EVENTS);
  }
  return events;
}

// Existing playing notes survive unrelated overdubs. Their original ownership
// still lets delete, trim, source replacement and clip edits stop stale voices.
export function ownerIsCurrent(state:SessionState,mode:PlayMode,owner:EventOwner):boolean {
  let clip:Clip|undefined;
  if(owner.kind==='clip') {
    clip=state.clips.find(c=>c.id===owner.clipId);
    if(!clip)return false;
  } else if(owner.kind==='pattern') {
    if(mode!=='pattern' || state.patterns[state.selectedPattern]?.id!==owner.patternId || state.selectedTrack!==owner.track)return false;
  } else {
    const slot=state.launchSlots[owner.track]?.[owner.scene??-1];
    if(!slot || slot.contentId!==(owner.patternId??owner.assetId))return false;
  }
  if(owner.assetId) {
    const asset=state.assets.find(a=>a.assetId===owner.assetId);
    return !!asset && audioFingerprint(asset,clip)===owner.fingerprint;
  }
  const pattern=state.patterns.find(p=>p.id===owner.patternId);
  const note=pattern?.notes.find(n=>n.id===owner.noteId);
  return !!pattern && !!note && noteFingerprint(note,pattern,owner.track,clip)===owner.fingerprint;
}
