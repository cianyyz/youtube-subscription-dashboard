import {defaults, isChannelId, extractChannelId, parseFeed, mergeVideos, mapLimit, DAY, isVideoId, isChannelKey, mergeCapture, relativePublished, sanitizeCapture} from './core.js';
let serial = Promise.resolve();
const mutate = fn => { const next = serial.then(fn); serial = next.catch(()=>{}); return next; };
async function read() {const {state}=await chrome.storage.local.get('state');return {...defaults(),...state};}
async function request(url) {const response=await fetch(url,{credentials:'omit',signal:AbortSignal.timeout(15000)});if(!response.ok)throw new Error(`YouTube returned ${response.status}`);return response.text();}
async function resolveChannel(value) {
  value = String(value).trim();
  let id = isChannelId(value) ? value : null;
  if(!id){
    const url = new URL(value.startsWith('@') ? `https://www.youtube.com/${value}` : value);
    if(url.hostname!=='www.youtube.com' && url.hostname!=='youtube.com')throw new Error('Use a YouTube channel URL, @handle, or channel ID.');
    id=url.pathname.match(/^\/channel\/(UC[\w-]{22})/)?.[1] || url.searchParams.get('channel_id');
    if(!isChannelId(id)) {
      if(!/^\/(?:@[^/]+|c\/[^/]+|user\/[^/]+)\/?$/.test(url.pathname))throw new Error('Use the channel’s main URL or @handle.');
      id=extractChannelId(await request(`https://www.youtube.com${url.pathname}`));
    }
  }
  if(!isChannelId(id))throw new Error('Could not find this channel. Try its UC… channel ID.');
  const feed=parseFeed(await request(`https://www.youtube.com/feeds/videos.xml?channel_id=${id}`),id);
  return {channel:{id,name:feed.name || id},videos:feed.videos};
}
let syncing;
async function sync() {
  if(syncing)return syncing;
  syncing=(async()=>{
    const before=await read();
    const results=await mapLimit(before.channels,4,async c=>{if(isChannelId(c.id)||isChannelId(c.rssId))return {id:c.id,...parseFeed(await request(`https://www.youtube.com/feeds/videos.xml?channel_id=${c.rssId||c.id}`),c.id)};const found=await resolveChannel(c.url||`https://www.youtube.com${c.id}`);return {id:c.id,rssId:found.channel.id,name:found.channel.name,videos:found.videos.map(v=>({...v,channelId:c.id,approximate:false}))};});
    return mutate(async()=>{
      const state=await read();
      const videos=results.filter(r=>r.status==='fulfilled').flatMap(r=>r.value.videos);
      state.videos=mergeVideos(state.videos,videos);
      state.channels=state.channels.map(c=>({...c,rssId:results.find(r=>r.status==='fulfilled'&&r.value.id===c.id)?.value.rssId||c.rssId,name:results.find(r=>r.status==='fulfilled'&&r.value.id===c.id)?.value.name||c.name}));
      state.failures=results.flatMap((r,i)=>r.status==='rejected'?[{id:before.channels[i].id,name:before.channels[i].name,error:r.reason}]:[]);
      state.lastSync=Date.now();
      state.hidden=Object.fromEntries(Object.entries(state.hidden).filter(([,expiry])=>expiry>Date.now()));
      const alive=new Set(state.videos.map(v=>v.id));state.excluded=Object.fromEntries(Object.entries(state.excluded).filter(([id])=>alive.has(id)));
      await chrome.storage.local.set({state});return state;
    });
  })().finally(()=>{syncing=null;});return syncing;
}
const IMPORT_TTL=15*60*1000;
async function pendingImport(tabId) {
  const {importTabs={}}=await chrome.storage.session.get('importTabs');
  return !!(importTabs[tabId] && Date.now()-importTabs[tabId]<IMPORT_TTL);
}
async function setImport(tabId,pending) {
  return mutate(async()=>{const {importTabs={}}=await chrome.storage.session.get('importTabs');for(const [id,time] of Object.entries(importTabs))if(Date.now()-time>=IMPORT_TTL)delete importTabs[id];if(pending)importTabs[tabId]=Date.now();else delete importTabs[tabId];await chrome.storage.session.set({importTabs});});
}
async function handle(message,sender) {
  const own=sender.url?.startsWith(chrome.runtime.getURL(''));
  const page=sender.url?new URL(sender.url):null;
  const youtube=page?.origin==='https://www.youtube.com';
  if(message.type==='GET_PAGE_MODE') {
    if(!youtube||!sender.tab)throw new Error('Page mode is only available on YouTube.');
    if(message.requestedImport&&page.pathname==='/feed/subscriptions')await setImport(sender.tab.id,true);
    return {settings:(await read()).settings,importPending:await pendingImport(sender.tab.id)};
  }
  if(message.type==='CANCEL_IMPORT') {if(!youtube||!sender.tab)throw new Error('Invalid import tab.');await setImport(sender.tab.id,false);return {};}
  if(message.type==='OPEN_SETTINGS') {
    if(!youtube||!sender.tab)throw new Error('Invalid YouTube tab.');
    await chrome.tabs.create({url:chrome.runtime.getURL('index.html?settings=1')});return {};
  }
  if(message.type==='NATIVE_PATCH') {
    if(!youtube||!sender.tab||!['/feed/subscriptions','/subscriptions'].includes(page.pathname))throw new Error('Invalid subscriptions page.');
    return mutate(async()=>{const state=await read();for(const key of ['hidden','excluded','settings'])if(key in message.patch)state[key]=message.patch[key];await chrome.storage.local.set({state});return state;});
  }
  if(message.type==='OPEN_DASHBOARD') {
    if(!youtube||!sender.tab)throw new Error('Invalid YouTube tab.');
    if(await pendingImport(sender.tab.id))throw new Error('Finish or cancel the subscription import before opening the dashboard.');
    await chrome.tabs.update(sender.tab.id,{url:(await read()).settings.replaceSubscriptions?'https://www.youtube.com/feed/subscriptions':chrome.runtime.getURL('index.html')});return {};
  }
  if(message.type==='IMPORT_SUBSCRIPTIONS') {
    if(!own && !(page?.origin==='https://www.youtube.com' && ['/feed/subscriptions','/subscriptions'].includes(page.pathname)))throw new Error('Import must come from your subscriptions page.');
    const capture=message.capture;
    if(!capture||!Array.isArray(capture.videos))throw new Error('Invalid subscriptions data.');
    const now=Date.now();
    const normalized={...capture,videos:capture.videos.map(v=>({...v,published:Number.isFinite(v.published)?v.published:relativePublished(v.ageLabel,now),approximate:v.approximate??true}))};
    const clean=sanitizeCapture(normalized);
    if(!clean.channels.length)throw new Error('Could not read channel links from the loaded subscriptions. Update the extension and retry.');
    if(!clean.videos.length)throw new Error('Found video cards, but their upload dates could not be read. Wait for YouTube to finish loading, then retry.');
    const result=await mutate(async()=>{const state=mergeCapture(await read(),clean,now);state.lastImport={capturedAt:now,channels:clean.channels.length,videos:clean.videos.length,skipped:normalized.videos.length-clean.videos.length};await chrome.storage.local.set({state});return {channels:state.channels.length,videos:state.videos.length,importedChannels:clean.channels.length,importedVideos:clean.videos.length};});
    if(sender.tab)await setImport(sender.tab.id,false);
    return result;
  }
  if(message.type==='IMPORT_CHANNELS') {
    if(!sender.url?.startsWith('https://www.youtube.com/feed/channels') && !own)throw new Error('Import must start from your subscriptions page.');
    const inputs=[...new Set(message.values)].filter(x=>typeof x==='string').slice(0,2000);
    const results=await mapLimit(inputs,4,resolveChannel);
    await mutate(async()=>{const state=await read();const known=new Map(state.channels.map(c=>[c.id,c]));let videos=[];for(const r of results){if(r.status==='fulfilled'){const {channel,videos:found}=r.value;if(!known.has(channel.id))known.set(channel.id,channel);videos.push(...found);}}state.channels=[...known.values()];state.videos=mergeVideos(state.videos,videos);await chrome.storage.local.set({state});});
    return {imported:new Set(results.filter(r=>r.status==='fulfilled').map(r=>r.value.channel.id)).size,failures:results.flatMap((r,i)=>r.status==='rejected'?[{value:inputs[i],error:r.reason}]:[])};
  }
  if(!own)throw new Error('This action is only available in the dashboard.');
  if(message.type==='SYNC')return sync();
  if(message.type==='OPEN_IMPORT'){
    // Register the tab before navigation so even pre-document URL cleaning cannot lose the intent.
    const tab=await chrome.tabs.create({url:'about:blank',active:true});
    await setImport(tab.id,true);
    await chrome.tabs.update(tab.id,{url:'https://www.youtube.com/feed/subscriptions?subspace_sync=1'});
    return {};
  }
  if(message.type==='PATCH')return mutate(async()=>{const state=await read();for(const key of ['groups','hidden','excluded','playlists','settings'])if(key in message.patch)state[key]=message.patch[key];if(message.patch.channels)state.channels=message.patch.channels.filter(c=>isChannelKey(c.id));await chrome.storage.local.set({state});return state;});
  throw new Error('Unknown action');
}
chrome.runtime.onMessage.addListener((message,sender,reply)=>{handle(message,sender).then(data=>reply({ok:true,data}),e=>reply({ok:false,error:e.message}));return true;});
chrome.runtime.onInstalled.addListener(async()=>{const {state}=await chrome.storage.local.get('state');if(!state)await chrome.storage.local.set({state:defaults()});await chrome.alarms.create('refresh',{periodInMinutes:30});});
chrome.runtime.onStartup.addListener(()=>chrome.alarms.create('refresh',{periodInMinutes:30}));
chrome.alarms.onAlarm.addListener(alarm=>{if(alarm.name==='refresh')sync().catch(console.error);});
chrome.action.onClicked.addListener(async()=>chrome.tabs.create({url:(await read()).settings.replaceSubscriptions?'https://www.youtube.com/feed/subscriptions':chrome.runtime.getURL('index.html')}));

chrome.tabs.onRemoved.addListener(tabId=>{setImport(tabId,false).catch(()=>{});});
