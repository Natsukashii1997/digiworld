import test from 'node:test';
import assert from 'node:assert/strict';
import {applyVideoAnalysis} from '../server/collection/lib/video-import.mjs';
import {analyzeSpeech} from '../server/collection/lib/speech-routing.mjs';

test('空文稿不标为识别完成，并保留引擎供读取端判断来源', () => {
  const note = applyVideoAnalysis({id:'sample'}, {duration:12,engine:'sensevoice-small',transcriptSegments:[]}, '/video.mp4');
  assert.equal(note.videoStatus, 'partial');
  assert.match(note.videoError, /没有识别到视频文稿/);
  assert.equal(note.transcriptEngine, 'sensevoice-small');
});

const result = engine => ({engine, duration:12, transcriptSegments:[{start:0,duration:10,text:'Open models democratize intelligence.'}]});
test('优先多语言识别，系统有结果也不抢先覆盖', async () => {
  const calls=[];
  const output=await analyzeSpeech({multilingual:async()=>{calls.push('multi');return result('sensevoice-small');},system:async()=>{calls.push('system');return result('system');},legacy:async()=>{calls.push('legacy');}});
  assert.deepEqual(calls,['multi']);assert.equal(output.engine,'sensevoice-small');
});
test('降级文稿可读但明确显示需要核对；系统异常仍尝试legacy', async () => {
  for(const systemFails of [false,true]) {
    const output=await analyzeSpeech({multilingual:async()=>{throw Error('model unavailable');},system:async()=>{if(systemFails)throw Error('unavailable');return result('system');},legacy:async()=>result('legacy')});
    const note=applyVideoAnalysis({},output,'/video.mp4');
    assert.equal(note.transcriptEngine,systemFails?'legacy':'system');assert.equal(note.videoStatus,'partial');assert.match(note.videoError,/文稿需要核对/);assert.ok(note.transcriptText.includes('Open models'));
  }
});
test('所有识别器失败不能伪装成完成', async () => {
  await assert.rejects(analyzeSpeech({multilingual:async()=>{throw Error('missing');},system:async()=>({engine:'unavailable'}),legacy:async()=>({transcriptSegments:[]})}),/均未成功/);
});
