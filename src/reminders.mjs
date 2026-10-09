import { maintenance } from './operations.mjs';
export default {async scheduled(controller,env,ctx){ctx.waitUntil(maintenance(env));},async fetch(){return new Response('Not found',{status:404});}};
