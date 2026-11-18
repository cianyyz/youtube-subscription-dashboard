(() => {
  const send=async payload=>{const result=await chrome.runtime.sendMessage(payload);if(!result?.ok)throw new Error(result?.error||'The extension could not respond.');return result.data;};
  const SYNC_KEY='subspace-sync-pending';
  // Latch before YouTube or another extension canonicalizes the URL.
  const initialURL=new URL(location.href);
  if(initialURL.searchParams.has('subspace_sync'))sessionStorage.setItem(SYNC_KEY,String(Date.now()));
  if(initialURL.searchParams.has('subspace_native'))sessionStorage.setItem('subspace-native','1');
  let importRequested=Date.now()-Number(sessionStorage.getItem(SYNC_KEY)||0)<15*60000;
  let settings,redirecting=false,panel,timer,stable=0,working=false,passes=0,cancelled=false;
  const seenVideos=new Map(),seenChannels=new Map();
  let lastFingerprint='';
  const url=()=>new URL(location.href);
  const bypass=()=>importRequested||url().searchParams.has('subspace_native')||sessionStorage.getItem('subspace-native')==='1';
  async function route(){
    if(panel&&location.pathname!=='/feed/subscriptions'){panel.remove();panel=null;clearTimeout(timer);}
    if(!settings)return; // Page mode must be known before mounting or redirecting.
    const subscriptions=location.pathname==='/feed/subscriptions'||location.pathname==='/subscriptions';
    const embed=subscriptions&&settings.replaceSubscriptions&&!bypass();
    globalThis.SubscriptionsEmbed.setEnabled(embed);
    if(embed)return;
    if(document.body&&location.pathname==='/feed/subscriptions'&&importRequested){startImport();return;}
    if(!bypass()&&!redirecting&&(location.pathname==='/'&&settings.replaceHome)){redirecting=true;try{await send({type:'OPEN_DASHBOARD'});}catch{redirecting=false;}}
  }
  // The background remembers the import tab independently of page URL changes,
  // including redirects that happen before this content script is injected.
  send({type:'GET_PAGE_MODE',requestedImport:importRequested}).then(mode=>{
    importRequested=importRequested||mode.importPending;
    if(importRequested)sessionStorage.setItem(SYNC_KEY,String(Date.now()));
    settings={replaceHome:true,replaceSubscriptions:true,...mode.settings};route();
  }).catch(error=>{
    // Keep YouTube usable if a stale content script outlives an extension update.
    console.warn('Subscriptions:',error.message);
    if(importRequested){settings={replaceHome:false,replaceSubscriptions:false};route();}
  });
  chrome.storage.onChanged.addListener(changes=>{if(changes.state){settings=changes.state.newValue?.settings;route();}});
  function startImport(){
    if(panel)return;
    panel=document.createElement('div');panel.id='subscriptions-import';panel.style.cssText='position:fixed;right:20px;bottom:20px;z-index:2147483647';
    const root=panel.attachShadow({mode:'open'});
    root.innerHTML='<style>*{box-sizing:border-box}section{background:#202020;color:#eee;font:14px/1.5 Arial,sans-serif;border:1px solid #444;border-radius:12px;padding:18px;width:330px;box-shadow:0 8px 35px #0007}p{color:#bbb;margin:8px 0 14px}button{border:0;border-radius:18px;background:#eee;color:#111;padding:9px 14px;cursor:pointer;margin:4px 6px 0 0}button:disabled{opacity:.5}small{display:block;color:#aaa;margin-top:10px}</style><section><strong>Reading subscriptions</strong><p role="status">Waiting for your feed…</p><button id="import">Use loaded videos</button><button id="cancel">Cancel</button><small>Only your subscription cards are read.</small></section>';
    document.documentElement.append(panel);
    const status=root.querySelector('p'),button=root.querySelector('#import');
    root.querySelector('#cancel').onclick=async()=>{cancelled=true;clearTimeout(timer);importRequested=false;sessionStorage.removeItem(SYNC_KEY);sessionStorage.setItem('subspace-native','1');try{await send({type:'CANCEL_IMPORT'});}catch{}panel?.remove();panel=null;const u=url();u.searchParams.delete('subspace_sync');history.replaceState(null,'',u);};
    function capture(){
      const data=globalThis.SubspaceReader.read();
      for(const c of data.channels)seenChannels.set(c.id,{...seenChannels.get(c.id),...c,avatar:c.avatar||seenChannels.get(c.id)?.avatar||''});
      for(const v of data.videos){const old=seenVideos.get(v.id);seenVideos.set(v.id,{...old,...v,ageLabel:v.ageLabel||old?.ageLabel||'',thumbnail:v.thumbnail||old?.thumbnail||''});}
      return {...data,channels:[...seenChannels.values()],videos:[...seenVideos.values()]};
    }
    async function finish(){
      if(working)return;working=true;button.disabled=true;clearTimeout(timer);
      try{
        const data=capture();
        if(!data.videos.length)throw new Error(`No readable videos found (${data.diagnostics.cards} cards loaded). Wait for the feed to finish loading, then retry.`);
        status.textContent=`Importing ${data.videos.length} videos from ${data.channels.length} channels…`;
        const result=await send({type:'IMPORT_SUBSCRIPTIONS',capture:data});
        if(cancelled)return;
        if(!result.importedChannels)throw new Error('No channels were imported. Please reload the extension and retry.');
        status.textContent=`Imported ${result.importedVideos} videos from ${result.importedChannels} channels.`;
        // Clear the latch only after the import was saved successfully.
        importRequested=false;sessionStorage.removeItem(SYNC_KEY);
        panel?.remove();panel=null;
        const u=url();u.searchParams.delete('subspace_sync');history.replaceState(null,'',u);
        window.scrollTo({top:0,behavior:'instant'});
        if(settings.replaceSubscriptions)await route();else await send({type:'OPEN_DASHBOARD'});
      }catch(error){status.textContent=error.message;working=false;button.disabled=false;button.textContent='Retry import';}
    }
    button.onclick=finish;
    async function scan(){
      if(!panel||working)return;
      try{
        const data=capture();status.textContent=`${data.videos.length} videos from ${data.channels.length} channels found.`;
        const ready=data.videos.filter(v=>v.ageLabel);
        if(!ready.length){if(++passes<25){timer=setTimeout(scan,1000);return;}status.textContent=`Found ${data.diagnostics.cards} cards but no readable upload dates yet. Check that you are signed in and your feed is fully loaded, then retry.`;return;}
        const fingerprint=data.videos.map(v=>`${v.id}:${v.ageLabel}`).join('|');
        stable=fingerprint===lastFingerprint?stable+1:0;lastFingerprint=fingerprint;
        const cutoff=(settings?.windowHours||24)/24,last=ready.slice(-5);
        const pastWindow=last.length===5&&last.every(v=>{const m=v.ageLabel.match(/(\d+)\s*(day|week|month|year)/);return m&&(m[2]!=='day'||Number(m[1])>=cutoff);});
        if((pastWindow&&stable>=1)||stable>=4||++passes>=60||data.videos.length>=1500){await finish();return;}
        window.scrollTo({top:document.documentElement.scrollHeight,behavior:'instant'});timer=setTimeout(scan,1200);
      }catch(error){status.textContent=`Could not read the feed: ${error.message}. Reload the extension and this tab, then retry.`;button.disabled=false;}
    }
    timer=setTimeout(scan,1200);
  }
  document.addEventListener('yt-navigate-finish',()=>{route();});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{route();},{once:true});else route();
})();
