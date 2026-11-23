import {useCallback, useEffect, useRef, useState} from 'react';
import type {UploadDashboard} from './model';
import {emptyOutcomeLedger, observeUploadOutcomes, readOutcomeLedger, trackAcceptedUpload, type OutcomeLedger, type UploadOutcome} from './upload-outcomes';

type Update = (ledger:OutcomeLedger) => {ledger:OutcomeLedger; notices:UploadOutcome[]};

export function useUploadOutcomes(owner:string, dashboard:UploadDashboard, enabled:boolean) {
  const key = `mtm.lesson-upload.outcomes.v1:${owner}:${dashboard.staff.role}:${dashboard.staff.teacher_key ?? ''}`;
  const ledgerRef = useRef(emptyOutcomeLedger);
  const storageUnavailable = useRef(false);
  const active = useRef(false);
  const [notices,setNotices] = useState<UploadOutcome[]>([]);

  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);

  const update = useCallback(async (apply:Update, current:()=>boolean = () => true) => {
    if (!enabled || typeof window === 'undefined') return;
    function run() {
      if (!active.current || !current()) return;
      let previous = ledgerRef.current;
      if (!storageUnavailable.current) {
        try {
          const raw = window.localStorage.getItem(key);
          if (raw) previous = readOutcomeLedger(raw);
        } catch { storageUnavailable.current = true; }
      }
      const next = apply(previous);
      ledgerRef.current = next.ledger;
      if (!storageUnavailable.current && next.ledger !== previous) {
        try { window.localStorage.setItem(key, JSON.stringify(next.ledger)); }
        catch { storageUnavailable.current = true; }
      }
      if (next.notices.length) setNotices(previous => [...previous, ...next.notices]);
    }
    // Browsers with Web Locks serialize the same staff ledger across tabs.
    const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
    if (typeof locks?.request === 'function') {
      try { await locks.request(key, run); } catch { run(); }
    } else run();
  }, [enabled,key]);

  useEffect(() => {
    let current = true;
    void update(ledger => observeUploadOutcomes(ledger, dashboard), () => current);
    return () => { current = false; };
  }, [dashboard,update]);

  return {
    notices,
    dismiss:() => setNotices([]),
    remember:(id:string, version:number) => update(ledger => ({ledger:trackAcceptedUpload(ledger,id,version), notices:[]})),
  };
}
