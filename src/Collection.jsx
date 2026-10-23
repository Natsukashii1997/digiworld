import React, { useRef, useState } from 'react';
import { MotionConfig } from 'framer-motion';
import { AppProvider } from './collection/app/lib/store';
import CollectionCanvas from './collection/app/page';
import { CollectionHatch, collectionCapture } from './collection-hatch.js';
import { HatchPanel } from './HatchPanel.jsx';
import { RefineDialog } from './RefineDialog.jsx';
import { captureRouteIndex } from './capture-routes.js';
import { scrollsOf, addEntry } from './scrolls.js';
import { NOTE_MAX } from './rich-note.js';
import './collection.css';

// 阶段 2：收藏与随手记共用孵化面板；收入焚决在卷条目上记 source.collectionId，收藏本身不改。
export function Collection({noteJump, state, save, notify, adoptState, navigate, onHatchAsset, collectionArchived, onCollectionNotes}) {
  const [hatching, setHatching] = useState(null), [refining, setRefining] = useState(null), [refineBusy, setRefineBusy] = useState(false);
  const lock = useRef(false);
  const index = captureRouteIndex(state, { collectionArchived });
  const scrolls = scrollsOf(state);
  const hatch = { open: (note, closeReader) => setHatching({ ...collectionCapture(note), closeReader }), routes: id => index.routes('collection', id), scrolls };
  async function refine(scrollId) {
    if (lock.current || !refining) return;
    lock.current = true; setRefineBusy(true);
    try {
      const base = state, { capture } = refining;
      const { scrolls: next } = addEntry(scrollsOf(base), scrollId, refining.text, [], { collectionId: capture.id, ...(capture.url ? { url: capture.url } : {}) });
      if (await save({ ...base, scrolls: next }, { base })) {
        setRefining(null);
        notify(`已收入「${next.find(s => s.id === scrollId).name}」`);
      }
    } finally { lock.current = false; setRefineBusy(false); }
  }
  // The collection motion adapter subscribes dynamically; Framer freezes its own preference at mount.
  return <section className="collection-module"><MotionConfig reducedMotion="never"><CollectionHatch.Provider value={hatch}><AppProvider><CollectionCanvas noteJump={noteJump}/></AppProvider></CollectionHatch.Provider></MotionConfig>
    {hatching && <HatchPanel capture={{ ...hatching, onArchived: onCollectionNotes }} routes={index.routes('collection', hatching.id)} projects={state.connections?.projects || []} scrolls={scrolls} adoptState={adoptState} notify={notify} navigate={navigate} onHatchAsset={capture => { hatching.closeReader?.(); onHatchAsset(capture); }} onRefine={capture => setRefining({ capture, text: capture.text.slice(0, NOTE_MAX), partial: false, collection: true })} onClose={() => setHatching(null)}/>}
    {refining && <RefineDialog draft={refining} scrolls={scrolls} busy={refineBusy} navigate={navigate} onClose={() => { if (!lock.current) setRefining(null); }} onConfirm={refine}/>}
  </section>;
}
