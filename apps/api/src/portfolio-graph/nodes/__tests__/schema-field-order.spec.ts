import { capabilityAssessmentSchema } from '../tag-capabilities.node';
import { justificationAssessmentSchema } from '../elicit-justification.node';
import { completenessResponseSchema } from '../check-completeness.node';
import { classificationAlternativeSchema, classifyResponseSchema } from '../classify.node';
import { reflectResponseSchema } from '../reflect.node';

/**
 * These schemas drive OpenAI structured outputs via LangChain's
 * `withStructuredOutput`, which converts the Zod object to a JSON Schema by
 * walking `schema.shape` in insertion order. JSON Schema `properties` order is
 * the order OpenAI generates fields — so the key order below is load-bearing:
 * reasoning is emitted before the verdict it justifies (chain-of-thought),
 * and Reflect's `title` is emitted last so it summarises already-generated
 * content.
 *
 * If a dependency bump changes this serialization behaviour, OR a refactor
 * reorders a schema, these assertions fail loudly rather than silently
 * regressing model accuracy.
 */
describe('structured-output schema field order', () => {
  it('classifyResponseSchema emits reasoning before any verdict', () => {
    expect(Object.keys(classifyResponseSchema.shape)).toEqual([
      'reasoning',
      'signalsFound',
      'isRelevant',
      'entryType',
      'confidence',
      'alternatives',
    ]);
  });

  it('classificationAlternativeSchema emits reasoning before the verdict', () => {
    expect(Object.keys(classificationAlternativeSchema.shape)).toEqual([
      'reasoning',
      'entryType',
      'confidence',
    ]);
  });

  it('capabilityAssessmentSchema emits quote then reasoning before the tier verdict', () => {
    expect(Object.keys(capabilityAssessmentSchema.shape)).toEqual([
      'code',
      'quote',
      'reasoning',
      'tier',
    ]);
  });

  it('justificationAssessmentSchema emits evidence → clause → link before the tier verdict', () => {
    expect(Object.keys(justificationAssessmentSchema.shape)).toEqual([
      'code',
      'sourceQuote',
      'descriptorClause',
      'justification',
      'justificationTier',
    ]);
  });

  it('reflectResponseSchema emits title last', () => {
    expect(Object.keys(reflectResponseSchema.shape)).toEqual(['sections', 'title']);
  });

  it('reflect section emits probes (CoT scaffold) before the composed narrative', () => {
    expect(Object.keys(reflectResponseSchema.shape.sections.element.shape)).toEqual([
      'sectionId',
      'probes',
      'narrative',
    ]);
  });

  it('reflect probe emits text then covered', () => {
    expect(
      Object.keys(reflectResponseSchema.shape.sections.element.shape.probes.element.shape)
    ).toEqual(['probeId', 'title', 'text', 'covered']);
  });

  it('completenessResponseSchema emits the partition (assignments) before grades', () => {
    expect(Object.keys(completenessResponseSchema.shape)).toEqual(['assignments', 'sectionGrades']);
  });

  it('completeness assignment emits idea before its section', () => {
    expect(Object.keys(completenessResponseSchema.shape.assignments.element.shape)).toEqual([
      'idea',
      'sectionId',
    ]);
  });

  it('completeness section grade emits tierReason before the tier verdict', () => {
    expect(Object.keys(completenessResponseSchema.shape.sectionGrades.element.shape)).toEqual([
      'sectionId',
      'tierReason',
      'tier',
    ]);
  });
});
