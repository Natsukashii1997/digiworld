import {useEffect,useState} from 'react';
import {request} from './api.js';
const empty={hits:[],total:0};
// A fresh main-store snapshot per opening; collection is independently queried and cancellable.
export function useSearchSources(query) {
  const [retryKey,setRetryKey]=useState(0);
  const [main,setMain]=useState({data:null,loading:true,error:''});
  const [collection,setCollection]=useState({query:'',data:empty,loading:false,error:''});
  useEffect(()=>{
    let live=true;const controller=new AbortController();
    setMain(old=>({...old,loading:true,error:''}));
    const timeout=setTimeout(()=>{controller.abort();if(live)setMain(old=>({...old,loading:false,error:'主库读取超时，暂时显示上次内容；打开前会再次核对。'}));},8000);
    request('/workspace',undefined,'GET',true,{signal:controller.signal}).then(data=>{
      if(live&&!controller.signal.aborted)setMain({data,loading:false,error:''});
    }).catch(()=>{if(live&&!controller.signal.aborted)setMain(old=>({...old,loading:false,error:'主库读取失败，暂时显示上次内容；打开前会再次核对。'}));}).finally(()=>clearTimeout(timeout));
    return()=>{live=false;clearTimeout(timeout);controller.abort();};
  },[retryKey]);
  useEffect(()=>{
    let live=true;const controller=new AbortController();let timeout;
    if(!query.trim()){setCollection({query,data:empty,loading:false,error:''});return;}
    setCollection({query,data:empty,loading:true,error:''});
    const debounce=setTimeout(()=>{
      timeout=setTimeout(()=>{controller.abort();if(live)setCollection({query,data:empty,loading:false,error:'收藏读取超时，请重新读取。'});},8000);
      request('/collection/search?q='+encodeURIComponent(query),undefined,'GET',true,{signal:controller.signal}).then(data=>{
        if(live&&!controller.signal.aborted)setCollection({query,data,loading:false,error:''});
      }).catch(()=>{if(live&&!controller.signal.aborted)setCollection({query,data:empty,loading:false,error:'收藏读取失败，其他已读取结果仍可使用。'});}).finally(()=>clearTimeout(timeout));
    },150);
    return()=>{live=false;clearTimeout(debounce);clearTimeout(timeout);controller.abort();};
  },[query,retryKey]);
  const current=collection.query===query;
  return {workspace:main.data,collection:current?collection.data:empty,
    loading:main.loading || (!!query.trim()&&(!current||collection.loading)),
    errors:[main.error,current&&collection.error].filter(Boolean),retry:()=>setRetryKey(n=>n+1)};
}
