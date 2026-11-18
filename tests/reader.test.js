import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const context={URL};vm.runInNewContext(readFileSync(new URL('../extension/reader.js',import.meta.url),'utf8'),context);
function node(text='',attributes={}){return {textContent:text,getAttribute:key=>attributes[key]??null};}
function card({href='/@alpha',title='Example',video='abcdefghijk',age='2 hours ago',short=false,badge='12:34'}={}){
 const a=node('Alpha',{href}),h=node(title,{href:short?`/shorts/${video}`:`/watch?v=${video}`}),date=node('2h ago',{'aria-label':age});
 return {querySelectorAll:selector=>selector==='a[href]'?[h,a]:selector.startsWith('.ytBadgeShapeText')?[node(badge)]:[date],querySelector:selector=>selector.startsWith('h3 ')?h:selector.includes('BadgeShapeText')?node(badge):null};
}
const read=cards=>context.SubspaceReader.read({querySelectorAll:()=>cards});
test('current renderer supports direct /channel/ links without legacy #channel-name wrapper',()=>{const result=read([card({href:'/channel/UCZaFfDBBCqmYdfp6DJl0cRw'})]);assert.equal(result.videos.length,1);assert.equal(result.channels[0].id,'UCZaFfDBBCqmYdfp6DJl0cRw');});
test('absolute YouTube handles resolve while unrelated external links are rejected',()=>{assert.equal(read([card({href:'https://www.youtube.com/@Alpha'})]).channels[0].id,'/@alpha');assert.equal(read([card({href:'https://evil.example/@Alpha'})]).videos.length,0);});
test('loading skeleton titles are not imported as empty videos',()=>{const result=read([card({title:''})]);assert.equal(result.videos.length,0);assert.equal(result.diagnostics.missingTitle,1);});
test('duplicate renderer matches produce one video and preserve age/duration',()=>{const result=read([card(),card()]);assert.equal(result.videos.length,1);assert.equal(result.videos[0].ageLabel,'2 hours ago');assert.equal(result.videos[0].duration,'12:34');});

test('reader classifies Shorts links and premiere metadata',()=>{
 assert.equal(read([card({short:true})]).videos[0].isShort,true);
 assert.equal(read([card({badge:'Shorts'})]).videos[0].isShort,true);
 assert.equal(read([card({age:'Premiered 2 hours ago'})]).videos[0].isPremiere,true);
 assert.equal(read([card({badge:'PREMIERE'})]).videos[0].isPremiere,true);
 assert.equal(read([card()]).videos[0].isPremiere,false);
 assert.equal(read([card()]).videos[0].isShort,false);
});
test('reader captures both linked collaborators and their channel records',()=>{
 const title=node('Collaboration',{href:'/watch?v=abcdefghijk'});
 const first=node('Secular Talk',{href:'/@SecularTalk'});
 const second=node('Good Politic Guy',{href:'/@GoodPoliticGuy'});
 const date=node('10h ago',{'aria-label':'10 hours ago'});
 const collaboration={querySelectorAll:selector=>selector==='a[href]'?[title,first,second]:selector.startsWith('.ytBadgeShapeText')?[]:[date],querySelector:selector=>selector.startsWith('h3 ')?title:null};
 const result=read([collaboration]);
 assert.deepEqual([...result.videos[0].collaboratorIds],['/@seculartalk','/@goodpoliticguy']);
 assert.deepEqual([...result.channels.map(c=>c.name)],['Secular Talk','Good Politic Guy']);
});
