import type { CreditInfoItem } from '@acme/shared';

/**
 * Static content for the "How do credits work?" screen.
 * Ordered array - rendered as a numbered list on mobile.
 *
 * Keep this copy free of anything that reads as a purchase or an upgrade tier.
 * Credits are a free abuse limit, but "credits" is also App Store vocabulary for
 * consumable IAP, and the earlier wording ("Sign up for more credits... unlock
 * your full credit allowance") drew a Guideline 2.1(b) business-model query on
 * the 1.0.0 submission. Nothing in the app is purchasable; say so plainly here
 * rather than re-answering the question every release.
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
    title: 'Getting your full allowance',
    description:
      'Guest accounts have a smaller allowance. Creating an account is free and unlocks your full allowance - there is nothing to pay.',
  },
  {
    title: 'What happens when I run out?',
    description:
      'You can still browse, edit, and manage your portfolio - only AI features are paused until credits refresh. Check your profile to see when.',
  },
];
