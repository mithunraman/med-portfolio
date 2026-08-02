import { INVITE_MESSAGE } from '@/config/share';
import { logger } from '@/utils/logger';
import { Linking, Share } from 'react-native';

const shareLogger = logger.createScope('ShareInvite');

export type ShareChannel = 'whatsapp' | 'system';

/**
 * Opens a share surface pre-filled with the invite message.
 *
 * Resolves `true` when a surface opened, `false` when nothing could be opened.
 * Note that "opened" is not "sent": neither the WhatsApp deep link nor
 * `Share.share` reports reliably whether the user actually sent the message, so
 * callers must not confirm a send they did not observe.
 *
 * Lives outside React so any future trigger (e.g. a prompt after a completed
 * entry) reuses the channel handling rather than re-deriving the URL scheme.
 */
export async function shareInvite(channel: ShareChannel): Promise<boolean> {
  if (channel === 'whatsapp') {
    try {
      await Linking.openURL(`whatsapp://send?text=${encodeURIComponent(INVITE_MESSAGE)}`);
      return true;
    } catch {
      // WhatsApp isn't installed. Falling through to the OS sheet - which lists
      // whatever the user does have - beats surfacing an error they can't act
      // on. Detecting this up front with `canOpenURL` would need the scheme
      // declared in iOS `LSApplicationQueriesSchemes`, i.e. a native rebuild,
      // for the same outcome.
      shareLogger.info('WhatsApp unavailable, falling back to the system share sheet');
    }
  }

  try {
    // The URL is embedded in `message` rather than passed as `url` because
    // Android's Share ignores `url` entirely and would drop the link.
    await Share.share({ message: INVITE_MESSAGE });
    return true;
  } catch (error) {
    shareLogger.warn('Share sheet failed to open', { error: String(error) });
    return false;
  }
}
