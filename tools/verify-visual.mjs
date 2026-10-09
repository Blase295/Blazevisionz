import {chromium} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {mkdir,writeFile} from 'node:fs/promises';
const browser=await chromium.launch();
const results=[];
await mkdir('test-results',{recursive:true});
for(const width of [375,768,1440]){
 const context=await browser.newContext({viewport:{width,height:900}});const page=await context.newPage();
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const response=await page.goto(process.env.TEST_URL||'https://blazevisionz-preview.blazevisionz.workers.dev',{waitUntil:'domcontentloaded',timeout:20000});
 const axe=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
 const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
 await page.getByRole('button',{name:'BOOK SIGNATURE'}).click();
 const selected=await page.locator('#package').inputValue();
 const disabled=await page.locator('#checkout').isDisabled();
 await page.screenshot({path:`test-results/preview-${width}.png`,fullPage:true});
 results.push({width,status:response.status(),https:response.url().startsWith('https:'),overflow,errors,selected,checkoutDisabled:disabled,accessibility:axe.violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.map(n=>n.target)}))});
 await context.close();
}
await browser.close();await writeFile('test-results/visual-results.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));
if(results.some(r=>r.status!==200||r.overflow||r.errors.length||r.accessibility.length||!r.checkoutDisabled||r.selected!=='signature'))process.exitCode=1;


