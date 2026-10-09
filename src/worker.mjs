import {handle} from './api.mjs';
import {maintenance} from './operations.mjs';
export default {
  async fetch(request,env) {
    const path=new URL(request.url).pathname;
    if(path.startsWith('/api/'))return handle(request,env);
    return env.ASSETS.fetch(request);
  },
  async scheduled(controller,env,ctx) {ctx.waitUntil(maintenance(env));}
};
