import { capabilityAssessmentSchema } from '../tag-capabilities.node';
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

  it('capabilityAssessmentSchema emits reasoning before demonstrated/confidence', () => {
    expect(Object.keys(capabilityAssessmentSchema.shape)).toEqual([
      'code',
      'reasoning',
      'demonstrated',
      'confidence',
    ]);
  });

  it('reflectResponseSchema emits title last', () => {
    expect(Object.keys(reflectResponseSchema.shape)).toEqual([
      'sections',
      'capabilityAnnotations',
      'title',
    ]);
  });
});
