const base = 'https://elb-api.vizard.ai/hvizard-server-front/open-api/v1/project';

export function sourceFromLink(input) {
  const error = 'Paste a completed YouTube video or a Twitch /videos/ replay URL.';
  let url;
  try { url = new URL(input); } catch { throw new Error(error); }
  if (url.protocol !== 'https:' || url.port || url.username || url.password) throw new Error(error);
  const host = url.hostname.replace(/^www\./, '');
  let id;
  if (host === 'youtu.be') id = url.pathname.slice(1);
  if (['youtube.com', 'm.youtube.com'].includes(host)) {
    id = url.pathname === '/watch' ? url.searchParams.get('v') : url.pathname.match(/^\/(?:shorts|embed)\/([\w-]{11})\/?$/)?.[1];
  }
  if (id && /^[\w-]{11}$/.test(id)) return {key:'youtube:'+id, videoUrl:'https://www.youtube.com/watch?v='+id, videoType:2};
  const vod = host === 'twitch.tv' && url.pathname.match(/^\/videos\/(\d+)\/?$/);
  if (vod) return {key:'twitch:'+vod[1], videoUrl:'https://www.twitch.tv/videos/'+vod[1], videoType:9};
  throw new Error(error);
}

async function request(path, options, key, transport) {
  const response = await transport(base + path, {...options, cache:'no-store', signal:AbortSignal.timeout(25000),
    headers:{'Content-Type':'application/json', VIZARDAI_API_KEY:key}});
  if (!response.ok) throw new Error('Clipping provider returned HTTP ' + response.status);
  return response.json();
}

export async function submit(source, key, transport=fetch) {
  const data = await request('/create', {method:'POST', body:JSON.stringify({
    videoUrl:source.videoUrl, videoType:source.videoType, lang:'auto', preferLength:[2,3],
  })}, key, transport);
  if (data.code !== 2000 || !/^\d+$/.test(String(data.projectId))) throw new Error('Provider did not confirm this submission.');
  return String(data.projectId);
}

export async function results(id, key, transport=fetch) {
  if (!/^\d+$/.test(id)) throw new Error('Invalid project ID.');
  const data = await request('/query/'+id, {method:'GET'}, key, transport);
  if (data.code === 1000) return {state:'processing', moments:[]};
  if (data.code !== 2000) return {state:'failed', moments:[], message:'Provider could not process this source (code '+String(data.code)+').'};
  const moments = (data.videos || []).filter(v=>v.videoId && Number(v.videoMsDuration)>0 && /^https:\/\//.test(v.videoUrl)).map(v=>({
    id:String(v.videoId), title:String(v.title || 'Untitled moment'), seconds:v.videoMsDuration/1000,
    url:v.videoUrl, transcript:String(v.transcript || ''), reason:String(v.viralReason || '')
  }));
  return {state:'ready', moments};
}
