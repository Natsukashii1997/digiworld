// Synthetic executable only. It never reads a real target or Agent config.
import { setTimeout as delay } from 'node:timers/promises';
import { readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
const args = process.argv.slice(2), ev = 'ev_' + 'a'.repeat(64);
const operation = args.find(x => ['doctor','analyze-javascript-application','trace-application-feature','list-browser-targets','analyze-web-bundle'].includes(x));
const input = args[args.indexOf(operation) + 1] || '';
if (operation === 'doctor') {
  const bytes = Number(args.find(a=>a.startsWith('--doctor-bytes='))?.split('=')[1] || 72*1024);
  const body = { healthy:false, diagnostics:'x'.repeat(bytes), identity: { registrations: ['claude_code','codex'].map(client => ({ client, state:'aligned', command:['npx','-y','rea-agents@6.4.0'] })), skill:{installed_version:41,state:'aligned'}, expected_skill_version:41 } };
  if(args.includes('--doctor-missing-identity'))delete body.identity;
  console.log(args.includes('--doctor-invalid') ? '{invalid JSON' : JSON.stringify(body));
  process.exitCode = 1; // Real doctor can be unhealthy while registrations are aligned.
} else if (operation === 'list-browser-targets') {
  console.log(JSON.stringify({ normalized_result:{targets:[{target_id:'page-one',type:'page',url:'https://example.test/page'}]} }));
} else if (operation === 'analyze-web-bundle') {
  console.log(JSON.stringify({evidence_id:ev,normalized_result:{capture:{scripts_observed:3,scripts_analyzed:2},completeness:{status:'partial'},unknowns:[{}],limitations:['synthetic']}}));
} else if (operation === 'trace-application-feature') {
  const data = JSON.parse(await readFile(input,'utf8'));
  process.stderr.write(JSON.stringify({rea_progress:{phase:'trace_application_feature',completed:0,total:1,message:'Tracing synthetic feature'}})+'\n');
  process.stderr.write(JSON.stringify({rea_progress:{phase:'trace_application_feature',completed:1,total:1,message:'Tracing synthetic feature'}})+'\n');
  if (data.seed.match !== 'contains' || data.application.evidence_id !== ev) process.exit(8);
  console.log(JSON.stringify({evidence_id:ev,normalized_result:{summary:{matched_seeds:2},graph:{nodes:[{identity:{path:'/fixture/copy.js'},observations:[{properties:{channel:'clipboard'}}]}]},limitations:[]}}));
} else if (operation === 'analyze-javascript-application') {
  process.stderr.write(JSON.stringify({rea_progress:{phase:'parse',completed:1,total:2,message:'合成进度'}})+'\n');
  const total = input.includes('progress') ? 3000 : 3;
  for(let n=1;n<=total;n++){
    const line=JSON.stringify({rea_progress:{phase:'parse_javascript_source',completed:0,total:1,message:`Parsing /synthetic/source-${n}.js (${n}/${total})`}})+'\n';
    process.stderr.write(line.slice(0,17));process.stderr.write(line.slice(17));
    if(input.includes('ui') && n===2)await delay(1200);
  }
  if(input.includes('progress-invalid')){
    process.stderr.write(JSON.stringify({rea_progress:{phase:'parse_javascript_source',completed:0,total:1,message:'bad source (9/3)'}})+'\n');
    process.stderr.write('plain diagnostic\n{broken JSON\n');
  }
  // 孙进程先装好忽略TERM的处理器，再原子写出自己的pid；测试读到即可确定它已在忽略TERM。
  if (input.includes('tree')) { spawn(process.execPath, ['-e', "const fs=require('fs'),p=process.argv[1];process.on('SIGTERM',()=>{});fs.writeFileSync(p+'.tmp',String(process.pid));fs.renameSync(p+'.tmp',p);setInterval(()=>{},1000)", input+'.pid'], {stdio:'ignore'}); await delay(30000); }
  if (input.includes('slow')) { process.stderr.write('x'.repeat(300000)+'\n'); await delay(30000); }
  if (input.includes('fail')) { console.log(JSON.stringify({code:'SYNTHETIC_BAD_TARGET',message:'合成 REA 错误'})); process.exitCode=1; }
  else {
    process.stdout.write('{"ignored_source":"');
    for(let i=0;i<128;i++) if(!process.stdout.write('z'.repeat(65536))) await new Promise(resolve=>process.stdout.once('drain',resolve));
    process.stdout.write('","evidence_id":'+JSON.stringify(ev)+',"normalized_result":'+JSON.stringify({root_artifact_sha256:'b'.repeat(64),statistics:{modules:0,parsed_javascript_files:3},summary:{ipc:{literal_channels:3},native_addon_bindings:1},limitations:['unknown server'],integrity_contradictions:[{}]})+'}');
  }
} else { console.error('unknown synthetic operation'); process.exitCode=2; }
