// Minimal stand-ins for the few discord.js Message fields the text parsers read.
// Parsers only touch author, content, createdAt and interactionMetadata.user, so
// a plain object cast to Message is enough to exercise them without a gateway.

import type { Message } from 'discord.js';

export interface FakeAuthor {
  id: string;
  username: string;
  globalName?: string | null;
  bot?: boolean;
  system?: boolean;
}

export interface FakeMessageInit {
  content?: string;
  author?: FakeAuthor | null;
  createdAt?: Date;
  /** When set, exposed as interactionMetadata.user (the activity player). */
  interactionUser?: FakeAuthor;
}

const DEFAULT_AUTHOR: FakeAuthor = { id: 'user-1', username: 'tester' };

export function fakeMessage(init: FakeMessageInit = {}): Message {
  const author = init.author === undefined ? DEFAULT_AUTHOR : init.author;
  return {
    content: init.content ?? '',
    author: author ? { globalName: null, bot: false, system: false, ...author } : null,
    createdAt: init.createdAt ?? new Date('2026-06-28T12:00:00Z'),
    editedAt: null,
    interactionMetadata: init.interactionUser
      ? { user: { globalName: null, ...init.interactionUser } }
      : null,
    attachments: new Map(),
  } as unknown as Message;
}
