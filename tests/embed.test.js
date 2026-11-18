import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {parseHTML} from 'linkedom';
import * as core from '../extension/core.js';
const source=readFileSync(new URL('../extension/embed.js',import.meta.url),'utf8').replace("import(chrome.runtime.getURL('core.js'))",'Promise.resolve(testCore)');
const reader=readFileSync(new URL('../extension/reader.js',import.meta.url),'utf8');
const tile=(id,age,{short=false,premiere=false,channel='alpha',collaborator=''}={})=>`<ytd-rich-item-renderer><yt-lockup-view-model><h3><a href="${short?'/shorts/'+id:'/watch?v='+id}">${id}</a></h3><a href="/@${channel}">${channel}</a>${collaborator?`<a href="/@${collaborator}">${collaborator}</a>`:''}<div class="metadata"><span class="ytContentMetadataViewModelMetadataText">100 views</span><span class="ytContentMetadataViewModelMetadataText">${premiere?'Premiered ':''}${age} hours ago</span></div></yt-lockup-view-model></ytd-rich-item-renderer>`;
async function harness(){
 const {document,window}=parseHTML(`<html><body><ytd-guide-entry-renderer><a href="/@alpha" title="alpha">alpha</a></ytd-guide-entry-renderer><ytd-page-manager><ytd-browse page-subtype="subscriptions"><div id="feed">${tile('aaaaaaaaaaa',1,{short:true})}${tile('bbbbbbbbbbb',2)}${tile('ccccccccccc',3,{premiere:true})}${tile('ddddddddddd',30)}</div></ytd-browse></ytd-page-manager></body></html>`);
 // linkedom deliberately omits this browser form setter.
 Object.defineProperty(window.HTMLSelectElement.prototype,'value',{configurable:true,get(){return this._value;},set(value){this._value=String(value);}});
 let state={...core.defaults(),settings:{...core.defaults().settings,windowHours:168}},observerCallback;
 const timers=new Map(),messages=[],opened=[];let seq=0;
 const context={document,URL,Date,Map,Set,console,testCore:core,location:{href:'https://www.youtube.com/feed/subscriptions'},window:{open:(...args)=>opened.push(args)},setTimeout:fn=>{timers.set(++seq,fn);return seq;},clearTimeout:id=>timers.delete(id),MutationObserver:class{constructor(fn){observerCallback=fn;}observe(){}disconnect(){}},chrome:{runtime:{getURL:path=>'chrome-extension://test/'+path,sendMessage:async message=>{messages.push(message);if(message.type==='NATIVE_PATCH'){state={...state,...message.patch};return {ok:true,data:state};}return {ok:true,data:{}};}},storage:{local:{get:async()=>({state})},onChanged:{addListener(){}}}}};
 vm.runInNewContext(reader,context);vm.runInNewContext(source,context);
 const flush=async()=>{await new Promise(r=>setImmediate(r));const pending=[...timers.values()];timers.clear();pending.forEach(fn=>fn());await new Promise(r=>setImmediate(r));};
 context.SubscriptionsEmbed.setEnabled(true);await flush();
 return {document,window,context,messages,opened,flush,mutate:()=>observerCallback()};
}
test('native cards collapse without iframe; count follows age and regular video links lead queue',async()=>{
 const h=await harness(),d=h.document;
 assert.equal(d.querySelector('iframe'),null);
 assert.equal(d.querySelectorAll('yt-lockup-view-model').length,4);
 assert.equal(d.querySelectorAll('.subscriptions-native-hidden').length,2);
 const link=d.querySelector('a[href*="watch_videos"]');
 assert.equal(new URL(link.getAttribute('href')).searchParams.get('video_ids'),'bbbbbbbbbbb,aaaaaaaaaaa');
 const controls=d.querySelector('.subscriptions-native-inline');
 assert.match(controls.previousElementSibling.textContent,/2 hours ago/);
 assert.equal(controls.querySelector('button').textContent,'+ 1 video');
 link.dispatchEvent(new h.window.Event('click',{bubbles:true,cancelable:true}));
 assert.equal(new URL(h.opened[0][0]).searchParams.get('video_ids'),'bbbbbbbbbbb,aaaaaaaaaaa');
 assert.equal(h.messages.filter(m=>m.type==='IMPORT_SUBSCRIPTIONS').length,1);
 h.mutate();await h.flush();assert.equal(h.messages.filter(m=>m.type==='IMPORT_SUBSCRIPTIONS').length,1);
 h.context.SubscriptionsEmbed.setEnabled(false);
 assert.equal(d.querySelectorAll('.subscriptions-native-hidden').length,0);
 assert.equal(d.querySelectorAll('.subscriptions-native-inline').length,0);
 assert.equal(d.querySelector('.subscriptions-native-toolbar'),null);
 assert.equal(d.querySelector('a[href*="watch_videos"]'),null);
 assert(d.querySelector('a[href="/watch?v=bbbbbbbbbbb"]'));
});
test('newly loaded cards join stacks and deselection persists in native controls',async()=>{
 const h=await harness(),d=h.document;
 d.querySelector('#feed').insertAdjacentHTML('beforeend',tile('eeeeeeeeeee',4));h.mutate();await h.flush();
 const controls=d.querySelector('.subscriptions-native-inline');assert.equal(controls.querySelector('button').textContent,'+ 2 videos');
 const check=controls.querySelector('input');check.checked=false;check.onchange();await h.flush();
 assert(h.messages.some(m=>m.type==='NATIVE_PATCH'&&m.patch.excluded.eeeeeeeeeee));
 assert.equal(d.querySelector('.subscriptions-native-inline input').checked,false);
 assert.equal(d.querySelectorAll('.subscriptions-native-toolbar').length,1);
});
test('a newly loaded collaboration joins the visible playlist through its second channel',async()=>{
 const h=await harness(),d=h.document;
 d.querySelector('#feed').insertAdjacentHTML('beforeend',tile('eeeeeeeeeee',4,{channel:'other',collaborator:'alpha'}));
 h.mutate();await h.flush();
 const link=d.querySelector('a[href*="watch_videos"]');
 assert.equal(new URL(link.getAttribute('href')).searchParams.get('video_ids'),'bbbbbbbbbbb,eeeeeeeeeee,aaaaaaaaaaa');
 assert.equal(d.querySelector('.subscriptions-native-inline button').textContent,'+ 2 videos');
 assert.equal(d.querySelectorAll('.subscriptions-native-hidden').length,3);
});
test('text-only collaboration from YouTube joins the native stack',async()=>{
 const h=await harness(),d=h.document;
 d.querySelector('#feed').insertAdjacentHTML('beforeend',`<ytd-rich-item-renderer><yt-lockup-view-model>
  <h3><a href="/watch?v=eeeeeeeeeee">Collaboration</a></h3>
  <div class="ytContentMetadataViewModelMetadataRow">
    <span class="ytContentMetadataViewModelMetadataText">alpha</span>
    <span class="ytContentMetadataViewModelMetadataText">and other</span>
    <span class="ytContentMetadataViewModelMetadataText" aria-label="4 hours ago">4h ago</span>
  </div>
 </yt-lockup-view-model></ytd-rich-item-renderer>`);
 h.mutate();await h.flush();
 const link=d.querySelector('a[href*="watch_videos"]');
 assert.equal(new URL(link.getAttribute('href')).searchParams.get('video_ids'),'bbbbbbbbbbb,eeeeeeeeeee,aaaaaaaaaaa');
 assert.equal(d.querySelector('.subscriptions-native-inline button').textContent,'+ 2 videos');
});
