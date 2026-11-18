import test from 'node:test';
import assert from 'node:assert/strict';
import {defaults,DAY,recentVideos,cardsFor,selectedVideos,mergeVideos,parseFeed,extractChannelId,mapLimit,youtubeQueueURL,relativePublished,mergeCapture,sanitizeCapture,safeImageURL} from '../extension/core.js';
const now=Date.now();
function fixture(){return {...defaults(),channels:[{id:'a',name:'Alpha',groupId:'g'},{id:'b',name:'Beta',groupId:'g'},{id:'c',name:'Gamma'}],groups:[{id:'g',name:'Together'}],videos:[{id:'aaaaaaaaaaa',channelId:'a',title:'First',published:now-1000},{id:'bbbbbbbbbbb',channelId:'a',title:'Second',published:now-2000},{id:'ccccccccccc',channelId:'b',title:'Third',published:now-3000},{id:'ddddddddddd',channelId:'c',title:'Fourth',published:now-4000},{id:'eeeeeeeeeee',channelId:'c',published:now-DAY-1},{id:'fffffffffff',channelId:'c',published:now+1000}]};}
test('rolling 24h excludes old, future, invalid and removed-channel videos',()=>{const s=fixture();s.videos.push({id:'ggggggggggg',channelId:'removed',published:now-5});assert.equal(recentVideos(s,now).length,4);});
test('grouped channels collapse into one latest-first stack without duplicates',()=>{const cards=cardsFor(fixture(),{now});assert.equal(cards.length,2);assert.equal(cards[0].title,'Together');assert.deepEqual(cards[0].videos.map(v=>v.id),['aaaaaaaaaaa','bbbbbbbbbbb','ccccccccccc']);});
test('hidden latest promotes next video; expired hide restores video',()=>{const s=fixture();s.hidden.aaaaaaaaaaa=now+1000;assert.equal(cardsFor(s,{now})[0].videos[0].id,'bbbbbbbbbbb');assert.equal(cardsFor(s,{now:now+1001}).find(c=>c.title==='Together').videos[0].id,'aaaaaaaaaaa');});
test('queue excludes deselected and hidden videos while cards keep deselected videos',()=>{const s=fixture();s.excluded.aaaaaaaaaaa=true;s.hidden.bbbbbbbbbbb=now+DAY;assert.deepEqual(selectedVideos(s,recentVideos(s,now),now).map(v=>v.id),['ccccccccccc','ddddddddddd']);assert.equal(cardsFor(s,{now})[0].videos[0].id,'aaaaaaaaaaa');});
test('group filtering and case-insensitive channel search preserve complete stacks',()=>{assert.equal(cardsFor(fixture(),{now,groupId:'g'}).length,1);assert.equal(cardsFor(fixture(),{now,query:'BETA'})[0].videos.length,3);});
test('merge deduplicates, updates metadata and prunes old cache',()=>{const s=fixture();const updated={...s.videos[0],title:'Updated'};const result=mergeVideos([...s.videos,{id:'zzzzzzzzzzz',published:now-DAY*8}],[updated],now);assert.equal(result.filter(v=>v.id===updated.id).length,1);assert.equal(result.find(v=>v.id===updated.id).title,'Updated');assert(!result.some(v=>v.id==='zzzzzzzzzzz'));});
test('RSS parses exact publication timestamps and XML escapes',()=>{const xml=`<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015"><title>Science &amp; More</title><entry><yt:videoId>abcdefghijk</yt:videoId><title><![CDATA[Test <title>]]></title><published>2026-09-27T06:00:00+00:00</published></entry><entry><yt:videoId>invalid</yt:videoId><published>bad</published></entry></feed>`;const result=parseFeed(xml,'channel');assert.equal(result.name,'Science & More');assert.equal(result.videos[0].title,'Test <title>');assert.equal(result.videos.length,1);assert.equal(result.videos[0].published,Date.parse('2026-09-27T06:00:00Z'));assert.throws(()=>parseFeed('<html>Sorry</html>','channel'));});
test('channel resolver ignores video recommendation channel IDs',()=>{const id='UCBJycsmduvYEL83R_U4JriQ';assert.equal(extractChannelId(`{"channelId":"UCWRONG","externalId":"${id}"}`),id);});
test('bounded requests preserve order and retain failures',async()=>{let active=0,peak=0;const result=await mapLimit([1,2,3,4],2,async n=>{active++;peak=Math.max(peak,active);await new Promise(r=>setTimeout(r,5));active--;if(n===3)throw new Error('Unavailable');return n*2;});assert.equal(peak,2);assert.equal(result[2].status,'rejected');assert.equal(result[3].value,8);});
test('native queue URL contains ordered, deduplicated video IDs and no custom player state',()=>{const url=new URL(youtubeQueueURL(['abcdefghijk','lmnopqrstuv','abcdefghijk']));assert.equal(url.origin,'https://www.youtube.com');assert.equal(url.pathname,'/watch_videos');assert.equal(url.searchParams.get('video_ids'),'abcdefghijk,lmnopqrstuv');assert.throws(()=>youtubeQueueURL([]));assert.throws(()=>youtubeQueueURL(['javascript:evil']));});
test('date parsing keeps one-day-old videos out of the strict 24-hour feed',()=>{assert.equal(relativePublished('1 day ago',now),now-DAY);assert.equal(relativePublished('Streamed 2 hours ago',now),now-7200000);assert.equal(relativePublished('12 min ago',now),now-720000);assert.equal(relativePublished('Upcoming',now),null);});
test('explicit extended time range includes older videos without changing publication times',()=>{const s=fixture();s.settings.windowHours=168;assert.equal(recentVideos(s,now).length,5);});
test('captured metadata is sanitized and untrusted remote image URLs are dropped',()=>{const capture=sanitizeCapture({channels:[{id:'/@alpha',name:'Alpha',avatar:'https://evil.example/tracker'}],videos:[{id:'abcdefghijk',channelId:'/@alpha',title:'Example',published:now-1000,thumbnail:'javascript:evil',progress:1000}]});assert.equal(capture.channels[0].avatar,'');assert.equal(capture.videos[0].thumbnail,'');assert.equal(capture.videos[0].progress,100);assert.equal(safeImageURL('https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg'),'https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg');});
test('reimport does not make relative dates younger and preserves groups and exclusions',()=>{const base={...defaults(),channels:[{id:'/@alpha',name:'Alpha',groupId:'g'}],excluded:{abcdefghijk:true}};const capture={channels:[{id:'/@alpha',name:'Alpha'}],videos:[{id:'abcdefghijk',channelId:'/@alpha',published:now-3600000,title:'Example',approximate:true}]};const first=mergeCapture(base,capture,now);const again=mergeCapture(first,{...capture,videos:[{...capture.videos[0],published:now-1800000}]},now);assert.equal(again.videos[0].published,now-3600000);assert.equal(again.channels[0].groupId,'g');assert.equal(again.excluded.abcdefghijk,true);});
test('RSS refresh preserves page thumbnail metadata and corrects approximate timestamps',()=>{const old={id:'abcdefghijk',channelId:'/@alpha',published:now-3600000,approximate:true,duration:'4:20',views:'10K',thumbnail:'https://i.ytimg.com/vi/abcdefghijk/hq720.jpg'};const updated=mergeVideos([old],[{id:old.id,channelId:old.channelId,title:'Exact title',published:now-7200000,approximate:false}],now)[0];assert.equal(updated.duration,'4:20');assert.equal(updated.approximate,false);assert.equal(updated.published,now-7200000);});
test('stacks anchor a 24-hour span to newest upload without chaining',()=>{
 const s=fixture();s.videos=[0,23,24,24.01,46,49].map((hours,i)=>({id:String(i).repeat(11),channelId:i%2?'b':'a',title:'Upload',published:now-hours*3600000}));
 const cards=cardsFor(s,{now,hours:168});
 assert.deepEqual(cards.map(c=>c.videos.length),[3,2,1]);
 assert.equal(new Set(cards.map(c=>c.key)).size,3);
 assert(cards.every(c=>c.videos[0].published-c.videos.at(-1).published<=DAY));
 s.groups=[];assert.equal(cardsFor(s,{now,hours:168}).length,4);
});
test('regular videos lead cards and queues without changing the 24-hour stack anchor',()=>{
 const s=fixture();s.videos=[{id:'aaaaaaaaaaa',channelId:'a',published:now-1000,isShort:true},{id:'bbbbbbbbbbb',channelId:'b',published:now-23*3600000,isShort:false},{id:'ccccccccccc',channelId:'a',published:now-25*3600000,isShort:false}];
 const stacks=cardsFor(s,{now,hours:168});assert.equal(stacks.length,2);
 assert.deepEqual(stacks[0].videos.map(v=>v.id),['bbbbbbbbbbb','aaaaaaaaaaa']);
 const selected=selectedVideos(s,s.videos,now);assert.deepEqual(selected.map(v=>v.id),['bbbbbbbbbbb','ccccccccccc','aaaaaaaaaaa']);
 assert.equal(new URL(youtubeQueueURL(s.videos)).searchParams.get('video_ids'),selected.map(v=>v.id).join(','));
});
test('premieres are absent from feed, selection, and native playlist including cached labels',()=>{
 const s=fixture();s.videos[0].isPremiere=true;s.videos[1].ageLabel='Premiered 2 hours ago';
 assert(!recentVideos(s,now).some(v=>['aaaaaaaaaaa','bbbbbbbbbbb'].includes(v.id)));
 assert.deepEqual(selectedVideos(s,s.videos.slice(0,3),now).map(v=>v.id),['ccccccccccc']);
 assert.equal(new URL(youtubeQueueURL(s.videos.slice(0,3))).searchParams.get('v'),'ccccccccccc');
});
test('capture and RSS merges retain premiere and Shorts classifications',()=>{
 const capture={channels:[{id:'/@alpha'}],videos:[{id:'abcdefghijk',channelId:'/@alpha',published:now-1000,isShort:true,isPremiere:true}]};
 const first=mergeCapture(defaults(),capture,now);
 const rss=mergeVideos(first.videos,[{id:'abcdefghijk',channelId:'/@alpha',published:now-2000}],now);
 assert.equal(rss[0].isShort,true);assert.equal(rss[0].isPremiere,true);
 const again=mergeCapture({...first,videos:rss},{...capture,videos:[{id:'abcdefghijk',channelId:'/@alpha',published:now-2000}]},now);
 assert.equal(again.videos[0].isShort,true);assert.equal(again.videos[0].isPremiere,true);
});

test('one unique video opens the ordinary watch page without playlist parameters',()=>{
 for(const input of [['abcdefghijk'],['abcdefghijk','abcdefghijk']]){
  const url=new URL(youtubeQueueURL(input));
  assert.equal(url.pathname,'/watch');assert.equal(url.search,'?v=abcdefghijk');
 }
});
test('a collaboration joins either channel and a group containing any collaborator',()=>{
 const state={...defaults(),channels:[{id:'/@secular',name:'Secular Talk'},{id:'/@politic',name:'Good Politic Guy',groupId:'politics'},{id:'/@third',name:'Third Channel',groupId:'politics'}],groups:[{id:'politics',name:'Politics'}],settings:{...defaults().settings,windowHours:48},videos:[
  {id:'aaaaaaaaaaa',channelId:'/@secular',collaboratorIds:['/@secular','/@politic'],published:now-1000,title:'Collaboration'},
  {id:'bbbbbbbbbbb',channelId:'/@secular',published:now-2000,title:'Secular upload'},
  {id:'ccccccccccc',channelId:'/@politic',published:now-3000,title:'Politic upload'},
  {id:'ddddddddddd',channelId:'/@third',published:now-4000,title:'Third upload'}
 ]};
 const cards=cardsFor(state,{now});
 assert.equal(cards.length,1);
 assert.deepEqual(cards[0].videos.map(v=>v.id),['aaaaaaaaaaa','bbbbbbbbbbb','ccccccccccc','ddddddddddd']);
 assert.equal(cards[0].title,'Politics');
 const filtered=cardsFor(state,{now,groupId:'politics'});
 assert.equal(filtered.length,1);
 assert.deepEqual(filtered[0].videos.map(v=>v.id),['aaaaaaaaaaa','ccccccccccc','ddddddddddd']);
 assert.equal(new URL(youtubeQueueURL(filtered[0].videos)).searchParams.get('video_ids'),'aaaaaaaaaaa,ccccccccccc,ddddddddddd');
});
test('plain collaborator names match known channels; connected stacks still stop at 24 hours',()=>{
 const state={...defaults(),channels:[{id:'/@a',name:'Alpha'},{id:'/@b',name:'Beta'}],videos:[
  {id:'aaaaaaaaaaa',channelId:'/@a',collaboratorNames:['Alpha','Beta 2.5K 10h ago'],published:now-1000,title:'Collaboration'},
  {id:'bbbbbbbbbbb',channelId:'/@b',published:now-3600000,title:'Beta upload'},
  {id:'ccccccccccc',channelId:'/@a',published:now-26*3600000,title:'Older Alpha upload'}
 ]};
 const cards=cardsFor(state,{now,hours:48});
 assert.deepEqual(cards.map(c=>c.videos.map(v=>v.id)),[['aaaaaaaaaaa','bbbbbbbbbbb'],['ccccccccccc']]);
});
test('an old collaboration does not join newer unrelated uploads',()=>{
 const state={...defaults(),channels:[{id:'/@a',name:'Alpha'},{id:'/@b',name:'Beta'}],videos:[
  {id:'aaaaaaaaaaa',channelId:'/@a',published:now-1000},
  {id:'bbbbbbbbbbb',channelId:'/@b',published:now-2000},
  {id:'ccccccccccc',channelId:'/@a',collaboratorIds:['/@a','/@b'],published:now-30*3600000}
 ]};
 assert.deepEqual(cardsFor(state,{now,hours:48}).map(card=>card.videos.map(v=>v.id)),[['aaaaaaaaaaa'],['bbbbbbbbbbb'],['ccccccccccc']]);
});
test('a collaboration can combine two recent stacks even when uploaded last',()=>{
 const state={...defaults(),channels:[{id:'/@a',name:'Alpha'},{id:'/@b',name:'Beta'}],videos:[
  {id:'aaaaaaaaaaa',channelId:'/@a',published:now-1000},
  {id:'bbbbbbbbbbb',channelId:'/@b',published:now-2000},
  {id:'ccccccccccc',channelId:'/@a',collaboratorIds:['/@a','/@b'],published:now-3000}
 ]};
 assert.deepEqual(cardsFor(state,{now}).map(card=>card.videos.map(v=>v.id)),[['aaaaaaaaaaa','bbbbbbbbbbb','ccccccccccc']]);
});
test('collaborator identifiers survive capture sanitizing and reimport',()=>{
 const capture={channels:[{id:'/@a',name:'Alpha'},{id:'/@b',name:'Beta'}],videos:[{id:'aaaaaaaaaaa',channelId:'/@a',published:now-1000,collaboratorIds:['/@a','/@b','javascript:bad'],collaboratorNames:['Alpha','Beta']}]};
 const first=mergeCapture(defaults(),capture,now);
 assert.deepEqual(first.videos[0].collaboratorIds,['/@a','/@b']);
 assert.deepEqual(first.videos[0].collaboratorNames,['Alpha','Beta']);
});
