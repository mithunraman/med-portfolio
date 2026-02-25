import type { Artefact, ActiveConversation } from '@acme/shared';
import type { Artefact as ArtefactSchema } from '../schemas/artefact.schema';
import type { Conversation } from '../../conversations/schemas/conversation.schema';
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
  conversation: Conversation
): Artefact {
  return {
    id: artefact.xid,
    artefactId: extractArtefactClientId(artefact.artefactId),
    specialty: artefact.specialty,
    status: artefact.status,
    artefactType: artefact.artefactType,
    classificationConfidence: artefact.classificationConfidence ?? null,
    classificationSource: artefact.classificationSource ?? null,
    classificationAlternatives: artefact.classificationAlternatives ?? null,
    title: artefact.title,
    reflection: artefact.reflection,
    pdpActions: artefact.pdpActions,
    capabilities: artefact.capabilities,
    tags: artefact.tags,
    conversation: toActiveConversationDto(conversation),
    createdAt: artefact.createdAt.toISOString(),
    updatedAt: artefact.updatedAt.toISOString(),
  };
}
