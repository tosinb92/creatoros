import {createClient} from '@supabase/supabase-js';
import {NextRequest, NextResponse} from 'next/server';
import {sourceFromLink, submit, results} from '@/lib/vizard.mjs';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;
const table = 'creatoros_link_imports';
const fields = 'id,source_url,provider_id,state,created_at';
const reply = (body:unknown,status=200) => NextResponse.json(body,{status,headers:{'Cache-Control':'private, no-store'}});

async function context(req:NextRequest) {
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL, secret=process.env.SUPABASE_SERVICE_ROLE_KEY, key=process.env.VIZARD_API_KEY;
  if (process.env.NEXT_PUBLIC_LINK_IMPORT !== 'on' || !url || !secret || !key)
    return reply({error:'URL import is awaiting workspace configuration.'},503);
  const token=req.headers.get('authorization')?.match(/^Bearer (.+)$/)?.[1];
  if (!token) return reply({error:'Sign in to CreatorOS to import videos.'},401);
  const db=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data,error}=await db.auth.getUser(token);
  if (error || !data.user) return reply({error:'Your session expired. Sign in again.'},401);
  const owner=data.user.id;
  if (!process.env.CREATOROS_IMPORT_PILOT_USERS?.split(',').map(s=>s.trim()).includes(owner))
    return reply({error:'Link import has not been enabled for this account.'},403);
  return {owner,db,key};
}

export async function POST(req:NextRequest) {
  const ctx=await context(req);
  if (ctx instanceof NextResponse) return ctx;
  let source;
  try { source=sourceFromLink((await req.json()).url); }
  catch { return reply({error:'Use a completed YouTube video or Twitch replay link.'},400); }
  const {db,key,owner}=ctx;
  const row=await db.from(table).insert({owner_id:owner, source_key:source.key,source_url:source.videoUrl}).select(fields).single();
  if (row.error?.code==='23505') {
    const existing=await db.from(table).select(fields).eq('owner_id',owner).eq('source_key',source.key).single();
    return existing.error ? reply({error:'Could not restore the existing import.'},503) : reply(existing.data);
  }
  if (row.error) return reply({error:'Could not save the import. Check the link-import migration.'},503);
  try {
    const id=await submit(source,key);
    const saved=await db.from(table).update({provider_id:id,state:'processing'}).eq('id',row.data.id);
    if (saved.error) throw new Error('Could not persist provider ID.');
    return reply({...row.data,provider_id:id,state:'processing'},202);
  } catch {
    await db.from(table).update({state:'review'}).eq('id',row.data.id);
    return reply({error:'Submission needs review. Check the provider dashboard before retrying to avoid duplicate charges.'},502);
  }
}

export async function GET(req:NextRequest) {
  const ctx=await context(req);
  if (ctx instanceof NextResponse) return ctx;
  const {db,key,owner}=ctx, id=req.nextUrl.searchParams.get('id');
  const query=db.from(table).select(fields).eq('owner_id',owner);
  if (!id) {
    const rows=await query.order('created_at',{ascending:false}).limit(100);
    return rows.error ? reply({error:'Import history unavailable.'},503) : reply(rows.data);
  }
  const row=await query.eq('id',id).maybeSingle();
  if (row.error || !row.data) return reply({error:'Import unavailable.'},404);
  if (!row.data.provider_id) {
    const stale=Date.now()-Date.parse(row.data.created_at)>120000;
    return reply({state:stale?'review':row.data.state,moments:[]});
  }
  try { return reply(await results(row.data.provider_id,key)); }
  catch { return reply({error:'Could not check the provider. Refresh this import to retry.'},502); }
}
