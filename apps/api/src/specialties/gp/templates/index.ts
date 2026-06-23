import { ArtefactTemplate } from '@acme/shared';
import { CCR_TEMPLATE } from './ccr.template';
import { FEEDBACK_TEMPLATE } from './feedback.template';
import { LEA_SEA_TEMPLATE } from './lea-sea.template';
import { LEADERSHIP_TEMPLATE } from './leadership.template';
import { PRESCRIBING_TEMPLATE } from './prescribing.template';
import { QIA_TEMPLATE } from './qia.template';
import { QIP_TEMPLATE } from './qip.template';
import { GENERIC_REFLECTIVE_TEMPLATE } from './reflective.template';

// GP_TEMPLATES is the single public surface for GP templates; each lives in its
// own file in this folder.
export { CCR_TEMPLATE } from './ccr.template';
export { FEEDBACK_TEMPLATE } from './feedback.template';
export { LEA_SEA_TEMPLATE } from './lea-sea.template';
export { LEADERSHIP_TEMPLATE } from './leadership.template';
export { PRESCRIBING_TEMPLATE } from './prescribing.template';
export { QIA_TEMPLATE } from './qia.template';
export { QIP_TEMPLATE } from './qip.template';
export { GENERIC_REFLECTIVE_TEMPLATE } from './reflective.template';

export const GP_TEMPLATES: Record<string, ArtefactTemplate> = {
  CCR_TEMPLATE,
  LEA_SEA_TEMPLATE,
  GENERIC_REFLECTIVE_TEMPLATE,
  FEEDBACK_TEMPLATE,
  LEADERSHIP_TEMPLATE,
  QIP_TEMPLATE,
  QIA_TEMPLATE,
  PRESCRIBING_TEMPLATE,
};
