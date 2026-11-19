'use client';

import {useEffect,useState} from 'react';
import {browserDB} from '@/lib/supabase';
import {projects,saveProject,type LocalProject} from '@/lib/local-store';

type Row={id:string;source_url:string};
type Moment={id:string;title:string;seconds:number;url:string;reason:string;transcript:string};
type Details={state:string;message?:string;moments:Moment[]};

async function api(path:string,options:RequestInit={}) {
  const session=await browserDB()?.auth.getSession();
  const token=session?.data.session?.access_token;
  if (!token) throw new Error('Sign in to your CreatorOS account to import clips.');
  const response=await fetch('/api/link-import'+path,{...options,cache:'no-store',headers:{
    Authorization:'Bearer '+token,'Content-Type':'application/json'
  }});
  const body=await response.json();
  if (!response.ok) throw new Error(body.error || 'Could not load import.');
  return body;
}
function message(e:unknown) { return e instanceof Error ? e.message : 'Import unavailable.'; }

export default function FromLink() {
  const [rows,setRows]=useState<Row[]>([]),[source,setSource]=useState(''),[id,setId]=useState('');
  const [details,setDetails]=useState<Details|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const [selected,select]=useState<string[]>([]),[saved,setSaved]=useState<{id:string;title:string}[]>([]);
  const [refresh,reload]=useState(0);
  const enabled=process.env.NEXT_PUBLIC_LINK_IMPORT==='on';
  useEffect(()=>{
    if (!enabled) return;
    let active=true;
    api('').then((items:Row[])=>{if(active){setRows(items);setId(old=>old||items[0]?.id||'');}}).catch(e=>active&&setError(message(e)));
    return ()=>{active=false;};
  },[enabled]);
  useEffect(()=>{
    if(!id || !enabled) return;
    let active=true,timer:ReturnType<typeof setTimeout>;
    setDetails(null);select([]);setSaved([]);
    async function check(){
      try {
        const data:Details=await api('?id='+encodeURIComponent(id));
        if(!active)return;
        setDetails(data);setError('');
        if(['submitting','processing'].includes(data.state))timer=setTimeout(check,30000);
      } catch(e){if(active)setError(message(e));}
    }
    void check();return ()=>{active=false;clearTimeout(timer);};
  },[id,refresh,enabled]);

  async function start(){
    setBusy(true);setError('');
    try {
      const job:Row=await api('',{method:'POST',body:JSON.stringify({url:source})});
      setRows(old=>[job,...old.filter(x=>x.id!==job.id)]);setId(job.id);reload(n=>n+1);
    } catch(e){setError(message(e));} finally {setBusy(false);}
  }
  async function save(){
    setBusy(true);setError('');
    try {
      const existing=new Set((await projects()).map(p=>p.id));
      let brand:Record<string,string>={};
      try {brand=JSON.parse(localStorage.getItem('creatoros-brand')||'{}')||{};}catch{}
      const session=await browserDB()?.auth.getSession();
      const owner=session?.data.session?.user.id;
      if(!owner)throw new Error('Sign in to save your drafts.');
      for(const m of details?.moments.filter(x=>selected.includes(x.id))||[]){
        const pid=['link',owner,id,m.id].join('-');
        if(!existing.has(pid)){
          const response=await fetch(m.url,{credentials:'omit'});
          if(!response.ok || !response.body)throw new Error('Clip download failed. Refresh the import for a current download link.');
          const media=await response.blob();
          if(!media.size || media.size>200*1024*1024 || /text|json/i.test(media.type))throw new Error('The download is not a supported clip within the Studio size limit.');
          const project:LocalProject={id:pid,name:m.title,fileName:m.id+'.mp4',createdAt:new Date().toISOString(),
            duration:m.seconds,file:media,segments:[],sourceVideoId:rows.find(r=>r.id===id)?.source_url,brand,
            clips:[{id:pid,start:0,end:m.seconds,title:m.title,caption:'',color:brand.color||'#bba0ff',style:brand.style||'bold',format:'9:16',status:'draft'}]};
          await saveProject(project);
        }
        setSaved(old=>old.some(x=>x.id===pid)?old:[...old,{id:pid,title:m.title}]);
      }
    } catch(e){setError(message(e));}finally{setBusy(false);}
  }
  if(!enabled)return <main><h1>Link imports are disabled</h1></main>;
  return <main className="workspace-content"><h1>Create clips from a link</h1>
    <form onSubmit={e=>{e.preventDefault();void start();}}><label>Completed YouTube video or Twitch replay
      <input required type="url" value={source} onChange={e=>setSource(e.target.value)}/></label>
      <button className="button" disabled={busy}>Find moments</button></form>
    {error&&<p role="alert">{error}</p>}
    {rows.length>0&&<label>Saved imports<select disabled={busy} value={id} onChange={e=>setId(e.target.value)}>
      {rows.map(row=><option key={row.id} value={row.id}>{row.source_url}</option>)}</select></label>}
    {id&&<button disabled={busy} onClick={()=>reload(n=>n+1)}>Refresh status</button>}
    {details&&<p role="status">{details.state==='processing'?'Finding moments. You can close this tab.':
      details.state==='review'?'Submission needs review before another attempt.':details.message||
      (details.state==='ready'?details.moments.length+' moments ready':details.state)}</p>}
    {details?.moments.map(m=><article key={m.id}><h2>{m.title}</h2>
      <video controls preload="none" src={m.url} style={{maxWidth:'100%',maxHeight:320}}/>
      <p>{Math.round(m.seconds)} seconds · {m.reason}</p><details><summary>Transcript</summary>{m.transcript}</details>
      <label><input type="checkbox" disabled={busy} checked={selected.includes(m.id)} onChange={e=>select(e.target.checked?[...selected,m.id]:selected.filter(x=>x!==m.id))}/> Select moment</label></article>)}
    {Boolean(details?.moments.length)&&<><p>You can trim within each downloaded excerpt.</p>
      <button className="button" disabled={busy||!selected.length} onClick={()=>void save()}>Save selected as Studio drafts</button></>}
    {saved.map(item=><p key={item.id}><a href={'/studio?project='+encodeURIComponent(item.id)}>Open {item.title} in Studio</a></p>)}
  </main>;
}
