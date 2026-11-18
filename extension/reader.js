// Runs in the extension's isolated content-script world. Reads rendered cards only.
(() => {
  function channelLinks(card) {
    const found=new Map();
    for(const link of card.querySelectorAll('a[href]')){
      try {
        const url=new URL(link.getAttribute('href'),'https://www.youtube.com');
        if(url.hostname!=='www.youtube.com'&&url.hostname!=='youtube.com')continue;
        const match=url.pathname.match(/^\/(?:@[^/?#]+|channel\/UC[\w-]{22})\/?$/u);
        if(match&&link.textContent.trim()){
          const path=url.pathname.replace(/\/$/,'');
          const id=path.startsWith('/channel/')?path.split('/')[2]:path.toLowerCase();
          if(!found.has(id))found.set(id,{id,name:link.textContent.trim(),link,path,url:url.href});
        }
      }catch{}
    }
    return [...found.values()];
  }
  const normalizeName=name=>String(name||'').trim().replace(/\s+/g,' ').toLocaleLowerCase();
  function bylineNames(card) {
    const row=card.querySelector('.ytContentMetadataViewModelMetadataRow, #channel-name');
    if(!row)return [];
    const parts=[...row.querySelectorAll('.ytContentMetadataViewModelMetadataText, #text')];
    const names=[];
    for(const part of parts){
      const text=part.textContent.trim();
      if(part.getAttribute('aria-label')?.match(/\b(?:views?|ago)\b/i)||/\bago$/i.test(text)||/^\d[\d,.]*\s*[KMB]?$/i.test(text))break;
      for(const name of text.replace(/^and\s+/i,'').split(/\s+and\s+/i))if(name&&!/^\d+\s+more$/i.test(name))names.push(name);
    }
    return names;
  }
  function read(root=document,now=Date.now(),onVideo,knownChannels=[]) {
    const channels=new Map(),videos=new Map();
    const byName=new Map();
    for(const channel of knownChannels)if(channel?.id&&channel?.name)byName.set(normalizeName(channel.name),{id:channel.id,name:channel.name,url:channel.url||'',avatar:channel.avatar||''});
    const page=root.ownerDocument||(typeof document!=='undefined'?document:null);
    for(const link of page?.querySelectorAll('ytd-guide-entry-renderer a[href], ytd-mini-guide-entry-renderer a[href]')||[]){
      const name=link.getAttribute('title')||link.querySelector('yt-formatted-string.title')?.textContent?.trim();
      const href=link.getAttribute('href');
      try{const url=new URL(href,'https://www.youtube.com');if(!name||url.hostname!=='www.youtube.com')continue;
        const path=url.pathname.replace(/\/$/,'');
        if(!/^\/(?:@[^/?#]+|channel\/UC[\w-]{22})$/u.test(path))continue;
        const id=path.startsWith('/channel/')?path.split('/')[2]:path.toLowerCase();
        byName.set(normalizeName(name),{id,name,url:url.href,avatar:''});
      }catch{}
    }
    const cards=root.querySelectorAll('yt-lockup-view-model, ytd-rich-grid-media, ytd-grid-video-renderer, ytd-video-renderer');
    const diagnostics={cards:cards.length,missingTitle:0,missingChannel:0,invalidVideo:0};
    for(const card of cards){
      const title=card.querySelector('h3 a[href*="/watch"], a#video-title[href*="/watch"], a#video-title-link[href*="/watch"], h3 a[href*="/shorts/"], a#video-title[href*="/shorts/"], a#video-title-link[href*="/shorts/"]');
      if(!title?.textContent.trim()){diagnostics.missingTitle++;continue;}
      const names=bylineNames(card);
      const collaborators=channelLinks(card);
      for(const name of names){const known=byName.get(normalizeName(name));if(known&&!collaborators.some(c=>c.id===known.id))collaborators.push(known);}
      const author=collaborators[0];
      if(!author){diagnostics.missingChannel++;continue;}
      let id,isShort=false;try{const link=new URL(title.getAttribute('href'),'https://www.youtube.com');isShort=link.pathname.startsWith('/shorts/');id=isShort?link.pathname.split('/')[2]:link.searchParams.get('v');}catch{}
      if(!/^[\w-]{11}$/.test(id||'')){diagnostics.invalidVideo++;continue;}
      const channelId=author.id;
      const image=card.querySelector('yt-thumbnail-view-model img, ytd-thumbnail img');
      const avatar=card.querySelector('yt-avatar-shape img, #avatar img')?.src||'';
      const metadata=[...card.querySelectorAll('[aria-label], .ytContentMetadataViewModelMetadataText, #metadata-line span')];
      const age=metadata.map(n=>n.getAttribute('aria-label')||n.textContent.trim()).find(t=>/\bago\s*$/i.test(t))||'';
      const labels=metadata.map(n=>n.getAttribute('aria-label')||n.textContent.trim());
      const badges=[...card.querySelectorAll('.ytBadgeShapeText, ytd-badge-supported-renderer, ytd-thumbnail-overlay-time-status-renderer')].map(n=>n.textContent.trim());
      const isPremiere=[...labels,...badges].some(t=>/\bpremier(?:e|es|ed|ing)\b/i.test(t));
      isShort=isShort||badges.some(t=>/^shorts?$/i.test(t));
      const progress=card.querySelector('yt-thumbnail-overlay-progress-bar-view-model [style*="width"], #progress');
      for(const collaborator of collaborators)channels.set(collaborator.id,{id:collaborator.id,name:collaborator.name,url:collaborator.url,avatar:collaborator.id===channelId?avatar||channels.get(channelId)?.avatar||'':channels.get(collaborator.id)?.avatar||''});
      const byline=author.link?.parentElement?.textContent?.trim()||'';
      const collaboratorNames=names.length?names:byline.includes(' and ')?byline.split(/\s+and\s+/i).map(name=>name.trim()).filter(Boolean):[];
      videos.set(id,{id,channelId,collaboratorIds:collaborators.map(c=>c.id),collaboratorNames,isShort,isPremiere,title:title.textContent.trim(),thumbnail:image?.currentSrc||image?.src||'',duration:card.querySelector('.ytBadgeShapeText, ytd-thumbnail-overlay-time-status-renderer #text')?.textContent.trim()||'',ageLabel:age,views:card.querySelector('[aria-label$="views"]')?.textContent.trim()||card.querySelector('#metadata-line span')?.textContent.trim()||'',verified:!!card.querySelector('[aria-label="Verified"], ytd-badge-supported-renderer'),progress:parseFloat(progress?.style.width)||0});
      onVideo?.(card,videos.get(id));
    }
    return {channels:[...channels.values()],videos:[...videos.values()],capturedAt:now,source:'youtube-subscriptions',diagnostics};
  }
  globalThis.SubspaceReader={read};
})();
