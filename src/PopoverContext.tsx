import React, { createContext, useContext, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { M365Event, M365Calendar } from './types';
import { EventHoverPopover } from './components/EventHoverPopover';

interface PopoverState {
  event: M365Event;
  calendar: M365Calendar;
  anchorRect: DOMRect;
}

interface PopoverContextValue {
  showPopover: (event: M365Event, calendar: M365Calendar, rect: DOMRect) => void;
  hidePopover: () => void;
}

const PopoverContext = createContext<PopoverContextValue | null>(null);

export function usePopoverContext(): PopoverContextValue {
  const ctx = useContext(PopoverContext);
  // Return no-ops when rendered outside a provider (e.g. in tests that don't wrap with PopoverProvider)
  return ctx ?? { showPopover: () => {}, hidePopover: () => {} };
}

export const PopoverProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [popover, setPopover] = useState<PopoverState | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showPopover = (event: M365Event, calendar: M365Calendar, rect: DOMRect) => {
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      setPopover({ event, calendar, anchorRect: rect });
    }, 300);
  };

  const hidePopover = () => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setPopover(null);
  };

  return (
    <PopoverContext.Provider value={{ showPopover, hidePopover }}>
      {children}
      {popover &&
        createPortal(
          <EventHoverPopover
            event={popover.event}
            calendar={popover.calendar}
            anchorRect={popover.anchorRect}
          />,
          document.body,
        )}
    </PopoverContext.Provider>
  );
};
