import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
const browser=await chromium.launch();const page=await browser.newPage();
const base=process.env.TEST_URL||'https://blazevisionz-preview.blazevisionz.workers.dev';
for(const [path,method] of [['/api/availability','GET'],['/api/admin','GET'],['/api/client','GET'],['/api/bookings','POST'],['/api/webhook','POST']]){
 const response=await page.request.fetch(base+path,{method,maxRedirects:0,headers:method==='POST'?{'Content-Type':'application/json',Origin:base}:{},...(method==='POST'?{data:'{}'}:{})});
 const contentType=response.headers()['content-type']||'';const body=contentType.includes('application/json')?await response.json():null;const location=response.headers().location||'';
 console.log(JSON.stringify({path,status:response.status(),body,accessRedirect:location.includes('blazevisionz.cloudflareaccess.com')}));
 if(path==='/api/availability'){assert.equal(response.status(),200);assert.equal(body.paymentsEnabled,false);}
 if(path==='/api/admin')assert.ok([302,401,403].includes(response.status()));
 if(path==='/api/client')assert.equal(response.status(),401);
 if(['/api/bookings','/api/webhook'].includes(path))assert.equal(response.status(),503);
}
await browser.close();
