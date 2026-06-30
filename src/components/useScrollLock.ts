import { useEffect } from "react";

/**
 * Locks page (body) scrolling while `active` is true — used by modals so the
 * background never scrolls behind them and scroll doesn't chain out of the
 * dialog. Ref-counted so stacked modals restore correctly.
 */
let locks = 0;
let prevOverflow = "";

export function useScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    if (locks === 0) {
      prevOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
    }
    locks += 1;
    return () => {
      locks -= 1;
      if (locks === 0) document.body.style.overflow = prevOverflow;
    };
  }, [active]);
}
