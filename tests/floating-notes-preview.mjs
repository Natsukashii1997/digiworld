// Development-only preview: fixture injects synthetic discovery/AI/calendar adapters.
import {fixture} from './fixture.mjs';
import {seed} from '../src/store.js';
import {writeFile} from 'node:fs/promises';
const app=await fixture();const state=seed();state.notes=[{id:'native-synthetic',at:'2026-10-15T08:00:00Z',text:'桌面便签合成验证\n输入内容仅用于隔离测试。',format:'md1'}];await app.repository.write(state,{initialize:true});
const status={url:app.url+'/',directory:app.directory,pid:process.pid};if(process.env.FLOAT_PREVIEW_STATUS)await writeFile(process.env.FLOAT_PREVIEW_STATUS,JSON.stringify(status));console.log(JSON.stringify(status));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{await app.close();process.exit(0);});process.stdin.resume();
