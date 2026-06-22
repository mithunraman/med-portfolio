import { ArtefactTemplate } from '@acme/shared';
import { CCR_TEMPLATE } from './ccr.template';
import { LEA_SEA_TEMPLATE } from './lea-sea.template';
import { QIA_TEMPLATE } from './qia.template';
import { QIP_TEMPLATE } from './qip.template';
import { SEA_TEMPLATE } from './sea.template';
// Remaining templates still live in ../gp.templates and are migrated into this
// folder one file at a time. GP_TEMPLATES is the single public surface — once a
// template moves here, consumers are unaffected.
import {
  LEA_TEMPLATE,
  FEEDBACK_TEMPLATE,
  LEADERSHIP_TEMPLATE,
  PRESCRIBING_TEMPLATE,
} from '../gp.templates';

export { CCR_TEMPLATE } from './ccr.template';
export { LEA_SEA_TEMPLATE } from './lea-sea.template';
export { QIA_TEMPLATE } from './qia.template';
export { QIP_TEMPLATE } from './qip.template';
export { SEA_TEMPLATE } from './sea.template';
export {
  LEA_TEMPLATE,
  FEEDBACK_TEMPLATE,
  LEADERSHIP_TEMPLATE,
  PRESCRIBING_TEMPLATE,
} from '../gp.templates';

export const GP_TEMPLATES: Record<string, ArtefactTemplate> = {
  CCR_TEMPLATE,
  LEA_SEA_TEMPLATE,
  SEA_TEMPLATE,
  LEA_TEMPLATE,
  FEEDBACK_TEMPLATE,
  LEADERSHIP_TEMPLATE,
  QIP_TEMPLATE,
  QIA_TEMPLATE,
  PRESCRIBING_TEMPLATE,
};
