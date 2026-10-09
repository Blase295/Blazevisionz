import { handle } from '../../src/api.mjs';
export const onRequest = ({request,env}) => handle(request,env);
