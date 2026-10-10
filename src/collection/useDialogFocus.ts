import { useEffect, useRef } from 'react';

export function useDialogFocus(onClose:()=>void) {
  const ref=useRef<HTMLDivElement>(null), close=useRef(onClose);
  close.current=onClose;
  useEffect(()=>{
    const previous=document.activeElement as HTMLElement;
    const node=ref.current;
    const controls=()=>Array.from(node?.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled),[tabindex="0"]') || []).filter(el=>el.getClientRects().length);
    (controls()[0] || node)?.focus();
    function key(event:KeyboardEvent) {
      if (event.key==='Escape') {event.preventDefault();close.current();}
      if (event.key==='Tab') {
        const items=controls(), first=items[0],last=items[items.length-1];
        if (!first) {event.preventDefault();node?.focus();}
        else if (event.shiftKey && document.activeElement===first) {event.preventDefault();last.focus();}
        else if (!event.shiftKey && document.activeElement===last) {event.preventDefault();first.focus();}
      }
    }
    document.addEventListener('keydown',key);
    return ()=>{document.removeEventListener('keydown',key);previous?.focus();};
  },[]);
  return ref;
}
