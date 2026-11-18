export const DAY = 24 * 60 * 60 * 1000;
export const isPremiere = video => video.isPremiere === true || /\bpremier(?:e|es|ed|ing)\b/i.test(video.ageLabel || '');
export const videoPriority = (a,b) => Number(a.isShort === true)-Number(b.isShort === true) || b.published-a.published;
export const isVideoId = id => typeof id === 'string' && /^[\w-]{11}$/.test(id);
export const isChannelId = id => typeof id === 'string' && /^UC[\w-]{22}$/.test(id);
export const defaults = () => ({channels: [], videos: [], groups: [], hidden: {}, excluded: {}, playlists: [], settings: {replaceHome: true, replaceSubscriptions: true, theme: 'dark', windowHours: 24}, lastSync: null, failures: []});
export function recentVideos(state, now = Date.now(), includeHidden = false, hours = state.settings?.windowHours || 24) {
  const channels = new Set(state.channels.map(c => c.id));
  return state.videos.filter(v => !isPremiere(v) && channels.has(v.channelId) && isVideoId(v.id) && Number.isFinite(v.published) && v.published > now - hours * 3600000 && v.published <= now && (includeHidden || !(state.hidden[v.id] > now))).sort((a,b) => b.published-a.published);
}
export function cardsFor(state, {groupId = 'all', query = '', now = Date.now(), hours = state.settings?.windowHours || 24} = {}) {
  const groups = new Map(state.groups.map(g => [g.id,g]));
  const channels = new Map(state.channels.map(c => [c.id,c]));
  const names = new Map(state.channels.map(c => [c.name?.trim().toLocaleLowerCase(),c.id]).filter(([name])=>name));
  const memberIds = v => [...new Set([v.channelId,...(Array.isArray(v.collaboratorIds)?v.collaboratorIds:[]),...(Array.isArray(v.collaboratorNames)?v.collaboratorNames.flatMap(raw=>{
    const candidate=raw.trim().toLocaleLowerCase();
    return [...names].filter(([name])=>candidate===name||(name.length>=3&&candidate.startsWith(name)&&!/[\p{L}\p{N}]/u.test(candidate[name.length]||''))).map(([,id])=>id);
  }):[])].filter(id=>channels.has(id)))];
  const keys = v => memberIds(v).flatMap(id=>{
    const group=groups.get(channels.get(id).groupId);
    return group?[`channel:${id}`,`group:${group.id}`]:[`channel:${id}`];
  });
  const videos = recentVideos(state, now, false, hours).filter(v=>groupId==='all'||memberIds(v).some(id=>channels.get(id).groupId===groupId));
  // Match collaborations to stacks that actually overlap this video's 24-hour
  // window. An old collaboration must not join two unrelated new stacks.
  const stacks=[];
  for(const video of videos){
    const membership=new Set(keys(video));
    const matches=stacks.filter(stack=>stack.newestPublished-video.published<=DAY&&[...membership].some(key=>stack.members.has(key)));
    let stack=matches[0];
    if(!stack){stack={newestPublished:video.published,videos:[],members:new Set()};stacks.push(stack);}
    stack.videos.push(video);
    for(const key of membership)stack.members.add(key);
    for(const other of matches.slice(1)){
      if(stack.newestPublished-other.videos.at(-1).published>DAY)continue;
      stack.videos.push(...other.videos);
      for(const key of other.members)stack.members.add(key);
      stacks.splice(stacks.indexOf(other),1);
    }
  }
  const cards=stacks.map(stack=>{
    stack.videos.sort((a,b)=>b.published-a.published);
    const anchor=stack.videos[0],channel=channels.get(anchor.channelId);
    const group=groups.get(groupId==='all'?channel.groupId:groupId)||stack.videos.flatMap(memberIds).map(id=>groups.get(channels.get(id).groupId)).find(Boolean);
    return {newestPublished:stack.newestPublished,key:`${group?`group:${group.id}`:`channel:${channel.id}`}:${anchor.id}`,title:group?.name||channel.name,group:Boolean(group),color:group?.color||channel.color||'#ee7046',videos:stack.videos};
  });
  for (const card of cards) card.videos.sort(videoPriority);
  return cards.filter(card => `${card.title} ${card.videos.map(v => `${v.title} ${memberIds(v).map(id=>channels.get(id).name).join(' ')}`).join(' ')}`.toLowerCase().includes(query.toLowerCase())).sort((a,b) => b.newestPublished-a.newestPublished);
}
export const selectedVideos = (state, videos = recentVideos(state), now = Date.now()) => videos.filter(v => !isPremiere(v) && !state.excluded[v.id] && !(state.hidden[v.id] > now)).sort(videoPriority);
export function mergeVideos(existing, incoming, now = Date.now()) {
  const result = new Map();
  for (const video of [...existing,...incoming]) {
    if (isVideoId(video.id) && Number.isFinite(video.published) && video.published > now - 7*DAY) result.set(video.id,{...result.get(video.id),...video});
  }
  return [...result.values()];
}
export function youtubeQueueURL(videos) {
  const ordered = videos.filter(v => typeof v === 'string' || !isPremiere(v));
  if (ordered.every(v => typeof v !== 'string')) ordered.sort(videoPriority);
  const ids = [...new Set(ordered.map(v => typeof v === 'string' ? v : v.id))];
  if (!ids.length || ids.some(id => !isVideoId(id))) throw new Error('Select at least one valid video.');
  const url = new URL(ids.length === 1 ? 'https://www.youtube.com/watch' : 'https://www.youtube.com/watch_videos');
  url.searchParams.set(ids.length === 1 ? 'v' : 'video_ids', ids.join(','));
  return url.href;
}
export const isChannelKey = id => isChannelId(id) || /^\/@[^\s/?#]{1,100}$/u.test(id || '');
export function relativePublished(label, now = Date.now()) {
  const text = String(label).toLowerCase().replace(/^streamed\s+/, '').replace(/^premiered\s+/, '');
  if (/^(just now|a moment ago)$/.test(text)) return now - 1000;
  const match = text.match(/(\d+)\s*(seconds?|secs?|minutes?|mins?|hours?|hrs?|days?|weeks?|months?|years?|[smhdw])(?:\s+ago|$)/);
  if (!match) return null;
  const unit = match[2], amount = Number(match[1]);
  const scale = /^(month)/.test(unit) ? 30*DAY : /^(year)/.test(unit) ? 365*DAY : /^(w)/.test(unit) ? 7*DAY : /^(d)/.test(unit) ? DAY : /^(h)/.test(unit) ? 3600000 : /^(m)/.test(unit) ? 60000 : 1000;
  return now - amount*scale;
}
export function safeImageURL(value) {
  try {const url = new URL(value);return url.protocol === 'https:' && ['i.ytimg.com','yt3.ggpht.com','yt3.googleusercontent.com'].includes(url.hostname) ? url.href : '';} catch {return '';}
}
export function sanitizeCapture(input) {
  if (!input || !Array.isArray(input.channels) || !Array.isArray(input.videos)) throw new Error('Choose a subscriptions export with channels and videos.');
  const channels = input.channels.filter(c=>isChannelKey(c?.id)).map(c=>({id:c.id,name:String(c.name||c.id).slice(0,150),avatar:safeImageURL(c.avatar),url:`https://www.youtube.com/${c.id.startsWith('/@')?c.id.slice(1):'channel/'+c.id}`}));
  const valid = new Set(channels.map(c=>c.id));
  const videos = input.videos.filter(v=>isVideoId(v?.id) && valid.has(v.channelId) && Number.isFinite(v.published)).map(v=>({id:v.id,channelId:v.channelId,collaboratorIds:[...new Set([v.channelId,...(Array.isArray(v.collaboratorIds)?v.collaboratorIds:[])].filter(id=>valid.has(id)))].slice(0,20),collaboratorNames:(Array.isArray(v.collaboratorNames)?v.collaboratorNames:[]).filter(name=>typeof name==='string').map(name=>name.trim().slice(0,150)).filter(Boolean).slice(0,20),title:String(v.title||'Untitled video').slice(0,500),...(typeof v.isShort==='boolean'?{isShort:v.isShort}:{}),...(typeof v.isPremiere==='boolean'?{isPremiere:v.isPremiere}:{}),published:v.published,approximate:!!v.approximate,ageLabel:String(v.ageLabel||'').slice(0,50),thumbnail:safeImageURL(v.thumbnail),duration:String(v.duration||'').slice(0,20),views:String(v.views||'').slice(0,40),verified:!!v.verified,progress:Math.min(100,Math.max(0,Number(v.progress)||0))}));
  return {channels, videos, capturedAt:Number(input.capturedAt)||Date.now(),source:'youtube-subscriptions'};
}
export function mergeCapture(state, raw, now = Date.now()) {
  const capture = sanitizeCapture(raw), known = new Map(state.channels.map(c=>[c.id,c]));
  for (const c of capture.channels) known.set(c.id,{...known.get(c.id),...c,avatar:c.avatar||known.get(c.id)?.avatar||''});
  const previous = new Map(state.videos.map(v=>[v.id,v]));
  const incoming = capture.videos.map(v=>{const old=previous.get(v.id);return {...old,...v,collaboratorIds:[...new Set([...(old?.collaboratorIds||[]),...v.collaboratorIds])],collaboratorNames:[...new Set([...(old?.collaboratorNames||[]),...v.collaboratorNames])],...(old&&!old.approximate?{published:old.published,approximate:false}:old&&v.approximate?{published:Math.min(old.published,v.published)}:{})};});
  return {...state, channels:[...known.values()], videos:mergeVideos(state.videos,incoming,now),lastSync:capture.capturedAt,source:capture.source,failures:[]};
}
export function extractChannelId(html) {
  return html.match(/"externalId"\s*:\s*"(UC[\w-]{22})"/)?.[1]
    || html.match(/<meta[^>]+itemprop="channelId"[^>]+content="(UC[\w-]{22})"/)?.[1]
    || html.match(/feeds\/videos\.xml\?channel_id=(UC[\w-]{22})/)?.[1]
    || html.match(/"channelMetadataRenderer"\s*:\s*\{[^}]*"externalId"\s*:\s*"(UC[\w-]{22})"/)?.[1];
}
export function decodeXML(str = '') {
  return str.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1').replace(/&#(x[\da-f]+|\d+);|&(amp|lt|gt|quot|apos);/gi, (_,n,k) => n ? String.fromCodePoint(parseInt(n.replace(/^x/i,''),/^x/i.test(n)?16:10)) : ({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"})[k.toLowerCase()]);
}
export function parseFeed(xml, channelId) {
  if(!/<feed[\s>]/.test(xml)) throw new Error('YouTube returned an invalid feed');
  const tag = (s,t) => decodeXML(s.match(new RegExp(`<${t}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${t}>`))?.[1] || '');
  const name = tag(xml.split('<entry>')[0],'title');
  const videos = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map(([,entry]) => ({id:tag(entry,'yt:videoId'), channelId, title:tag(entry,'title'), approximate:false, published:Date.parse(tag(entry,'published'))})).filter(v => isVideoId(v.id) && Number.isFinite(v.published));
  return {name, videos};
}
export async function mapLimit(items, limit, fn) {
  let index=0;
  const result=[];
  await Promise.all(Array.from({length:Math.min(limit,items.length)},async()=>{while(index<items.length){const i=index++;try{result[i]={status:'fulfilled',value:await fn(items[i],i)};}catch(e){result[i]={status:'rejected',reason:e.message};}}}));
  return result;
}
