(() => {
  const NOTE_LINK_SELECTOR = 'a[href]';
  const NOTE_CARD_SELECTOR = 'section, .note-item, [class*="note-item"], [class*="feed-item"], [class*="note-card"]';
  const NOTE_PATH_PATTERNS = [
    /^\/explore\/([0-9a-f]{24})(?:\/|$)/i,
    /^\/search_result\/([0-9a-f]{24})(?:\/|$)/i,
    /^\/discovery\/item\/([0-9a-f]{24})(?:\/|$)/i,
    /^\/user\/profile\/[0-9a-f]{24}\/([0-9a-f]{24})(?:\/|$)/i,
  ];
  const NOTE_QUERY_KEYS = ['note_id', 'noteId', 'item_id', 'itemId', 'target_note_id'];

  function noteIdFromHref(value, baseUrl = 'https://www.xiaohongshu.com/') {
    try {
      const url = new URL(value, baseUrl);
      if (!['www.xiaohongshu.com', 'm.xiaohongshu.com'].includes(url.hostname)) return '';
      const pathNoteId = NOTE_PATH_PATTERNS
        .map((pattern) => url.pathname.match(pattern)?.[1] || '')
        .find(Boolean) || '';
      if (pathNoteId) return pathNoteId;

      for (const key of NOTE_QUERY_KEYS) {
        const noteId = url.searchParams.get(key) || '';
        if (/^[0-9a-f]{24}$/i.test(noteId)) return noteId;
      }
      return '';
    } catch {
      return '';
    }
  }

  function firstNoteLink(card, baseUrl) {
    if (!card) return null;
    const links = typeof card.querySelectorAll === 'function'
      ? Array.from(card.querySelectorAll(NOTE_LINK_SELECTOR))
      : [card.querySelector?.(NOTE_LINK_SELECTOR)].filter(Boolean);
    return links.find((link) => noteIdFromHref(link.getAttribute?.('href'), baseUrl)) || null;
  }

  function findNoteCardElements(target, baseUrl = globalThis.location?.href) {
    if (!target || typeof target.closest !== 'function') return { link: null, card: null };

    const closestLink = target.closest(NOTE_LINK_SELECTOR);
    const directLink = noteIdFromHref(closestLink?.getAttribute?.('href'), baseUrl)
      ? closestLink
      : null;
    const matchedCard = target.closest(NOTE_CARD_SELECTOR)
      || (directLink && typeof directLink.closest === 'function'
        ? directLink.closest(NOTE_CARD_SELECTOR)
        : null);
    const nestedLink = firstNoteLink(matchedCard, baseUrl);
    if (directLink || nestedLink) {
      return {
        link: directLink || nestedLink,
        card: matchedCard || directLink?.parentElement || null,
      };
    }

    // Album pages use a deeper wrapper than the regular note grid. Walk only a
    // small ancestor window so the dragged cover can still find its sibling link
    // without accidentally searching the whole page.
    let ancestor = target;
    for (let depth = 0; ancestor && depth < 8; depth += 1) {
      const ancestorLink = firstNoteLink(ancestor, baseUrl);
      if (ancestorLink) {
        return { link: ancestorLink, card: ancestor };
      }
      ancestor = ancestor.parentElement || null;
    }

    return {
      link: null,
      card: matchedCard || null,
    };
  }

  globalThis.KANKAN_CARD_DRAG_HELPERS = Object.freeze({ findNoteCardElements, noteIdFromHref });
})();
