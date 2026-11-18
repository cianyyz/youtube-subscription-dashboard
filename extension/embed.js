// Enhance YouTube's own cards. No replacement document or iframe is mounted.
(() => {
  let enabled=false,observer,timer,core,state,style,toolbar,dialog,running=false;
  let filter='all',lastCapture='',error='';
  const undo=[],owned=new Set();
  const send=async message=>{const response=await chrome.runtime.sendMessage(message);if(!response?.ok)throw new Error(response?.error||'Extension unavailable');return response.data;};
  const node=(tag,text)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;return el;};
  function button(text,action){const el=node('button',text);el.type='button';el.onclick=event=>{event.preventDefault();event.stopPropagation();Promise.resolve(action()).catch(fail);};return el;}
  function fail(e){error=e.message;const status=toolbar?.querySelector('[role="status"]');if(status)status.textContent=error;}
  function cleanupCards(){for(const fn of undo.splice(0))fn();for(const el of owned)el.remove();owned.clear();}
  function observe(){if(enabled)observer.observe(document.documentElement,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['href']});}
  function schedule(){clearTimeout(timer);if(enabled)timer=setTimeout(render,200);}
  async function patch(patch){state=await send({type:'NATIVE_PATCH',patch});schedule();}
  function choose(videos,checked){const excluded={...state.excluded};for(const v of videos){if(checked)delete excluded[v.id];else excluded[v.id]=true;}return patch({excluded});}
  function closeDialog(){dialog?.remove();dialog=null;}
  function showDialog(title){closeDialog();dialog=node('dialog');dialog.className='subscriptions-native-dialog';const heading=node('h2',title);dialog.append(heading,button('Close',closeDialog));document.documentElement.append(dialog);dialog.addEventListener('close',closeDialog,{once:true});dialog.showModal();return dialog;}
  function play(videos){
    const selected=core.selectedVideos(state,videos);
    if(!selected.length){fail(new Error('Select a video first.'));return;}
    if(selected.length<=50){window.open(core.youtubeQueueURL(selected),'_blank','noopener');return;}
    const box=showDialog('Play selected');box.append(node('p','YouTube accepts 50 videos per temporary playlist.'));
    for(let i=0;i<selected.length;i+=50){const batch=selected.slice(i,i+50);box.append(button(`Play ${i+1}–${i+batch.length}`,()=>window.open(core.youtubeQueueURL(batch),'_blank','noopener')));}
  }
  function details(stack){
    const box=showDialog(stack.title);
    box.append(button('Play selected',()=>play(stack.videos)));
    for(const video of stack.videos){
      const row=node('div');row.className='subscriptions-native-row';
      const label=node('label'),check=node('input');check.type='checkbox';check.checked=!state.excluded[video.id];check.setAttribute('aria-label',`Select ${video.title}`);check.onchange=()=>choose([video],check.checked).catch(fail);
      label.append(check,document.createTextNode(video.title));row.append(label,button('Hide 24h',async()=>{await patch({hidden:{...state.hidden,[video.id]:Date.now()+core.DAY}});row.remove();}));box.append(row);
    }
  }
  function hideCard(card){const tile=card.closest('ytd-rich-item-renderer')||card;tile.classList.add('subscriptions-native-hidden');undo.push(()=>tile.classList.remove('subscriptions-native-hidden'));}
  function decorate(card,stack){
    const picks=core.selectedVideos(state,stack.videos);
    for(const link of card.querySelectorAll('a[href]')){
      const original=link.getAttribute('href');let url;try{url=new URL(original,location.href);}catch{continue;}
      if(url.hostname!=='www.youtube.com'||!(url.pathname==='/watch'||url.pathname.startsWith('/shorts/')))continue;
      const href=picks.length&&picks.length<=50?core.youtubeQueueURL(picks):original;
      const click=event=>{if(event.type==='auxclick'&&event.button!==1)return;event.preventDefault();event.stopImmediatePropagation();play(stack.videos);};
      link.setAttribute('href',href);link.addEventListener('click',click,true);link.addEventListener('auxclick',click,true);
      undo.push(()=>{if(link.getAttribute('href')===href)link.setAttribute('href',original);link.removeEventListener('click',click,true);link.removeEventListener('auxclick',click,true);});
    }
    // Insert a sibling after the upload-age text, keeping YouTube's metadata intact.
    const ages=[...card.querySelectorAll('.ytContentMetadataViewModelMetadataText, #metadata-line span')];
    const age=ages.find(el=>/\bago\s*$/i.test(el.textContent.trim()))||card.querySelector('#metadata-line');
    const controls=node('span');controls.className='subscriptions-native-inline';
    const check=node('input');check.type='checkbox';check.checked=picks.length===stack.videos.length;check.indeterminate=!!picks.length&&!check.checked;check.setAttribute('aria-label',`Select ${stack.title} stack`);check.onchange=()=>choose(stack.videos,check.checked).catch(fail);
    const extra=stack.videos.length-1;
    controls.append(button(extra?`+ ${extra} video${extra===1?'':'s'}`:'Options',()=>details(stack)),check);
    if(age)age.after(controls);else (card.querySelector('h3')?.parentElement||card).append(controls);
    owned.add(controls);
  }
  function render(){
    if(!enabled||!core||!state||running)return;
    running=true;observer.disconnect();
    try{
      cleanupCards();
      const browse=document.querySelector('ytd-browse[page-subtype="subscriptions"]')||document.querySelector('ytd-page-manager ytd-browse:not([hidden])');
      if(!browse)return;
      const entries=[];
      const capture=globalThis.SubspaceReader.read(browse,Date.now(),(card,video)=>entries.push({card,video}),state.channels);
      const now=Date.now();
      const normalized={...capture,videos:capture.videos.map(v=>({...v,published:core.relativePublished(v.ageLabel,now),approximate:true}))};
      state=core.mergeCapture(state,normalized,now);
      const ids=new Set(entries.map(e=>e.video.id));
      // Only create stacks whose native cards have actually loaded on this page.
      const view={...state,videos:state.videos.filter(v=>ids.has(v.id))};
      const stacks=core.cardsFor(view,{groupId:filter,now});
      const representatives=new Map(stacks.map(stack=>[stack.videos[0].id,stack]));
      const visited=new Set();
      for(const {card,video} of entries.filter(entry=>!entries.some(other=>other.card!==entry.card&&entry.card.contains(other.card)))){
        if(visited.has(card))continue;visited.add(card);
        const stack=representatives.get(video.id);
        if(!stack){hideCard(card);continue;}
        decorate(card,stack);representatives.delete(video.id);
      }
      toolbar?.remove();toolbar=node('div');toolbar.className='subscriptions-native-toolbar';
      const range=node('select');range.setAttribute('aria-label','Upload time range');
      for(const [value,label] of [[24,'Last 24 hours'],[48,'Last 48 hours'],[168,'Last 7 days']]){const option=node('option',label);option.value=value;range.append(option);}range.value=state.settings.windowHours||24;range.onchange=()=>patch({settings:{...state.settings,windowHours:Number(range.value)}}).catch(fail);
      toolbar.append(range);
      if(state.groups.length){const groups=node('select');groups.setAttribute('aria-label','Channel group');for(const g of [{id:'all',name:'All channels'},...state.groups]){const option=node('option',g.name);option.value=g.id;groups.append(option);}groups.value=filter;groups.onchange=()=>{filter=groups.value;schedule();};toolbar.append(groups);}
      const videos=stacks.flatMap(s=>s.videos),selected=core.selectedVideos(state,videos);
      toolbar.append(button(`Play selected (${selected.length})`,()=>play(videos)),button(selected.length?'Deselect all':'Select all',()=>choose(videos,!selected.length)),button('Restore hidden',()=>patch({hidden:{}})),button('Groups & settings',()=>send({type:'OPEN_SETTINGS'})));
      const status=node('span',error||`${stacks.length} stacks · ${videos.length} loaded videos`);status.setAttribute('role','status');toolbar.append(status);browse.prepend(toolbar);
      // Ignore capturedAt when comparing; our own decoration must never trigger a sync loop.
      const stable=JSON.stringify([capture.channels,capture.videos]);
      if(capture.videos.length&&stable!==lastCapture){lastCapture=stable;send({type:'IMPORT_SUBSCRIPTIONS',capture}).catch(fail);}
    }catch(e){fail(e);}finally{running=false;observe();}
  }
  chrome.storage.onChanged.addListener(changes=>{if(changes.state){state=changes.state.newValue;schedule();}});
  globalThis.SubscriptionsEmbed={setEnabled(value){
    if(value===enabled){if(value)schedule();return;}
    enabled=value;
    if(!enabled){clearTimeout(timer);observer?.disconnect();cleanupCards();toolbar?.remove();toolbar=null;closeDialog();style?.remove();style=null;return;}
    style=node('style');style.textContent=`.subscriptions-native-hidden{display:none!important}.subscriptions-native-inline{display:inline-flex;align-items:center;gap:6px;margin-inline-start:8px;white-space:nowrap;font-size:12px;color:var(--yt-spec-text-secondary,#aaa)}.subscriptions-native-inline button{color:inherit;background:none;border:0;cursor:pointer;padding:0;font:inherit}.subscriptions-native-inline input{width:13px;height:13px;accent-color:#aaa}.subscriptions-native-toolbar{display:flex;align-items:center;flex-wrap:wrap;gap:10px;padding:12px 24px;color:var(--yt-spec-text-primary,#eee);font:13px Roboto,Arial,sans-serif}.subscriptions-native-toolbar button,.subscriptions-native-toolbar select,.subscriptions-native-dialog button{border:0;border-radius:14px;padding:7px 12px;background:var(--yt-spec-badge-chip-background,#272727);color:inherit;cursor:pointer}.subscriptions-native-dialog{max-width:620px;width:calc(100% - 60px);max-height:75vh;overflow:auto;border:1px solid #555;border-radius:12px;padding:20px;background:var(--yt-spec-base-background,#0f0f0f);color:var(--yt-spec-text-primary,#eee);font:14px/1.5 Roboto,Arial,sans-serif}.subscriptions-native-dialog::backdrop{background:#0009}.subscriptions-native-dialog h2{font-size:18px}.subscriptions-native-row{display:flex;justify-content:space-between;gap:12px;padding:10px 0}.subscriptions-native-row label{display:flex;gap:8px}.subscriptions-native-row button{flex-shrink:0}`;
    document.documentElement.append(style);observer=new MutationObserver(schedule);observe();
    Promise.all([import(chrome.runtime.getURL('core.js')),chrome.storage.local.get('state')]).then(([module,data])=>{core=module;state={...core.defaults(),...data.state,settings:{...core.defaults().settings,...data.state?.settings}};schedule();}).catch(fail);
  }};
})();
