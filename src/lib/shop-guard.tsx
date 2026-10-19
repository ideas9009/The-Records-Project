import { useEffect, useRef, useState } from "react";
import ExpandingConfirmation from "../components/ExpandingConfirmation";
export function useShopGuard(dirty: boolean, busy: boolean, back: () => void) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null),
    current = useRef({ dirty, busy }),
    pending = useRef(back);
  current.current = { dirty, busy };
  const leave = (element: HTMLElement, proceed = back) => {
    if (busy) return;
    if (!dirty) {
      proceed();
      return;
    }
    pending.current = proceed;
    setAnchor(element);
  };
  useEffect(() => {
    const guard = (event: Event) => {
      if (!current.current.dirty && !current.current.busy) return;
      event.preventDefault();
      if (current.current.busy) return;
      const nav = event as CustomEvent<{
        proceed: () => void;
        anchor: HTMLElement;
      }>;
      pending.current = nav.detail.proceed;
      setAnchor(nav.detail.anchor || (document.activeElement as HTMLElement));
    };
    window.addEventListener("records-navigate", guard);
    return () => window.removeEventListener("records-navigate", guard);
  }, []);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  return {
    allow: () => {
      current.current = { dirty: false, busy: false };
    },
    leave,
    confirmation: (
      <ExpandingConfirmation
        anchor={anchor}
        title="Discard unsaved changes?"
        message="Your changes have not been saved."
        triggerLabel="Back"
        triggerIcon="arrow_back"
        confirmText="Discard changes"
        onCancel={() => setAnchor(null)}
        onConfirm={() => {
          setAnchor(null);
          current.current = { dirty: false, busy: false };
          pending.current();
        }}
      />
    ),
  };
}
