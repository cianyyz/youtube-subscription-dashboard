import test from 'node:test';
import assert from 'node:assert/strict';
import {defaults} from '../extension/core.js';
let handler;
const log=[],local={state:defaults()},session={};
const area=(data,name)=>({get:async key=>structuredClone({[key]:data[key]}),set:async patch=>{log.push(`${name}.set`);Object.assign(data,structuredClone(patch));}});
const origin='chrome-extension://test-extension/';
globalThis.chrome={storage:{local:area(local,'local'),session:area(session,'session')},runtime:{getURL:path=>origin+path,onMessage:{addListener:fn=>{handler=fn;}},onInstalled:{addListener(){}},onStartup:{addListener(){}}},tabs:{create:async options=>{log.push(['create',options.url]);return {id:42};},update:async(id,options)=>{log.push(['update',id,options.url]);return {id};},onRemoved:{addListener(){}}},alarms:{create:async()=>{},onAlarm:{addListener(){}}},action:{onClicked:{addListener(){}}}};
await import('../extension/background.js');
const send=(message,sender)=>new Promise(resolve=>handler(message,sender,resolve));
const source={url:'https://www.youtube.com/feed/subscriptions',tab:{id:42}};
const dashboard={url:origin+'index.html',tab:{id:1}};
test('background protects canonicalized import tabs and saves before redirect',async()=>{
 const opened=await send({type:'OPEN_IMPORT'},dashboard);assert.equal(opened.ok,true);
 const createIndex=log.findIndex(v=>Array.isArray(v)&&v[0]==='create');const navigateIndex=log.findIndex(v=>Array.isArray(v)&&v[0]==='update');const registerIndex=log.indexOf('session.set');
 assert.equal(log[createIndex][1],'about:blank');assert(createIndex<registerIndex&&registerIndex<navigateIndex);
 const mode=await send({type:'GET_PAGE_MODE'},source);assert.equal(mode.data.importPending,true);
 const blocked=await send({type:'OPEN_DASHBOARD'},source);assert.equal(blocked.ok,false);assert.match(blocked.error,/Finish or cancel/);
 const result=await send({type:'IMPORT_SUBSCRIPTIONS',capture:{channels:[{id:'/@alpha',name:'Alpha'}],videos:[{id:'abcdefghijk',channelId:'/@alpha',title:'Real card',ageLabel:'3 hours ago'}]}},source);
 assert.equal(result.ok,true);assert.equal(result.data.importedVideos,1);assert.equal(local.state.channels.length,1);assert.equal(local.state.videos.length,1);assert.equal(local.state.lastImport.videos,1);
 assert.equal((await send({type:'GET_PAGE_MODE'},source)).data.importPending,false);
 assert.equal((await send({type:'OPEN_DASHBOARD'},source)).ok,true);assert.deepEqual(log.at(-1),['update',42,'https://www.youtube.com/feed/subscriptions']);
});
test('empty or unreadable captures report failure instead of empty success',async()=>{
 const before=structuredClone(local.state);
 const result=await send({type:'IMPORT_SUBSCRIPTIONS',capture:{channels:[{id:'/@alpha',name:'Alpha'}],videos:[{id:'abcdefghijk',channelId:'/@alpha',title:'Still loading',ageLabel:''}]}},source);
 assert.equal(result.ok,false);assert.match(result.error,/upload dates/);assert.deepEqual(local.state,before);
});
test('other websites cannot register or inject subscription imports',async()=>{
 const untrusted={url:'https://example.com/feed/subscriptions',tab:{id:99}};
 assert.equal((await send({type:'GET_PAGE_MODE',requestedImport:true},untrusted)).ok,false);
 assert.equal((await send({type:'IMPORT_SUBSCRIPTIONS',capture:{channels:[],videos:[]}},untrusted)).ok,false);
});
test('native feed controls persist selection but cannot replace unrelated storage fields',async()=>{
 const before=structuredClone(local.state.channels);
 const response=await send({type:'NATIVE_PATCH',patch:{excluded:{abcdefghijk:true},channels:[],groups:[]}},source);
 assert.equal(response.ok,true);assert.equal(local.state.excluded.abcdefghijk,true);assert.deepEqual(local.state.channels,before);
 assert.equal((await send({type:'NATIVE_PATCH',patch:{hidden:{}}},{url:'https://example.com/feed/subscriptions',tab:{id:5}})).ok,false);
 assert.equal((await send({type:'NATIVE_PATCH',patch:{hidden:{}}},{url:'https://www.youtube.com/watch?v=abcdefghijk',tab:{id:5}})).ok,false);
});
