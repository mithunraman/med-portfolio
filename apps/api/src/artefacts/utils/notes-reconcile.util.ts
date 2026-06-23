import { nanoidAlphanumeric } from '../../common/utils/nanoid.util';
import type { ArtefactNoteData } from '../artefacts.repository.interface';

// An incoming note from the array-replace request: an existing note echoes its
// xid, a new note omits it.
export interface IncomingNote {
  xid?: string;
  text: string;
}

/**
 * Reconcile the client's full notes array against what is currently persisted.
 * Server owns identity and timestamps:
 *
 * - known xid       -> keep its createdAt; bump updatedAt only if the text changed
 * - no/unknown xid  -> new note: mint an xid, set createdAt = updatedAt = now
 * - a persisted xid absent from `incoming` -> dropped (deleted)
 *
 * A client-supplied xid that doesn't match a persisted note is treated as new (a
 * fresh xid is minted), so the client can never forge or hijack a note's id.
 *
 * `now` is injected for deterministic timestamps (and testability).
 */
export function reconcileNotes(
  current: ArtefactNoteData[],
  incoming: IncomingNote[],
  now: Date
): ArtefactNoteData[] {
  const byXid = new Map(current.map((n) => [n.xid, n]));

  return incoming.map((note) => {
    const existing = note.xid ? byXid.get(note.xid) : undefined;
    if (!existing) {
      return { xid: nanoidAlphanumeric(), text: note.text, createdAt: now, updatedAt: now };
    }
    const changed = existing.text !== note.text;
    return {
      xid: existing.xid,
      text: note.text,
      createdAt: existing.createdAt,
      updatedAt: changed ? now : existing.updatedAt,
    };
  });
}
