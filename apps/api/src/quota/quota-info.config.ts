import type { CreditInfoItem } from '@acme/shared';

/**
 * Static content for the "How do credits work?" screen.
 * Ordered array - rendered as a numbered list on mobile.
 */
export const creditInfoItems: CreditInfoItem[] = [
  {
    title: 'What are AI credits?',
    description:
      'AI credits are used whenever you use an AI feature, like sending a message, uploading audio, or running a portfolio analysis. Each AI action uses 1 credit.',
  },
  {
    title: 'How credits refresh',
    description:
      'Credits refresh automatically - some refill every few hours, and you get a full weekly reset every Monday. Check your profile to see exactly when.',
  },
  {
    title: 'Sign up for more credits',
    description:
      'Guest accounts have limited credits. Create an account to unlock your full credit allowance.',
  },
  {
    title: 'What happens when I run out?',
    description:
      'You can still browse, edit, and manage your portfolio - only AI features are paused until credits refresh. Check your profile to see when.',
  },
];
