// Safari Reader Mode — Service Worker bridge.
//
// Safari's "Listen to Page" and auto-advance only work inside Reader Mode.
// Reader Mode requires content in the initial network response — which is
// why blob: URLs and JS-rendered pages never trigger it.
//
// Our Service Worker intercepts /safari-reader and returns a complete,
// static HTML page containing ALL chapters as one continuous article.
// Safari sees the full book at fetch time and offers the Aa icon.
//
// Flow:
//   1. User taps "Safari Reader" → we post ALL chapter data to the SW
//   2. We open /safari-reader in a new tab
//   3. The SW serves the full book as HTML (no JS needed)
//   4. Safari offers Reader Mode → tap "Show Reader" → tap Aa again → "Listen to Page"

import { isSWReady, postToSW } from "./sw-register";

export interface ReaderChapter {
  title: string;
  paragraphs: string[];
}

export function openSafariReader(
  bookTitle: string,
  chapters: ReaderChapter[],
  startIndex: number,
): void {
  const idx = Math.max(0, Math.min(startIndex, chapters.length - 1));

  // Post chapter data to the Service Worker so it can serve
  // /safari-reader/chapter-N pages with real HTML content.
  if (isSWReady()) {
    postToSW({
      type: "SET_READER_CONTENT",
      bookTitle,
      chapters,
    });
  }

  const readerUrl = `/safari-reader`;
  const w = window.open(readerUrl, "_blank");
  if (!w) {
    window.location.href = readerUrl;
  }
}
