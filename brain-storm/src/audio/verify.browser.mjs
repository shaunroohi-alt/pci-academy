/** Explicit browser-audio regression suite. Run against a local Vite server:
 * node src/audio/verify.browser.mjs http://127.0.0.1:5173/brain-storm/
 * Chromium executes real AudioContexts, AudioWorklets, PCM capture and offline renders.
 */
import { chromium } from "@playwright/test";
const base = process.argv[2] ?? "http://127.0.0.1:5188/brain-storm/";
const fixture = new URL("src/audio/qa.html", base).href;
const html =
  "<!doctype html><button id=\"run\">Run audio verification</button><script type=\"module\">\nimport {BrowserAudioEngine} from './BrowserAudioEngine.ts';\nimport {createSession,blankCue} from '../model.ts';\nwindow.results=[];window.errors=[];window.finished=false;\nconst wait=ms=>new Promise(r=>setTimeout(r,ms));\nconst check=(name,value)=>{window.results.push({name,value});if(!value)throw new Error('Failed: '+name);};\nfunction frequency(buffer){const data=buffer.getChannelData(0);let crossings=0;const start=Math.floor(.25*buffer.sampleRate),end=Math.min(data.length,Math.floor(1.5*buffer.sampleRate));for(let i=start+1;i<end;i++)if(data[i-1]<=0&&data[i]>0)crossings++;return crossings/((end-start)/buffer.sampleRate);}\nfunction energy(buffer){const data=buffer.getChannelData(0);let e=0;for(const x of data)e+=x*x;return Math.sqrt(e/data.length);}\ndocument.querySelector('#run').onclick=async()=>{const e=new BrowserAudioEngine();e.onError=error=>window.errors.push(error.message);try{\n await e.initialize();check('real AudioContext running',e.context.state==='running');\n const state=createSession();state.source=await e.loadDemo();state.mono=false;state.cues[0]={...blankCue(0),empty:false,start:0,end:.5,releaseMs:10};e.setSession(state);\n await e.startRecording();const token=e.triggerCue(0);await wait(170);check('live cue produces actual meter energy',e.snapshot().masterPeak>.005);e.releaseVoice(token);await wait(60);check('note release removes active pad',!e.snapshot().activePads.includes(0));\n const future=e.triggerCue(0,{time:e.context.currentTime+.3});e.releaseVoice(future);await wait(400);check('Stop before scheduled start cannot leak a voice',!e.snapshot().activePads.includes(0));\n const recording=await e.stopRecording(),decoded=await e.context.decodeAudioData(await recording.arrayBuffer());check('real stereo WAV recording contains cue PCM',recording.type==='audio/wav'&&decoded.numberOfChannels===2&&decoded.duration>.5&&energy(decoded)>.01);\n const exported=await e.exportCue(0),cue=await e.context.decodeAudioData(await exported.arrayBuffer());check('processed 24-bit cue export has expected duration',Math.abs(cue.duration-.5)<.01&&energy(cue)>.01);\n state.patterns[0].length=4;state.patterns[0].notes=[{id:'n',pad:0,beat:0,duration:.25,velocity:.8,pitch:0}];e.setSession(state);const bounce=await e.renderPattern(0,0);check('pattern bounce is actual PCM at exact loop length',Math.abs(bounce.duration-2)<.001&&energy(bounce)>.002);\n const tone=e.context.createBuffer(2,44100,44100);for(let c=0;c<2;c++)for(let i=0;i<44100;i++)tone.getChannelData(c)[i]=.2*Math.sin(2*Math.PI*440*i/44100);\n const info={assetId:'tone',name:'tone',duration:1,sampleRate:44100,channels:2,bpm:120,key:'A'};e.installBuffer(info,tone);state.source=info;state.cues[0]={...blankCue(0),empty:false,start:0,end:1,releaseMs:10,speed:.5};state.globalPitch=12;state.pitchTime=true;e.setSession(state);\n const stretched=await e.context.decodeAudioData(await(await e.exportCue(0)).arrayBuffer());console.log('stretched frequency',frequency(stretched),'energy',energy(stretched));check('independent pitch/time doubles duration and raises pitch one octave',Math.abs(stretched.duration-2)<.01&&Math.abs(frequency(stretched)-880)<30&&energy(stretched)>.01);\n state.pitchTime=false;e.setSession(state);const rate=await e.context.decodeAudioData(await(await e.exportCue(0)).arrayBuffer());check('varispeed bypass couples pitch and rate',Math.abs(rate.duration-1)<.01&&Math.abs(frequency(rate)-440)<5);\n state.pitchTime=true;state.globalPitch=0;state.cues[0].speed=1;e.setSession(state);\n const stems=[110,220,330,440].map(hz=>{const b=e.context.createBuffer(2,44100,44100);for(let c=0;c<2;c++)for(let i=0;i<44100;i++)b.getChannelData(c)[i]=.1*Math.sin(2*Math.PI*hz*i/44100);return b;});e.setStems(stems);state.stemMute=[true,true,true,false];e.setSession({...state});const isolated=await e.context.decodeAudioData(await(await e.exportCue(0)).arrayBuffer());check('stem masks mix actual isolated PCM',Math.abs(frequency(isolated)-440)<5);\n const restored=e.context.createBuffer(2,88200,44100);for(let c=0;c<2;c++)for(let i=0;i<88200;i++)restored.getChannelData(c)[i]=.2*Math.sin(2*Math.PI*440*i/44100);const restoredInfo={...info,assetId:'restored-tone',duration:2};e.installBuffer(restoredInfo,restored);const restoredStems=[110,220,330,660].map(hz=>{const b=e.context.createBuffer(2,88200,44100);for(let c=0;c<2;c++)for(let i=0;i<88200;i++)b.getChannelData(c)[i]=.1*Math.sin(2*Math.PI*hz*i/44100);return b;});e.setStems(restoredStems,restoredInfo.assetId);state.source=restoredInfo;e.setSession({...state});const restoredCue=await e.context.decodeAudioData(await(await e.exportCue(0)).arrayBuffer());check('restored stems bind to their staged source before session installation',e.getStems()[3]===restoredStems[3]&&Math.abs(frequency(restoredCue)-660)<5);\n const preparing=e.triggerCue(0);await wait(30);const candidate=await e.loadSource(new File([exported],'candidate.wav',{type:'audio/wav'}));check('uncommitted source preparation preserves current PCM, stems and playback',!!e.getBuffer(candidate.assetId)&&e.getBuffer(restoredInfo.assetId)===restored&&e.getStems()[3]===restoredStems[3]&&e.snapshot().activePads.includes(0));let rejected=false;try{await e.loadSource(new File(['invalid audio'],'broken.wav'));}catch{rejected=true;}check('failed source decode preserves the previous session audio',rejected&&e.getBuffer(restoredInfo.assetId)===restored&&e.getStems()[3]===restoredStems[3]);e.releaseVoice(preparing);\n e.stopVoices();state.stemMute=[false,false,false,false];e.setSession({...state});\n const futureAt=e.context.currentTime+.15,retimed=e.triggerCue(0,{time:futureAt});e.releaseVoice(retimed,futureAt+.1);e.releaseVoice(retimed,futureAt+.4);await wait(400);check('a scheduled gate can be moved later before note-off',e.snapshot().activePads.includes(0));await wait(230);check('retimed scheduled gate still releases the original voice',!e.snapshot().activePads.includes(0));\n e.stopVoices();await e.startRecording();const batchStart=e.context.currentTime+.1;for(let i=0;i<40;i++)e.triggerCue(0,{time:batchStart+i*.08,duration:.025});await wait(3400);const polyCapture=await e.context.decodeAudioData(await(await e.stopRecording()).arrayBuffer());const data=polyCapture.getChannelData(0);let heard=0;for(let i=0;i<40;i++){let sum=0;const from=Math.floor((.1+i*.08+.003)*polyCapture.sampleRate),to=Math.floor((.1+i*.08+.02)*polyCapture.sampleRate);for(let j=from;j<to;j++)sum+=data[j]*data[j];if(sum/(to-from)>.00001)heard++;}console.log('scheduled notes heard',heard);check('future lookahead tokens do not steal nonoverlapping voices',heard===40);\n e.setStems([null,null,null,null]);state.globalPitch=0;state.pitchTime=true;e.setSession({...state});await e.startRecording();e.triggerCue(0);await wait(140);state.globalPitch=12;e.setSession({...state});await wait(600);const changed=await e.context.decodeAudioData(await(await e.stopRecording()).arrayBuffer());const cut=e.context.createBuffer(1,Math.floor(changed.sampleRate*.25),changed.sampleRate);cut.copyToChannel(changed.getChannelData(0).slice(Math.floor(changed.sampleRate*.4),Math.floor(changed.sampleRate*.65)),0);const cutData=cut.getChannelData(0);let crossed=0;for(let i=1;i<cutData.length;i++)if(cutData[i-1]<=0&&cutData[i]>0)crossed++;console.log('live pitch frequency',crossed/cut.duration);check('live global pitch edit changes actual active voice PCM',Math.abs(crossed/cut.duration-880)<30);\n check('no hidden audio engine errors',window.errors.length===0);\n }catch(error){window.failure=String(error);console.error(error);}finally{e.dispose();window.finished=true;}};\n</script>\n";
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? "/usr/bin/chromium",
  headless: true,
  args: ["--no-sandbox", "--autoplay-policy=no-user-gesture-required"],
});
try {
  const page = await browser.newPage();
  page.on("console", (message) => {
    if (message.type() === "log") console.log(message.text());
  });
  page.on("pageerror", (error) =>
    console.error("Browser error:", error.message),
  );
  await page.route(fixture, (route) =>
    route.fulfill({ contentType: "text/html", body: html }),
  );
  await page.route("**/favicon.ico", (route) =>
    route.fulfill({ status: 204, body: "" }),
  );
  await page.goto(fixture);
  await page.click("#run");
  await page.waitForFunction(() => window.finished, undefined, {
    timeout: 120000,
  });
  const result = await page.evaluate(() => ({
    checks: window.results,
    errors: window.errors,
    error: window.failure ?? "",
  }));
  console.log(JSON.stringify(result, null, 2));
  if (
    result.error ||
    result.errors.length ||
    result.checks.some((c) => c.value !== true)
  )
    process.exitCode = 1;
} finally {
  await browser.close();
}
