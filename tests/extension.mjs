import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const profile=await mkdtemp(path.join(os.tmpdir(),'subscriptions-test-'));
const context=await chromium.launchPersistentContext(profile,{executablePath:process.env.CHROME_PATH||'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--enable-unsafe-extension-debugging'],ignoreDefaultArgs:['--disable-extensions']});
try{
 const cdp=await context.browser().newBrowserCDPSession();const {id}=await cdp.send('Extensions.loadUnpacked',{path:path.resolve('extension')});
 const root=`chrome-extension://${id}/index.html`;
 await context.route('https://www.youtube.com/**',route=>{const url=new URL(route.request().url());const cards=['abcdefghijk','lmnopqrstuv'].map((id,i)=>`<yt-lockup-view-model><yt-thumbnail-view-model><img src="https://i.ytimg.com/vi/${id}/hqdefault.jpg"><span class="ytBadgeShapeText">12:00</span></yt-thumbnail-view-model><h3><a href="/watch?v=${id}">Upload ${i+1}</a></h3><a href="/@alpha">Alpha</a><span aria-label="${i+1} hours ago">${i+1}h ago</span><span aria-label="10 thousand views">10K</span></yt-lockup-view-model>`).join('');return route.fulfill({contentType:'text/html',body:`<!doctype html><html><head><script>history.replaceState(null,'',location.pathname)</script></head><body>${url.pathname==='/feed/subscriptions'?cards:'YouTube fixture'}</body></html>`});});
 const page=await context.newPage();await page.goto(root);await page.getByRole('button',{name:'Read YouTube subscriptions'}).waitFor();
 const collector=await context.newPage();await collector.goto('https://www.youtube.com/feed/subscriptions?subspace_sync=1');
 await collector.getByRole('button',{name:'Use loaded videos'}).click();await collector.waitForURL(root);await collector.locator('.video-card').waitFor();
 assert.equal(await collector.locator('.video-card').count(),1);await collector.getByRole('button',{name:'2 selected'}).waitFor();
 const queueEvent=context.waitForEvent('page');await collector.getByRole('button',{name:'Play selected'}).click();const queue=await queueEvent;await queue.waitForLoadState();assert.equal(new URL(queue.url()).searchParams.get('video_ids'),'abcdefghijk,lmnopqrstuv');assert.equal(await queue.locator('#subspace-queue').count(),0);
 const home=await context.newPage();await home.goto('https://www.youtube.com/');await home.waitForURL(root);
 const spa=await context.newPage();await spa.goto('https://www.youtube.com/watch?v=abcdefghijk');await spa.evaluate(()=>{history.pushState(null,'','/feed/subscriptions');document.dispatchEvent(new Event('yt-navigate-finish'));});await spa.waitForURL(root);
 await collector.getByRole('button',{name:'Settings',exact:true}).click();await collector.getByRole('checkbox',{name:'Replace YouTube Home',exact:true}).uncheck();await collector.getByRole('button',{name:'Save',exact:true}).click();await collector.locator('dialog').waitFor({state:'hidden'});
 const native=await context.newPage();await native.goto('https://www.youtube.com/');await native.waitForTimeout(300);assert.equal(new URL(native.url()).pathname,'/');
 await collector.reload();assert.equal(await collector.locator('.video-card').count(),1);
 console.log('Extension fixtures passed: rendered subscription import, persistence, native playlist links, redirects, and settings.');
}finally{await context.close();await rm(profile,{recursive:true,force:true});}
