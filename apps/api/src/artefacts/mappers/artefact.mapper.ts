import type { ActiveConversation, Artefact, PdpGoalStatus } from '@acme/shared';
import type { Conversation } from '../../conversations/schemas/conversation.schema';
import type { PdpGoal } from '../../pdp-goals/schemas/pdp-goal.schema';
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
  pdpGoals: PdpGoal[] = [],
  versionCount: number = 0
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
    trainingStage: artefact.trainingStage ?? '',
    status: artefact.status,
    artefactType: artefact.artefactType,
    artefactTypeLabel: entryTypeDef?.label ?? artefact.artefactType,
    title: artefact.title,
    reflection: artefact.reflection,
    pdpGoals: pdpGoals.map((g) => ({
      id: g.xid,
      goal: g.goal,
      status: g.status as PdpGoalStatus,
      reviewDate: g.reviewDate?.toISOString() ?? null,
      completedAt: g.completedAt?.toISOString() ?? null,
      completionReview: g.completionReview,
      actions: g.actions.map((a) => ({
        id: a.xid,
        action: a.action,
        intendedEvidence: a.intendedEvidence,
        status: a.status as PdpGoalStatus,
        dueDate: a.dueDate?.toISOString() ?? null,
        completionReview: a.completionReview,
      })),
    })),
    capabilities: artefact.capabilities?.map((cap) => ({
      code: cap.code,
      name: capabilityNameMap.get(cap.code) ?? cap.code,
      evidence: cap.evidence,
    })) ?? null,
    tags: artefact.tags,
    conversation: toActiveConversationDto(conversation),
    versionCount,
    createdAt: artefact.createdAt.toISOString(),
    updatedAt: artefact.updatedAt.toISOString(),
  };
}
