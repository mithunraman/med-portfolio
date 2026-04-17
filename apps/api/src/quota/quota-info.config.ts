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
    title: 'Session credits',
    description:
      'Some credits refresh every 4 hours. As time passes, used credits become available again automatically.',
  },
  {
    title: 'Weekly credits',
    description:
      'You also get a weekly credit allowance that resets every Monday. This helps ensure you have access to AI features throughout the week.',
  },
  {
    title: 'What happens when I run out?',
    description:
      'You can still browse, edit, and manage your portfolio. Only AI-powered features are paused until your credits refresh. You can always check your profile to see when that will happen.',
  },
  {
    title: 'Why do credits exist?',
    description:
      'AI features rely on powerful models to generate messages, transcribe audio, and run analyses. Credits help us keep the experience fast and reliable for everyone.',
  },
];
