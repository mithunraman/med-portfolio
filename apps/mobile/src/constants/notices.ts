import { NoticeSeverity } from '@acme/shared';

export const SEVERITY_COLORS: Record<NoticeSeverity, string> = {
  [NoticeSeverity.INFO]: '#2563eb',
  [NoticeSeverity.WARNING]: '#b45309',
  [NoticeSeverity.CRITICAL]: '#d93025',
};
