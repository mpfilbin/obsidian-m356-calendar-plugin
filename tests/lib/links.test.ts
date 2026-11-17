import { describe, it, expect } from 'vitest';
import { splitLinks, isWebUrl } from '../../src/lib/links';

const links = (text: string) => splitLinks(text).filter((p) => p.kind === 'link').map((p) => p.value);

describe('splitLinks', () => {
  it('returns one text part when there is no URL', () => {
    expect(splitLinks('Please review.')).toEqual([{ kind: 'text', value: 'Please review.' }]);
  });

  it('returns nothing for empty text', () => {
    expect(splitLinks('')).toEqual([]);
  });

  it('splits text around a link and keeps every character', () => {
    const text = 'See https://example.com/a?b=1&c=2#frag now';
    expect(splitLinks(text)).toEqual([
      { kind: 'text', value: 'See ' },
      { kind: 'link', value: 'https://example.com/a?b=1&c=2#frag' },
      { kind: 'text', value: ' now' },
    ]);
    expect(splitLinks(text).map((p) => p.value).join('')).toBe(text);
  });

  it('finds http and https links, several per line, case-insensitively', () => {
    expect(links('http://a.example and HTTPS://B.example/x')).toEqual(['http://a.example', 'HTTPS://B.example/x']);
  });

  it.each([
    ['See https://example.com/a.', 'https://example.com/a'],
    ['(see https://example.com/a)', 'https://example.com/a'],
    ['Is it https://example.com/a?', 'https://example.com/a'],
    ['https://example.com/a, then', 'https://example.com/a'],
    ['<https://example.com/a>', 'https://example.com/a'],
    ['"https://example.com/a"', 'https://example.com/a'],
  ])('leaves sentence punctuation out of the link in %j', (text, expected) => {
    expect(links(text)).toEqual([expected]);
  });

  it('keeps balanced parentheses that belong to the URL', () => {
    expect(links('https://en.wikipedia.org/wiki/Foo_(bar)')).toEqual(['https://en.wikipedia.org/wiki/Foo_(bar)']);
    expect(links('(https://en.wikipedia.org/wiki/Foo_(bar))')).toEqual(['https://en.wikipedia.org/wiki/Foo_(bar)']);
  });

  it('does not link other schemes or bare domains', () => {
    expect(links('javascript:alert(1) file:///etc/passwd obsidian://open ftp://x.example www.example.com mailto:a@b.c')).toEqual([]);
  });

  it('does not link a scheme with no host', () => {
    expect(links('https:// and https:///path')).toEqual([]);
  });

  it('handles newlines between links', () => {
    expect(links('https://a.example\nhttps://b.example')).toEqual(['https://a.example', 'https://b.example']);
  });
});

describe('isWebUrl', () => {
  it('accepts only http and https', () => {
    expect(isWebUrl('https://example.com')).toBe(true);
    expect(isWebUrl('http://example.com')).toBe(true);
    expect(isWebUrl('javascript:alert(1)')).toBe(false);
    expect(isWebUrl('obsidian://open')).toBe(false);
    expect(isWebUrl('not a url')).toBe(false);
  });
});
