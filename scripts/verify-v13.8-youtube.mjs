import fs from 'node:fs/promises';
import { chromium } from 'playwright';

const browser = await chromium.launch({ args: ['--no-sandbox'], ...((process.env.ROCKBRAZIL_BROWSER_PROXY || process.env.HTTPS_PROXY) ? {proxy:{server:process.env.ROCKBRAZIL_BROWSER_PROXY || process.env.HTTPS_PROXY,bypass:'localhost,127.0.0.1'}} : {}) });
const context = await browser.newContext({viewport:{width:390,height:844}});
const page = await context.newPage();
const networkFailures = [], dialogs = [], responses = [];
page.on('requestfailed', request => { if (/youtube|googlevideo|ytimg/.test(request.url())) networkFailures.push({url:request.url().split('?')[0],failure:request.failure()?.errorText}); });
page.on('response', response => { if (/youtube|googlevideo/.test(response.url())) responses.push({url:response.url().split('?')[0],status:response.status()}); });
page.on('dialog', async dialog => { dialogs.push(dialog.message()); await dialog.dismiss(); });
await page.goto(process.env.ROCKBRAZIL_URL || 'http://localhost:5173/RockBrazil/',{waitUntil:'domcontentloaded'});
await page.waitForFunction(()=>window.__ROCKBRAZIL_GAME__);
await page.locator('#screen-login').waitFor({state:'visible'});
const songs = await page.evaluate(()=>window.__ROCKBRAZIL_GAME__.library.getSongs().filter(s=>s.isInternational).map(s=>({id:s.id,title:s.title,videoId:s.youtubeVideoId})));
const results=[];
for (const song of songs) {
  await page.evaluate(id=>{
    const game=window.__ROCKBRAZIL_GAME__;
    game.ui.onPlayAsGuestClicked();
    let button=document.getElementById('test-start-youtube');
    if (!button) {button=document.createElement('button');button.id='test-start-youtube';button.style='position:fixed;inset:0 auto auto 0;z-index:20000;background:white;color:black;padding:12px';button.textContent='Iniciar teste real YouTube';document.body.append(button);}
    button.onclick=()=>{game.startNewMatch(game.library.getSongById(id),'EXPERT').catch(error=>console.error(error));};
  },song.id);
  await page.click('#test-start-youtube');
  const samples=[];
  for(let i=0;i<20;i++) {
    await page.waitForTimeout(1000);
    const sample=await page.evaluate(()=>{const g=window.__ROCKBRAZIL_GAME__;return {state:g.state,playback:g.ytPlayer.getPlaybackState(),time:g.ytPlayer.getCurrentTime(),raw:g.ytPlayer.player?.getCurrentTime?.() ?? null,nativeState:g.ytPlayer.player?.getPlayerState?.() ?? null,api:!!window.YT?.Player,ready:g.ytPlayer.isReadyState(),clock:g.masterClock.getTime(),misses:g.engine.getStats().missCount};});
    samples.push(sample);
    if(await page.locator('#btn-unblock-audio').isVisible()) await page.click('#btn-unblock-audio');
    if(i>2 && sample.state==='SONG_SELECT') break;
  }
  await page.screenshot({path:`reports/v13.8/youtube-${song.id}.png`});
  const advanced=samples.filter(s=>s.nativeState===1 && s.raw>0);
  const confirmed=advanced.length>=2 && advanced.at(-1).raw>advanced[0].raw;
  results.push({...song,confirmed,samples});
  console.log(JSON.stringify({song:song.title,confirmed,last:samples.at(-1),failures:networkFailures.length,dialogs:dialogs.slice(-1)}));
  await page.evaluate(()=>window.__ROCKBRAZIL_GAME__.ui.onUnblockCancelClicked());
}
await fs.writeFile('reports/v13.8/youtube-browser-report.json',JSON.stringify({description:'Real YouTube/API attempt in headless Chromium. No mock, no autoplay bypass, no media download/extraction. Positive raw-time progression required; listening and physical devices still require manual validation.',proxyUsed:!!(process.env.ROCKBRAZIL_BROWSER_PROXY || process.env.HTTPS_PROXY),results,networkFailures,dialogs,responses},null,2));
await browser.close();
