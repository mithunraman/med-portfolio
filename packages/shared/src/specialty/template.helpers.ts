import { ArtefactTemplate, OutputSection, Probe, ReadinessTier } from './types';

/**
 * Flatten a template's output sections into the ordered list of leaf probes.
 *
 * Nodes that elicit, score, or organise content operate on probes (the granular
 * units), not on output sections (the document shape). This is the single place
 * that knows how to descend the hierarchy.
 */
export function leafProbes(template: ArtefactTemplate): Probe[] {
  return template.sections.flatMap((s) => s.probes);
}

/** Find the output section that owns a given probe id, or undefined. */
export function outputSectionForProbe(
  template: ArtefactTemplate,
  probeId: string
): OutputSection | undefined {
  return template.sections.find((s) => s.probes.some((p) => p.id === probeId));
}

/** A probe's effective readiness threshold (defaults to 'adequate'). */
export function probeThreshold(probe: Probe): ReadinessTier {
  return probe.threshold ?? 'adequate';
}

/**
 * Wrap a flat list of probes into output sections — one section per probe.
 *
 * Migration helper for templates that have not yet been designed with a true
 * many-probes-to-one-field hierarchy. Each probe becomes its own document
 * field, preserving the pre-hierarchy behaviour exactly.
 */
export function flatSections(probes: Probe[]): OutputSection[] {
  return probes.map((probe, order) => ({
    id: probe.id,
    label: probe.label,
    order,
    required: probe.required,
    probes: [probe],
  }));
}
