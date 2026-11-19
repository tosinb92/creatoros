import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceFromLink,submit,results} from '../lib/vizard.mjs';
const video='https://youtu.be/A_bc-def012';
const reply=data=>async()=>Response.json(data);
test('canonical YouTube and Twitch sources',()=>{
 const s=sourceFromLink(video);
 assert.equal(s.key,'youtube:A_bc-def012');
 assert.deepEqual(sourceFromLink(s.videoUrl+'&t=7'),s);
 assert.equal(sourceFromLink('https://www.twitch.tv/videos/123').videoType,9);
});
test('rejects spoofed hosts, credentials, channels, active live links and malformed IDs',()=>{
 for(const url of [video+'/', 'https://nottwitch.tv/videos/123','https://twitch.tv/channel/123','https://u@twitch.tv/videos/123','https://youtube.com/live/A_bc-def012','https://kick.com/videos/123'])assert.throws(()=>sourceFromLink(url));
});
test('submission uses documented auth, payload and response',async()=>{
 assert.equal(await submit(sourceFromLink(video),'fake',async(url,options)=>{
 assert.equal(options.headers.VIZARDAI_API_KEY,'fake');assert.match(url,/open-api\/v1\/project\/create$/);
 assert.equal(JSON.parse(options.body).videoType,2);return Response.json({code:2000,projectId:725});
 }),'725');
});
test('ambiguous submission fails without automatic repost',async()=>{
 let calls=0;
 await assert.rejects(submit(sourceFromLink(video),'fake',async()=>{calls++;return Response.json({code:2000});}));assert.equal(calls,1);
});
test('documents processing, ready, empty and failure states',async()=>{
 assert.equal((await results('123','fake',reply({code:1000}))).state,'processing');
 const data=await results('123','fake',reply({code:2000,videos:[{videoId:7,videoUrl:'https://cdn.vizard.ai/file.mp4',videoMsDuration:63100,transcript:'words',viralReason:'Complete thought'}]}));
 assert.equal(data.moments[0].seconds,63.1);assert.equal(data.moments[0].id,'7');
 assert.equal((await results('123','fake',reply({code:2000,videos:[]}))).moments.length,0);
 assert.equal((await results('123','fake',reply({code:4001}))).state,'failed');
});
test('invalid ID and provider transport failures surface',async()=>{
 await assert.rejects(results('../','fake'));await assert.rejects(results('123','fake',async()=>new Response(null,{status:429})),/429/);
});
