/**
 * Copy and destination for the "invite a colleague" share.
 *
 * The landing page is the share target rather than the App Store listing: it
 * works for an Android recipient too, it renders a link preview card, and it
 * stays under our control if the store URL ever changes. These links live in
 * other people's chat history permanently, so they need to keep working.
 */
export const SHARE_URL = 'https://logdit.app';

/**
 * Sent from the user's own WhatsApp, under their name - so it is written in the
 * first person and deliberately avoids marketing tone. A message that lands in
 * a colleague's chat reading like an advert reflects on the sender, and that is
 * what stops someone ever sharing a second time.
 *
 * Constant by design: nothing user-specific may enter this string. That is what
 * guarantees the feature cannot leak entry content, and it is enforced here
 * rather than by convention at the call site.
 */
export const INVITE_MESSAGE =
  "I've been using this for my portfolio - you talk through a case and it turns it into a " +
  'curriculum-mapped entry in about 5 minutes. Thought it might be useful for you.' +
  `\n\n${SHARE_URL}`;
