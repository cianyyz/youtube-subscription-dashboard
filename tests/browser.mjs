import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.goto('http://127.0.0.1:5173');
 await page.getByRole('button',{name:'Settings',exact:true}).click();
 await page.getByRole('button',{name:'Import subscription data',exact:true}).click();
 const now=Date.now(),capture={channels:[{id:'/@alpha',name:'Alpha'},{id:'/@beta',name:'Beta'}],videos:[{id:'abcdefghijk',channelId:'/@alpha',title:'First upload',published:now-3600000,duration:'12:00'},{id:'lmnopqrstuv',channelId:'/@alpha',title:'Second upload',published:now-7200000},{id:'12345678901',channelId:'/@beta',title:'Third upload',published:now-10800000}]};
 await page.getByRole('textbox',{name:'Subscription data'}).fill(JSON.stringify(capture));await page.getByRole('button',{name:'Import',exact:true}).click();
 assert.equal(await page.locator('.video-card').count(),2);assert.equal(await page.locator('.sidebar,.brand').count(),0);
 assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement).backgroundColor),'rgb(15, 15, 15)');
 await page.getByRole('button',{name:'+ 1 more video in this stack',exact:true}).click();
 await page.getByRole('checkbox',{name:'Select Second upload',exact:true}).uncheck();
 await page.getByRole('button',{name:'2 selected',exact:true}).waitFor();
 await page.getByRole('button',{name:'Hide First upload',exact:true}).click();
 await page.getByRole('button',{name:'Settings',exact:true}).click();await page.getByRole('button',{name:'Hidden videos (1)',exact:true}).click();
 await page.getByRole('button',{name:'Restore First upload',exact:true}).click();await page.getByRole('button',{name:'Back to feed',exact:true}).click();
 await page.reload();await page.getByRole('button',{name:'2 selected',exact:true}).waitFor();
 await page.getByRole('button',{name:'Settings',exact:true}).click();await page.getByRole('button',{name:'Channel groups',exact:true}).click();
 await page.locator('#group-name').fill('Together');await page.locator('[name="channel"]').nth(0).check();await page.locator('[name="channel"]').nth(1).check();await page.getByRole('button',{name:'Create group',exact:true}).click();await page.getByRole('button',{name:'Close',exact:true}).click();
 assert.equal(await page.locator('.video-card').count(),1);
 await page.context().route('https://www.youtube.com/**',route=>route.fulfill({body:'YouTube queue destination'}));
 const pending=page.waitForEvent('popup');await page.getByRole('button',{name:'Play selected',exact:true}).click();const popup=await pending;await popup.waitForLoadState();
 assert.equal(new URL(popup.url()).pathname,'/watch_videos');assert.equal(new URL(popup.url()).searchParams.get('video_ids'),'abcdefghijk,12345678901');await popup.close();
 await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 assert.deepEqual(errors,[]);console.log('Minimal dashboard browser flows passed.');
}finally{await browser.close();}
