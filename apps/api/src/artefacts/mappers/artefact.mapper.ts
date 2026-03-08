import type { ActiveConversation, Artefact, PdpActionStatus } from '@acme/shared';
import type { Conversation } from '../../conversations/schemas/conversation.schema';
import type { PdpAction } from '../../pdp-actions/schemas/pdp-action.schema';
import { getSpecialtyConfig } from '../../specialties/specialty.registry';
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
  const config = getSpecialtyConfig(artefact.specialty);

  // Resolve artefact type code → display label
  const entryTypeDef = artefact.artefactType
    ? config.entryTypes.find((et) => et.code === artefact.artefactType)
    : undefined;

  // Build capability code → name lookup
  const capabilityNameMap = new Map(config.capabilities.map((c) => [c.code, c.name]));

  return {
    id: artefact.xid,
    artefactId: extractArtefactClientId(artefact.artefactId),
    specialty: artefact.specialty,
    status: artefact.status,
    artefactType: artefact.artefactType,
    artefactTypeLabel: entryTypeDef?.label ?? artefact.artefactType,
    title: artefact.title,
    reflection: artefact.reflection,
    pdpActions: pdpActions.map((p) => ({
      id: p.xid,
      action: p.action,
      timeframe: p.timeframe,
      status: p.status as PdpActionStatus,
      dueDate: p.dueDate?.toISOString() ?? null,
    })),
    capabilities: artefact.capabilities?.map((cap) => ({
      code: cap.code,
      name: capabilityNameMap.get(cap.code) ?? cap.code,
      evidence: cap.evidence,
    })) ?? null,
    tags: artefact.tags,
    conversation: toActiveConversationDto(conversation),
    createdAt: artefact.createdAt.toISOString(),
    updatedAt: artefact.updatedAt.toISOString(),
  };
}
