import { ArtefactTemplate } from '@acme/shared';

/** A rendered output document field — the projection of its probes' content. */
export interface ComposedSection {
  sectionId: string;
  label: string;
  text: string;
}

/** The per-probe organised content produced by the reflect node. */
interface ReflectionSection {
  sectionId: string;
  title: string;
  text: string;
  covered: boolean;
}

/**
 * Project the granular per-probe reflection content into the output document
 * fields the trainee submits (e.g. the five CCR probes → one "Brief description").
 *
 * Pure, deterministic, no LLM: it groups probe text by output section and
 * concatenates in probe order with paragraph breaks. It adds NO words — the
 * authenticity contract from the reflect node (no synthesised transitions) is
 * the reason composition must never call a model.
 *
 * Empty optional sections are dropped; required sections are always present so
 * downstream consumers see the full document shape.
 */
export function composeDocument(
  template: ArtefactTemplate,
  reflection: ReflectionSection[]
): ComposedSection[] {
  const textByProbe = new Map(
    reflection.filter((r) => r.covered && r.text.trim().length > 0).map((r) => [r.sectionId, r.text.trim()])
  );

  const composed: ComposedSection[] = [];

  for (const section of [...template.sections].sort((a, b) => a.order - b.order)) {
    const text = section.probes
      .map((p) => textByProbe.get(p.id))
      .filter((t): t is string => Boolean(t))
      .join('\n\n');

    if (text.length === 0 && !section.required) continue;

    composed.push({ sectionId: section.id, label: section.label, text });
  }

  return composed;
}
