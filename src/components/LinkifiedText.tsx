import React from 'react';
import { splitLinks } from '../lib/links';

/** What the owner of the dialog does with a link; omitted in tests and when nothing is wired up. */
export interface LinkHandlers {
  /** Left click: open the link (in the default browser). */
  open: (url: string) => void;
  /** Right click: offer the ways to open it. */
  contextMenu: (url: string, event: MouseEvent) => void;
}

interface ExternalLinkProps {
  url: string;
  handlers?: LinkHandlers;
  children?: React.ReactNode;
}

/** An http(s) link that opens outside the dialog and offers a right-click menu. */
export const ExternalLink: React.FC<ExternalLinkProps> = ({ url, handlers, children }) => (
  <a
    href={url}
    target="_blank"
    rel="noopener noreferrer"
    onClick={handlers ? (e) => { e.preventDefault(); handlers.open(url); } : undefined}
    onContextMenu={handlers ? (e) => { e.preventDefault(); handlers.contextMenu(url, e.nativeEvent); } : undefined}
  >
    {children ?? url}
  </a>
);

/** Plain text in which every http(s) URL is a clickable link. The text itself is never altered. */
export const LinkifiedText: React.FC<{ text: string; handlers?: LinkHandlers }> = ({ text, handlers }) => (
  <>
    {splitLinks(text).map((part, i) =>
      part.kind === 'link'
        ? <ExternalLink key={i} url={part.value} handlers={handlers} />
        : <React.Fragment key={i}>{part.value}</React.Fragment>,
    )}
  </>
);
