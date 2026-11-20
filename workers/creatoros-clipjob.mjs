/** CreatorOS native clip-job orchestration, shadow-only until wired to real adapters.
 * Every dependency is injected so no job can silently use a mock renderer in production.
 * Adapters: fetchVideo, transcribe, selectMoments, renderClip, storeClip,
 * getUpstreamTranscript, report, finalize, notify (optional).
 */
export class ClipJobError extends Error {
  constructor(stage,message){super(message);this.name='ClipJobError';this.stage=stage;}
}

const elapsed = start => Math.max(0,(Date.now()-start)/1000);
const validRange = clip => Number.isFinite(clip.start)&&Number.isFinite(clip.end)&&clip.start>=0&&clip.end>clip.start&&clip.end-clip.start<=180;

export async function runClipJob(job, adapters) {
  if (!job?.importId || !job?.ownerId || !job?.sourceUrl || !job?.revision) throw new ClipJobError('preflight','Job identity, source and revision are required');
  const {fetchVideo,transcribe,selectMoments,renderClip,storeClip,getUpstreamTranscript,report,finalize,notify}=adapters || {};
  if (![fetchVideo,selectMoments,report,finalize].every(fn=>typeof fn==='function')) throw new ClipJobError('preflight','Required processing adapters unavailable');
  if (job.stages?.transcribe !== false && typeof transcribe!=='function') throw new ClipJobError('preflight','Transcription adapter unavailable');
  if (job.stages?.transcribe === false && typeof getUpstreamTranscript!=='function') throw new ClipJobError('preflight','Upstream transcript adapter unavailable');
  if (job.stages?.render !== false && (typeof renderClip!=='function'||typeof storeClip!=='function')) throw new ClipJobError('preflight','Render/storage adapter unavailable');
  const base={importId:job.importId,ownerId:job.ownerId,engine:'clipengine',revision:job.revision};
  const seconds={fetch:0,transcribe:0,select:0,render:0};
  const clips=[];
  let stage='preflight',status='failed',error=null,source=null;
  const update=async (state,detail={})=>report({...base,state,...detail});
  try {
    await update('processing',{stage:'fetch',progress:0,etaSeconds:null});
    stage='fetch';let start=Date.now();
    source=await fetchVideo({job,onProgress:p=>update('processing',{stage:'fetch',progress:Math.min(25,Math.max(0,p/4))})});
    seconds.fetch=elapsed(start);
    stage='transcribe';await update('processing',{stage,progress:25});start=Date.now();
    const transcript=job.stages?.transcribe===false?await getUpstreamTranscript({job,source}):await transcribe({job,source});
    seconds.transcribe=elapsed(start);
    if (!Array.isArray(transcript?.cues)||!transcript.cues.length) throw new ClipJobError(stage,'Timestamped cues are required');
    stage='select';await update('processing',{stage,progress:60});start=Date.now();
    const selections=(await selectMoments({job,cues:transcript.cues})).slice(0,12);
    seconds.select=elapsed(start);
    if (!selections.length) throw new ClipJobError(stage,'No valid moments selected');
    await update('processing',{stage:'render',progress:65,selected:selections.map(c=>({start:c.start,end:c.end,score:c.score??null}))});
    stage='render';
    for (const [index,clip] of selections.entries()) {
      const item={index,start:clip.start,end:clip.end,score:clip.score??null,state:'failed'};
      let started=Date.now();
      try {
        if (!validRange(clip)) throw new ClipJobError(stage,'Invalid clip range');
        if (job.stages?.render===false) {
          item.state='manifest_only';
        } else {
          const rendered=await renderClip({job,source,clip,words:transcript.words||[],watermark:job.tier!=='PRO'});
          const stored=await storeClip({job,clip,index,rendered});
          if (!stored?.url) throw new ClipJobError(stage,'Durable clip URL missing');
          item.state='ready';item.url=stored.url;
        }
      } catch(e){item.error=e instanceof Error?e.message:'Clip render failed';}
      finally {seconds.render+=elapsed(started);clips.push(item);await update('processing',{stage:'render',progress:65+Math.round(30*clips.length/selections.length),clip:item});}
    }
    const ready=clips.filter(c=>c.state==='ready').length;
    status=job.stages?.render===false?'manifest_only':ready===clips.length?'completed':ready?'partial':'failed';
    if (status==='failed') error='No clips could be rendered';
  } catch(e) {error=e instanceof Error?e.message:'Processing failed';}
  finally {
    const summary={...base,state:status,error,clips,seconds,computeSeconds:Object.values(seconds).reduce((a,b)=>a+b,0)};
    await finalize(summary); // Must persist actual compute cost, even on failures.
    if (typeof notify==='function') await notify(summary);
  }
  return {state:status,clips,error,seconds};
}
