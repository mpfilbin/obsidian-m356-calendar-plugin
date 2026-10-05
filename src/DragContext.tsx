import React, { createContext, useCallback, useContext, useMemo, useRef, type ReactNode } from 'react';
import { M365Event, M365TodoItem } from './types';

/** An event being dragged. `grabbedDate` is the day under the pointer when the drag began. */
export interface EventDrag {
  kind: 'event';
  event: M365Event;
  grabbedDate: string;
  /** Minutes between the top of the dragged block and the pointer (timeline drags only). */
  grabOffsetMin: number;
}

export interface TodoDrag {
  kind: 'todo';
  todo: M365TodoItem;
}

export type DragItem = EventDrag | TodoDrag;

/** Where something was dropped: a day, plus a start time (minutes after midnight) in a timeline. */
export interface DropTarget {
  date: string;
  minutes?: number;
}

export interface DragContextValue {
  canDrag(item: DragItem): boolean;
  /** True while the item's move is being saved. */
  isPending(id: string): boolean;
  onDrop(item: DragItem, target: DropTarget): void;
  /** The drag in progress. dataTransfer contents are unreadable during dragover, so we keep it here. */
  getCurrent(): DragItem | null;
  setCurrent(item: DragItem | null): void;
}

// Outside a provider (e.g. in isolated component tests) dragging is simply disabled.
const DISABLED: DragContextValue = {
  canDrag: () => false,
  isPending: () => false,
  onDrop: () => {},
  getCurrent: () => null,
  setCurrent: () => {},
};

const DragContext = createContext<DragContextValue>(DISABLED);

export function useDragContext(): DragContextValue {
  return useContext(DragContext);
}

interface DragProviderProps {
  canDrag: (item: DragItem) => boolean;
  isPending: (id: string) => boolean;
  onDrop: (item: DragItem, target: DropTarget) => void;
  children: ReactNode;
}

export const DragProvider: React.FC<DragProviderProps> = ({ canDrag, isPending, onDrop, children }) => {
  const current = useRef<DragItem | null>(null);
  const getCurrent = useCallback(() => current.current, []);
  const setCurrent = useCallback((item: DragItem | null) => { current.current = item; }, []);

  const value = useMemo<DragContextValue>(
    () => ({ canDrag, isPending, onDrop, getCurrent, setCurrent }),
    [canDrag, isPending, onDrop, getCurrent, setCurrent],
  );
  return <DragContext.Provider value={value}>{children}</DragContext.Provider>;
};
