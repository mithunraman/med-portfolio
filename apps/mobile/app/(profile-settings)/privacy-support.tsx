import { useAuth } from '@/hooks';
import { useAppDispatch } from '@/hooks';
import { SettingsItem, SettingsSection } from '@/components';
import { requestDeletion } from '@/store/slices/authSlice';
import { useTheme } from '@/theme';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';

export default function PrivacySupportScreen() {
  const dispatch = useAppDispatch();
  const { colors } = useTheme();
  const { user, isGuest } = useAuth();

  const hasPendingDeletion = !!user?.deletionScheduledFor;

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
            icon="shield-checkmark-outline"
            label="How your data is stored"
            onPress={() =>
              Alert.alert(
                'Data Storage',
                'We store your conversations and entries so you can edit and export them. PDFs are stored on your device. Confidential notes are never included in exports.'
              )
            }
          />
          <SettingsItem
            icon="document-text-outline"
            label="Privacy Policy"
            onPress={() => Alert.alert('Privacy Policy', 'Privacy policy will be available soon.')}
          />
          {!isGuest && (
            <SettingsItem
              icon="download-outline"
              label="Export My Data"
              onPress={() => Alert.alert('Export', 'Data export will be available soon.')}
            />
          )}
        </SettingsSection>

        {/* Support */}
        <SettingsSection title="Support">
          <SettingsItem
            icon="help-circle-outline"
            label="Help & Feedback"
            onPress={() => Alert.alert('Help', 'Contact support@example.com for help.')}
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
          <SettingsSection title="Danger Zone">
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
