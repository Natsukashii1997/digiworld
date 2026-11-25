import React, { useState } from 'react';
import { MotionConfig } from 'framer-motion';
import { FM } from './motion-tokens.js';
import { AppProvider } from './collection/app/lib/store';
import CollectionCanvas from './collection/app/page';
import { CollectionHatch, collectionCapture } from './collection-hatch.js';
import { HatchPanel } from './HatchPanel.jsx';
import { captureRouteIndex } from './capture-routes.js';
import { scrollsOf } from './scrolls.js';
import './collection.css';

// 收藏与随手记共用孵化面板（孵成资产、归档）；以前收入焚决的条目仍按卷条目上的 source.collectionId 显示去向。
export function Collection({noteJump, state, adoptState, notify, onHatchAsset, collectionArchived, onCollectionNotes}) {
  const [hatching, setHatching] = useState(null);
  const index = captureRouteIndex(state, { collectionArchived });
  const scrolls = scrollsOf(state);
  const hatch = { open: (note, closeReader) => setHatching({ ...collectionCapture(note), closeReader }), routes: id => index.routes('collection', id), scrolls };
  // The collection motion adapter subscribes dynamically; Framer freezes its own preference at mount.
  return <section className="collection-module"><MotionConfig reducedMotion="never" transition={{ duration: FM.mid, ease: FM.out }}><CollectionHatch.Provider value={hatch}><AppProvider><CollectionCanvas noteJump={noteJump}/></AppProvider></CollectionHatch.Provider></MotionConfig>
    {hatching && <HatchPanel capture={{ ...hatching, onArchived: onCollectionNotes }} routes={index.routes('collection', hatching.id)} scrolls={scrolls} adoptState={adoptState} notify={notify} onHatchAsset={capture => { hatching.closeReader?.(); onHatchAsset(capture); }} onClose={() => setHatching(null)}/>}
  </section>;
}
