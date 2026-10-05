import { useState, type DragEvent, type HTMLAttributes } from 'react';
import { DragItem, DropTarget, useDragContext } from '../DragContext';
import { usePopoverContext } from '../PopoverContext';
import { toDateOnly } from '../lib/datetime';

type DragSourceProps = Pick<HTMLAttributes<HTMLElement>, 'draggable' | 'onDragStart' | 'onDragEnd'>;

/**
 * Returns a function that builds the props that make an element draggable. It is a plain
 * function (not a hook) so it can be called inside `.map()` callbacks.
 *
 * @param probe     identifies the item, used to decide whether it may be dragged at all
 * @param makeItem  optionally builds the final drag item from the dragstart event (e.g. to read
 *                  which day of a multi-day bar was grabbed)
 */
export function useDragSource(): (
  probe: DragItem,
  makeItem?: (e: DragEvent<HTMLElement>) => DragItem,
) => DragSourceProps {
  const ctx = useDragContext();
  const { hidePopover } = usePopoverContext();

  return (probe, makeItem) => {
    const id = probe.kind === 'event' ? probe.event.id : probe.todo.id;
    if (!ctx.canDrag(probe) || ctx.isPending(id)) return {};
    return {
      draggable: true,
      onDragStart: (e) => {
        const item = makeItem ? makeItem(e) : probe;
        ctx.setCurrent(item);
        e.stopPropagation();
        hidePopover();
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', item.kind === 'event' ? item.event.subject : item.todo.title);
        e.currentTarget.classList.add('m365-dragging');
      },
      onDragEnd: (e) => {
        ctx.setCurrent(null);
        e.currentTarget.classList.remove('m365-dragging');
      },
    };
  };
}

export interface DropHover {
  zone: string;
  target: DropTarget;
}

/**
 * Drop zones for a view. `bind(zone, resolve)` returns drag handlers for an element; `resolve`
 * maps the pointer position to a drop target, or null to refuse the drop. `hover` is the zone
 * and target currently under the pointer, for highlighting.
 */
export function useDropZones() {
  const ctx = useDragContext();
  const [hover, setHover] = useState<DropHover | null>(null);

  const bind = (
    zone: string,
    resolve: (e: DragEvent<HTMLElement>, drag: DragItem) => DropTarget | null,
  ) => ({
    onDragOver: (e: DragEvent<HTMLElement>) => {
      const drag = ctx.getCurrent();
      if (!drag) return;
      const target = resolve(e, drag);
      if (!target) return;
      e.preventDefault(); // marks this element as a valid drop target
      e.dataTransfer.dropEffect = 'move';
      setHover((prev) =>
        prev && prev.zone === zone && prev.target.date === target.date && prev.target.minutes === target.minutes
          ? prev
          : { zone, target },
      );
    },
    onDragLeave: (e: DragEvent<HTMLElement>) => {
      // dragleave also fires when moving between children of the zone; ignore those.
      if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
      setHover((prev) => (prev && prev.zone === zone ? null : prev));
    },
    onDrop: (e: DragEvent<HTMLElement>) => {
      const drag = ctx.getCurrent();
      setHover(null);
      if (!drag) return;
      const target = resolve(e, drag);
      if (!target) return;
      e.preventDefault();
      e.stopPropagation();
      ctx.setCurrent(null);
      ctx.onDrop(drag, target);
    },
  });

  return { hover, bind };
}

/** Resolver for a row of equal-width day columns: picks the day under the pointer's x position. */
export function dayColumnResolver(days: Date[]) {
  return (e: DragEvent<HTMLElement>): DropTarget => {
    const rect = e.currentTarget.getBoundingClientRect();
    const width = rect.width || 1;
    const raw = Math.floor(((e.clientX - rect.left) / width) * days.length);
    const col = Number.isFinite(raw) ? Math.min(days.length - 1, Math.max(0, raw)) : 0;
    return { date: toDateOnly(days[col]) };
  };
}

/** Resolver for elements marked with `data-drop-date="YYYY-MM-DD"`; the nearest marked ancestor of the pointer wins. */
export function dateAttributeResolver() {
  return (e: DragEvent<HTMLElement>): DropTarget | null => {
    const el = (e.target as HTMLElement | null)?.closest?.('[data-drop-date]');
    const date = el?.getAttribute('data-drop-date');
    return date ? { date } : null;
  };
}
