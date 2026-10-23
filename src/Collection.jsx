import React from 'react';
import { MotionConfig } from 'framer-motion';
import { AppProvider } from './collection/app/lib/store';
import CollectionCanvas from './collection/app/page';
import './collection.css';

export function Collection({noteJump}) {
  // The collection motion adapter subscribes dynamically; Framer freezes its own preference at mount.
  return <section className="collection-module"><MotionConfig reducedMotion="never"><AppProvider><CollectionCanvas noteJump={noteJump}/></AppProvider></MotionConfig></section>;
}
