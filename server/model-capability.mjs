// 生产接线：创建无宿主动作。所有实际keychain/network/book内容解析由用户preview/confirm触发。
import {createConfigJournal} from './config-journal.mjs';
import {createCapabilityOperationJournal} from './capability-operation-journal.mjs';
import {createCapabilityArtifacts} from './capability-artifacts.mjs';
import {createKeychainAdapter} from './keychain-adapter.mjs';
import {createSwiftKeychainRunner} from './keychain-runner.mjs';
import {createModelCapabilityService} from './model-capability-service.mjs';
import {priceForModel} from './model-price-catalog.mjs';
import {createLearning} from './learning.mjs';
import {readBookContent} from './learning-content.mjs';
const hashIntent=v=>JSON.stringify({provider:v?.provider||'',model:v?.model||''});
export function createModelCapability(repository,{settings,adapters={},clock=Date.now}={}){
 const now=()=>new Date(clock()).toISOString(),filesystem=adapters.capabilityFilesystem;
 const journal=adapters.modelJournal||createCapabilityOperationJournal(repository.directory,{createConfigJournal,now,...filesystem?{filesystem}:{}});
 const artifacts=adapters.capabilityArtifacts||createCapabilityArtifacts(repository.directory,{...filesystem?{filesystem}:{}});
 const keychain=adapters.modelKeychain||createKeychainAdapter({runHelper:adapters.runKeychainHelper||createSwiftKeychainRunner()});
 const learning=createLearning(repository);
 const api=createModelCapabilityService({settings,keychain,journal,artifacts,now,transport:adapters.modelTransport||fetch,
  getModelIntent:async()=>({...((await repository.read())?.model||{})}),
  saveModelIntent:async(next,expected,{guard}={})=>{const state=await repository.read();if(hashIntent(state.model)!==hashIntent(expected))throw new Error('模型意向已变化');if(guard)await guard();await repository.write({...state,model:{...state.model,provider:next.provider,model:next.model,endpoint:next.provider==='anthropic'?'https://api.anthropic.com':next.provider==='openai'?'https://api.openai.com':''}});},
  resolveBookInput:adapters.resolveBookInput||(async id=>{const book=(await learning.shelf()).books.find(b=>b.id===id);if(!book)throw new Error('书籍已不在登记书架');return readBookContent(book.root,book.path);}),
  priceForModel:(provider,model)=>priceForModel(provider,model,{clock}),
 });return api;
}
