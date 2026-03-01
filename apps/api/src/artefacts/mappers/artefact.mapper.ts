import type { ActiveConversation, Artefact, PdpActionStatus } from '@acme/shared';
import type { Conversation } from '../../conversations/schemas/conversation.schema';
import type { PdpAction } from '../../pdp-actions/schemas/pdp-action.schema';
import type { Artefact as ArtefactSchema } from '../schemas/artefact.schema';
import { extractArtefactClientId } from '../utils/artefact-id.util';

export function toActiveConversationDto(doc: Conversation): ActiveConversation {
  return {
    id: doc.xid,
    title: doc.title,
    status: doc.status,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

export function toArtefactDto(
  artefact: ArtefactSchema,
  conversation: Conversation,
  pdpActions: PdpAction[] = []
): Artefact {
  return {
    id: artefact.xid,
    artefactId: extractArtefactClientId(artefact.artefactId),
    specialty: artefact.specialty,
    status: artefact.status,
    artefactType: artefact.artefactType,
    title: artefact.title,
    reflection: artefact.reflection,
    pdpActions: pdpActions.map((p) => ({
      id: p.xid,
      action: p.action,
      timeframe: p.timeframe,
      status: p.status as PdpActionStatus,
    })),
    capabilities: artefact.capabilities,
    tags: artefact.tags,
    conversation: toActiveConversationDto(conversation),
    createdAt: artefact.createdAt.toISOString(),
    updatedAt: artefact.updatedAt.toISOString(),
  };
}
