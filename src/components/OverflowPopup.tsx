import React from 'react';
import { createPortal } from 'react-dom';
import { M365Event, M365Calendar, M365TodoItem, M365TodoList } from '../types';
import { EventCard } from './EventCard';
import { TodoCard } from './TodoCard';

interface OverflowPopupProps {
  events: M365Event[];
  todos: M365TodoItem[];
  calendarMap: Map<string, M365Calendar>;
  todoListMap: Map<string, M365TodoList>;
  anchorRect: DOMRect;
}

const POPUP_WIDTH = 220;
const GAP = 8;

export const OverflowPopup: React.FC<OverflowPopupProps> = ({
  events,
  todos,
  calendarMap,
  todoListMap,
  anchorRect,
}) => {
  const wouldOverflow = anchorRect.right + GAP + POPUP_WIDTH > window.innerWidth;
  const left = wouldOverflow
    ? anchorRect.left - GAP - POPUP_WIDTH
    : anchorRect.right + GAP;

  return createPortal(
    <div
      className="m365-overflow-popup"
      style={{ position: 'fixed', top: `${anchorRect.top}px`, left: `${left}px`, pointerEvents: 'none' }}
    >
      {events.map((event) => {
        const cal = calendarMap.get(event.calendarId);
        if (!cal) return null;
        return <EventCard key={event.id} event={event} calendar={cal} />;
      })}
      {todos.map((todo) => {
        const list = todoListMap.get(todo.listId);
        if (!list) return null;
        return <TodoCard key={todo.id} todo={todo} todoList={list} />;
      })}
    </div>,
    document.body,
  );
};
