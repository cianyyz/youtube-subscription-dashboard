import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {parseHTML} from 'linkedom';
import {defaults,mergeCapture,cardsFor,selectedVideos,youtubeQueueURL,relativePublished} from '../extension/core.js';

const readerSource=readFileSync(new URL('../extension/reader.js',import.meta.url),'utf8');
const card=(id,author,age,{collaborator='',premiere=false}={})=>`
<yt-lockup-view-model>
  <h3><a href="/watch?v=${id}">${id}</a></h3>
  <span class="byline"><a href="/@${author}">${author}</a>${collaborator?` and <a href="/@${collaborator}">${collaborator}</a>`:''}</span>
  <span class="ytContentMetadataViewModelMetadataText">${premiere?'Premiered ':''}${age} hours ago</span>
</yt-lockup-view-model>`;

test('collaboration is counted once; two other valid videos enter the same playlist; premiere is ignored',()=>{
  const now=Date.now();
  const {document}=parseHTML(`<main>
    ${card('aaaaaaaaaaa','SecularTalk',10,{collaborator:'GoodPoliticGuy'})}
    ${card('bbbbbbbbbbb','SecularTalk',8)}
    ${card('ccccccccccc','GoodPoliticGuy',6)}
    ${card('ddddddddddd','GoodPoliticGuy',5,{premiere:true})}
  </main>`);
  const context={URL,document};vm.runInNewContext(readerSource,context);
  const capture=context.SubspaceReader.read(document,now);
  assert.equal(capture.videos.length,4);
  assert.deepEqual([...capture.videos[0].collaboratorIds],['/@seculartalk','/@goodpoliticguy']);
  const normalized={...capture,videos:capture.videos.map(v=>({...v,published:relativePublished(v.ageLabel,now),approximate:true}))};
  const state=mergeCapture({...defaults(),groups:[{id:'news',name:'News'}],channels:[{id:'/@goodpoliticguy',name:'GoodPoliticGuy',groupId:'news'}]},normalized,now);
  const stacks=cardsFor(state,{now});
  assert.equal(stacks.length,1);
  assert.deepEqual(stacks[0].videos.map(v=>v.id),['ccccccccccc','bbbbbbbbbbb','aaaaaaaaaaa']);
  assert.equal(stacks[0].videos.filter(v=>v.id==='aaaaaaaaaaa').length,1);
  assert.deepEqual(cardsFor(state,{now,groupId:'news'})[0].videos.map(v=>v.id),['ccccccccccc','aaaaaaaaaaa']);
  const queue=selectedVideos(state,stacks[0].videos,now);
  assert.equal(new URL(youtubeQueueURL(queue)).searchParams.get('video_ids'),'ccccccccccc,bbbbbbbbbbb,aaaaaaaaaaa');
  state.excluded['aaaaaaaaaaa']=true;
  const withoutCollaboration=selectedVideos(state,stacks[0].videos,now);
  assert.equal(new URL(youtubeQueueURL(withoutCollaboration)).searchParams.get('video_ids'),'ccccccccccc,bbbbbbbbbbb');
});

test('YouTube text-only collaboration byline is read using sidebar and saved channel identities',()=>{
  const now=Date.now();
  const {document}=parseHTML(`<html><body>
    <ytd-guide-entry-renderer><a href="/@SecularTalk" title="Secular Talk">Secular Talk</a></ytd-guide-entry-renderer>
    <ytd-browse page-subtype="subscriptions">
      <yt-lockup-view-model>
        <h3><a href="/watch?v=i4_F9q7WWbw">CHAOS ERUPTS In Brazil</a></h3>
        <div class="ytContentMetadataViewModelMetadataRow">
          <span class="ytContentMetadataViewModelMetadataText">Secular Talk</span>
          <span aria-label="Verified"></span>
          <span class="ytContentMetadataViewModelMetadataText">and Good Politic Guy</span>
          <span class="ytContentMetadataViewModelMetadataText" aria-label="54 thousand views">54K</span>
          <span class="ytContentMetadataViewModelMetadataText" aria-label="11 hours ago">11h ago</span>
        </div>
      </yt-lockup-view-model>
      ${card('bbbbbbbbbbb','SecularTalk',8)}
      ${card('ccccccccccc','GoodPoliticGuy',6)}
    </ytd-browse>
  </body></html>`);
  const context={URL,document};vm.runInNewContext(readerSource,context);
  const known=[{id:'/@goodpoliticguy',name:'Good Politic Guy',groupId:'news'}];
  const capture=context.SubspaceReader.read(document.querySelector('ytd-browse'),now,undefined,known);
  assert.equal(capture.diagnostics.missingChannel,0);
  assert.equal(capture.videos.length,3);
  assert.deepEqual([...capture.videos[0].collaboratorIds],['/@seculartalk','/@goodpoliticguy']);
  assert.deepEqual([...capture.videos[0].collaboratorNames],['Secular Talk','Good Politic Guy']);
  const normalized={...capture,videos:capture.videos.map(v=>({...v,published:relativePublished(v.ageLabel,now)}))};
  const state=mergeCapture({...defaults(),channels:known,groups:[{id:'news',name:'News'}]},normalized,now);
  const stack=cardsFor(state,{now})[0];
  assert.deepEqual(stack.videos.map(v=>v.id),['ccccccccccc','bbbbbbbbbbb','i4_F9q7WWbw']);
  assert.equal(new URL(youtubeQueueURL(selectedVideos(state,stack.videos,now))).searchParams.get('video_ids'),'ccccccccccc,bbbbbbbbbbb,i4_F9q7WWbw');
});
