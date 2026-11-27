import '@testing-library/jest-dom/vitest';

// Obsidian provides `activeDocument` (the document of the focused window, which
// differs from `document` in popout windows) as a global. jsdom has no popout
// windows, so it is simply the one document.
Object.defineProperty(globalThis, 'activeDocument', {
  get: () => document,
  configurable: true,
});
