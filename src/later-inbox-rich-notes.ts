import type { LaterInboxNoteSegment } from "./later-inbox-model";

export const MAX_LATER_NOTE_CHARACTERS = 4_000;

const BLOCK_ELEMENTS = new Set([
  "ADDRESS",
  "BLOCKQUOTE",
  "DIV",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
  "LI",
  "OL",
  "P",
  "PRE",
  "UL",
]);

function safeHttpUrl(value: string | null) {
  if (!value) {
    return null;
  }
  try {
    const url = new URL(value);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password
    ) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

function appendSegment(
  segments: LaterInboxNoteSegment[],
  text: string,
  href: string | null,
) {
  if (!text) {
    return;
  }
  const previous = segments[segments.length - 1];
  if (previous?.href === href) {
    previous.text += text;
  } else {
    segments.push({ text, href });
  }
}

function appendBreak(segments: LaterInboxNoteSegment[]) {
  const previous = segments[segments.length - 1];
  if (!previous || previous.text.endsWith("\n")) {
    return;
  }
  appendSegment(segments, "\n", null);
}

function trimOuterBreaks(segments: LaterInboxNoteSegment[]) {
  while (segments[0]?.text.startsWith("\n")) {
    segments[0].text = segments[0].text.slice(1);
    if (!segments[0].text) {
      segments.shift();
    }
  }
  while (segments[segments.length - 1]?.text.endsWith("\n")) {
    const last = segments[segments.length - 1];
    if (!last) {
      break;
    }
    last.text = last.text.slice(0, -1);
    if (!last.text) {
      segments.pop();
    }
  }
  return segments;
}

function collectNode(
  node: Node,
  segments: LaterInboxNoteSegment[],
  inheritedHref: string | null = null,
) {
  if (node.nodeType === Node.TEXT_NODE) {
    appendSegment(segments, node.textContent ?? "", inheritedHref);
    return;
  }
  if (!(node instanceof HTMLElement)) {
    return;
  }
  if (node.tagName === "BR") {
    appendBreak(segments);
    return;
  }
  if (["IMG", "SVG", "VIDEO", "AUDIO", "IFRAME"].includes(node.tagName)) {
    return;
  }

  const block = BLOCK_ELEMENTS.has(node.tagName);
  if (block) {
    appendBreak(segments);
  }
  const href =
    node.tagName === "A"
      ? safeHttpUrl(node.getAttribute("href"))
      : inheritedHref;
  for (const child of node.childNodes) {
    collectNode(child, segments, href);
  }
  if (block) {
    appendBreak(segments);
  }
}

export function readRichNoteEditor(editor: HTMLElement) {
  const segments: LaterInboxNoteSegment[] = [];
  for (const child of editor.childNodes) {
    collectNode(child, segments);
  }
  return trimOuterBreaks(segments);
}

export function noteCharacterCount(notes: readonly LaterInboxNoteSegment[]) {
  return notes.reduce((total, segment) => total + [...segment.text].length, 0);
}

export function linkifyPlainText(text: string) {
  const segments: LaterInboxNoteSegment[] = [];
  const pattern = /https?:\/\/[^\s<>]+/giu;
  let cursor = 0;
  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0;
    appendSegment(segments, text.slice(cursor, index), null);
    let candidate = match[0];
    let trailing = "";
    while (/[),.;!?]$/u.test(candidate)) {
      trailing = candidate.slice(-1) + trailing;
      candidate = candidate.slice(0, -1);
    }
    const href = safeHttpUrl(candidate);
    appendSegment(segments, candidate, href);
    appendSegment(segments, trailing, null);
    cursor = index + match[0].length;
  }
  appendSegment(segments, text.slice(cursor), null);
  return trimOuterBreaks(segments);
}

export function richNoteSegmentsFromClipboard(clipboard: DataTransfer) {
  const html = clipboard.getData("text/html");
  if (html) {
    const document = new DOMParser().parseFromString(html, "text/html");
    const segments: LaterInboxNoteSegment[] = [];
    for (const child of document.body.childNodes) {
      collectNode(child, segments);
    }
    const cleaned = trimOuterBreaks(segments);
    if (cleaned.some((segment) => segment.text.trim())) {
      return cleaned;
    }
  }
  return linkifyPlainText(clipboard.getData("text/plain"));
}

function appendTextWithBreaks(parent: Node, text: string) {
  const parts = text.split("\n");
  parts.forEach((part, index) => {
    if (index > 0) {
      parent.appendChild(document.createElement("br"));
    }
    if (part) {
      parent.appendChild(document.createTextNode(part));
    }
  });
}

export function richNoteFragment(notes: readonly LaterInboxNoteSegment[]) {
  const fragment = document.createDocumentFragment();
  for (const segment of notes) {
    if (segment.href) {
      const anchor = document.createElement("a");
      anchor.href = segment.href;
      anchor.dataset.laterNoteLink = "true";
      appendTextWithBreaks(anchor, segment.text);
      fragment.appendChild(anchor);
    } else {
      appendTextWithBreaks(fragment, segment.text);
    }
  }
  return fragment;
}

export function setRichNoteEditor(
  editor: HTMLElement,
  notes: readonly LaterInboxNoteSegment[],
) {
  editor.replaceChildren(richNoteFragment(notes));
}

export function insertRichNoteAtSelection(
  editor: HTMLElement,
  notes: readonly LaterInboxNoteSegment[],
) {
  const selection = window.getSelection();
  const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
  const editorOwnsRange =
    range !== null &&
    editor.contains(range.commonAncestorContainer);
  const targetRange = editorOwnsRange ? range : document.createRange();
  if (!editorOwnsRange) {
    targetRange.selectNodeContents(editor);
    targetRange.collapse(false);
  }
  targetRange.deleteContents();
  const fragment = richNoteFragment(notes);
  const lastNode = fragment.lastChild;
  targetRange.insertNode(fragment);
  if (lastNode && selection) {
    targetRange.setStartAfter(lastNode);
    targetRange.collapse(true);
    selection.removeAllRanges();
    selection.addRange(targetRange);
  }
}
