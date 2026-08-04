import { SettingsItem, SettingsSection, useLoading } from '@/components';
import { LEGAL_URLS, SUPPORT_MAILTO } from '@/constants/legal';
import { useAppDispatch, useAuth, useGuestDeletion } from '@/hooks';
import { requestDeletion } from '@/store/slices/authSlice';
import { useTheme } from '@/theme';
import { openInAppBrowser, openSystemLink } from '@/utils/external-link';
import { logger } from '@/utils/logger';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';

const settingsLogger = logger.createScope('PrivacySupport');

export default function PrivacySupportScreen() {
  const dispatch = useAppDispatch();
  const { colors } = useTheme();
  const { user, isGuest } = useAuth();
  const { deleteGuestAccount } = useGuestDeletion();
  const { showLoading, hideLoading } = useLoading();

  const hasPendingDeletion = !!user?.deletionScheduledFor;

  // SettingsItem.onPress is sync, so the rejection has to be caught here or it
  // surfaces as an unhandled promise (same pattern as LinksBlock).
  const openLegalPage = (url: string) => {
    openInAppBrowser(url).catch((error) => {
      settingsLogger.warn('Failed to open legal page', { url, error });
    });
  };

  // Real accounts get the 48h window, so the confirmation is the deletion
  // banner appearing rather than a screen transition - but the request itself
  // is a network call, so it still needs a blocking HUD and a visible failure.
  const scheduleDeletion = async () => {
    showLoading('Scheduling deletion...', { dismissibleAfterSec: 5 });
    let failure: unknown = null;
    try {
      await dispatch(requestDeletion()).unwrap();
    } catch (error) {
      failure = error;
    } finally {
      hideLoading();
    }

    if (failure) {
      settingsLogger.warn('Account deletion request failed', { error: failure });
      Alert.alert(
        'Could not delete',
        "We couldn't schedule your account for deletion. Check your connection and try again."
      );
    }
  };

  // Guests are deleted straight away and signed out rather than given the 48h
  // cancellation window - they have no credential to sign back in and cancel
  // with, so the window would only delay the purge. See useGuestDeletion.
  //
  // Deleting the account is also how a user WITHDRAWS the Art 9 consent given at
  // signup (`health_data_consent`), which is why both messages point at export
  // first. Withdrawal must not cost the trainee their portfolio - if the only
  // way out destroys their ARCP evidence, the consent was arguably never freely
  // given. The guest copy leans harder because guests get no grace period.
  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account?',
      isGuest
        ? 'Your entries and data will be permanently deleted and you will be signed out. This cannot be undone.\n\nExport anything you want to keep first - open an entry and share it as a PDF.'
        : 'Your data will be permanently deleted after 48 hours. You can cancel this anytime before then.\n\nExport anything you want to keep first - open an entry and share it as a PDF.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Account',
          style: 'destructive',
          onPress: () => {
            if (isGuest) {
              void deleteGuestAccount();
            } else {
              void scheduleDeletion();
            }
          },
        },
      ]
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        {/* Privacy & Data */}
        <SettingsSection title="Privacy & Data">
          <SettingsItem
            icon="document-text-outline"
            label="Privacy Policy"
            onPress={() => openLegalPage(LEGAL_URLS.privacy)}
          />
          <SettingsItem
            icon="reader-outline"
            label="Terms of Use"
            onPress={() => openLegalPage(LEGAL_URLS.terms)}
          />
        </SettingsSection>

        {/* Support */}
        <SettingsSection title="Support">
          <SettingsItem
            icon="help-circle-outline"
            label="Help & Feedback"
            onPress={() => {
              openSystemLink(SUPPORT_MAILTO).catch((error) => {
                settingsLogger.warn('Failed to open mail composer', { error });
              });
            }}
          />
          <SettingsItem
            icon="information-circle-outline"
            label="About"
            showChevron={false}
            rightElement={
              <Text style={[styles.versionText, { color: colors.textSecondary }]}>v1.0.0</Text>
            }
          />
        </SettingsSection>

        {/* Danger Zone - shown to guests too: App Store Guideline 5.1.1(v)
            covers automatically generated accounts, and a guest account holds
            real entries on the server. */}
        {!hasPendingDeletion && (
          <SettingsSection title="Manage Account">
            <SettingsItem
              icon="trash-outline"
              label="Delete Account"
              onPress={handleDeleteAccount}
            />
          </SettingsSection>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollView: { flex: 1 },
  content: { paddingTop: 16, paddingBottom: 24 },
  versionText: { fontSize: 16 },
});
