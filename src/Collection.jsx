import React from 'react';
import { MotionConfig } from 'framer-motion';
import { AppProvider } from './collection/app/lib/store';
import CollectionCanvas from './collection/app/page';
import { PageHeading } from './components.jsx';
import './collection.css';

export function Collection() {
  // The collection motion adapter subscribes dynamically; Framer freezes its own preference at mount.
  return <section className="collection-module"><PageHeading page="learning"/><MotionConfig reducedMotion="never"><AppProvider><CollectionCanvas/></AppProvider></MotionConfig></section>;
}
