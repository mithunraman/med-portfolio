import type { Message } from '@acme/shared';
import { useMemo } from 'react';
import type { FlatListItem } from '../types';

function toDateKey(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

interface Options {
  isTyping?: boolean;
  noticeText?: string;
}

export function useMessageGroups(messages: Message[], options: Options = {}): FlatListItem[] {
  const { isTyping, noticeText } = options;

  return useMemo(() => {
    if (messages.length === 0) {
      const items: FlatListItem[] = [];
      if (isTyping) items.push({ type: 'typingIndicator' });
      if (noticeText) items.push({ type: 'notice', text: noticeText });
      return items;
    }

    // Sort newest first for inverted FlatList
    const sorted = [...messages].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    const items: FlatListItem[] = [];

    for (let i = 0; i < sorted.length; i++) {
      const msg = sorted[i];
      const prev = sorted[i - 1]; // newer (already added)
      const next = sorted[i + 1]; // older

      // Group logic: same role as neighbours = same group
      // In an inverted FlatList (newest-first data, newest rendered at bottom):
      //   prev = sorted[i-1] = newer message = rendered BELOW on screen
      //   next = sorted[i+1] = older message = rendered ABOVE on screen
      //
      // isLastInGroup (tail goes here) = bottom of group = newest = prev differs
      // isFirstInGroup (top of group)  = oldest = next differs
      // const isLastInGroup = !prev || prev.role !== msg.role;
      const isLastInGroup = false; // disabling this for now
      const isFirstInGroup = !next || next.role !== msg.role;

      items.push({ type: 'message', data: msg, isLastInGroup, isFirstInGroup });

      // Inject date separator when the next message is from a different calendar day
      if (next) {
        const currentDay = toDateKey(msg.createdAt);
        const nextDay = toDateKey(next.createdAt);
        if (currentDay !== nextDay) {
          // The separator date represents the day of the older (next) group
          items.push({ type: 'dateSeparator', date: next.createdAt });
        }
      }
    }

    // Notice goes at the very end — rendered at the top of the screen (oldest position)
    if (noticeText) {
      items.push({ type: 'notice', text: noticeText });
    }

    // Typing indicator goes at index 0 — rendered at the bottom (newest position)
    if (isTyping) {
      items.unshift({ type: 'typingIndicator' });
    }

    return items;
  }, [messages, isTyping, noticeText]);
}
