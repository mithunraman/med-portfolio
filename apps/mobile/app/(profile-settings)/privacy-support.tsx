import { SettingsItem, SettingsSection } from '@/components';
import { LEGAL_URLS, SUPPORT_MAILTO } from '@/constants/legal';
import { useAppDispatch, useAuth } from '@/hooks';
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

  const hasPendingDeletion = !!user?.deletionScheduledFor;

  // SettingsItem.onPress is sync, so the rejection has to be caught here or it
  // surfaces as an unhandled promise (same pattern as LinksBlock).
  const openLegalPage = (url: string) => {
    openInAppBrowser(url).catch((error) => {
      settingsLogger.warn('Failed to open legal page', { url, error });
    });
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account?',
      'Your data will be permanently deleted after 48 hours. You can cancel this anytime before then.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Account',
          style: 'destructive',
          onPress: () => {
            dispatch(requestDeletion());
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

        {/* Danger Zone */}
        {!isGuest && !hasPendingDeletion && (
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
