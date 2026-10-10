'use client';

import { useEffect, useRef } from 'react';
import { DeskView } from './components/DeskView';
import { useApp } from './lib/store';
import { getNotes, getNotesRevision } from './lib/xhs-client';

export default function Home() {
  const { dispatch } = useApp();
  const notesSignatureRef = useRef('');
  const notesRevisionRef = useRef('');

  useEffect(() => {
    let cancelled = false;

    const load = async (showLoading = false) => {
      if (showLoading) dispatch({ type: 'SET_LOADING', payload: true });
      try {
        const revision = await getNotesRevision();
        if (!showLoading && revision && revision === notesRevisionRef.current) return;
        const notes = await getNotes();
        if (cancelled) return;
        notesRevisionRef.current = revision;
        const signature = JSON.stringify(notes);
        if (signature !== notesSignatureRef.current) {
          notesSignatureRef.current = signature;
          dispatch({ type: 'SET_NOTES', payload: notes });
        }
        if (!cancelled) dispatch({type:'SET_ERROR',payload:null});
      } catch(error) {
        if (!cancelled) dispatch({ type: 'SET_ERROR', payload: error instanceof Error?error.message:'加载失败' });
      } finally {
        if (showLoading && !cancelled) dispatch({ type: 'SET_LOADING', payload: false });
      }
    };

    void load(true);
    const intervalId = window.setInterval(() => void load(), 2000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [dispatch]); // dispatch is stable, no infinite loop

  return <DeskView />;
}
