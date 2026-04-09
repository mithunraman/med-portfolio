import { useCallback, useState } from 'react';
import { useAuth } from '@/hooks';
import { QuotaUsageSection } from '@/components/QuotaUsageSection';
import { SettingsItem, SettingsSection } from '@/components';
import { useTheme } from '@/theme';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useOfflineAwareInsets } from '@/hooks/useOfflineAwareInsets';

export default function ProfileScreen() {
  const insets = useOfflineAwareInsets();
  const router = useRouter();
  const { colors, isDark, toggleMode } = useTheme();
  const { user, isGuest, logout } = useAuth();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const specialtyLabel = user?.specialty?.name ?? null;
  const stageLabel = user?.specialty?.trainingStage?.label ?? null;

  const handleLogout = () => {
    Alert.alert(
      isGuest ? 'Exit Guest Mode' : 'Sign Out',
      isGuest
        ? 'Are you sure you want to exit? Your guest data will be lost.'
        : 'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: isGuest ? 'Exit' : 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            setIsLoggingOut(true);
            await logout();
          },
        },
      ]
    );
  };

  const handleCreateAccount = useCallback(() => {
    router.push('/claim-account');
  }, [router]);

  const handleChangeSpecialty = useCallback(() => {
    router.push('/(auth)/select-specialty');
  }, [router]);

  return (
    <View
      style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}
    >
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={{ paddingTop: 16, paddingBottom: insets.bottom + 24 }}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.text }]}>Profile</Text>
        </View>

        {/* Hero Identity Card */}
        <TouchableOpacity
          style={[styles.heroCard, { backgroundColor: colors.surface }]}
          onPress={
            isGuest ? handleChangeSpecialty : () => router.push('/(tabs)/profile/account-settings')
          }
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Account settings"
        >
          <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
            <Text style={styles.avatarText}>{user?.name?.charAt(0).toUpperCase() || 'G'}</Text>
          </View>
          <View style={styles.heroInfo}>
            <Text style={[styles.heroName, { color: colors.text }]} numberOfLines={1}>
              {user?.name || 'Guest User'}
            </Text>
            {isGuest ? (
              <Text style={[styles.heroMeta, { color: colors.textSecondary }]}>Guest Mode</Text>
            ) : (
              <Text style={[styles.heroMeta, { color: colors.textSecondary }]} numberOfLines={1}>
                {user?.email || ''}
              </Text>
            )}
            {(specialtyLabel || stageLabel) && (
              <View style={styles.chipRow}>
                {specialtyLabel && (
                  <View style={[styles.chip, { backgroundColor: colors.primary + '14' }]}>
                    <Text style={[styles.chipText, { color: colors.primary }]}>
                      {specialtyLabel}
                    </Text>
                  </View>
                )}
                {stageLabel && (
                  <View style={[styles.chip, { backgroundColor: colors.primary + '14' }]}>
                    <Text style={[styles.chipText, { color: colors.primary }]}>{stageLabel}</Text>
                  </View>
                )}
              </View>
            )}
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
        </TouchableOpacity>

        {/* Guest CTA */}
        {isGuest && (
          <View style={styles.ctaWrapper}>
            <View style={[styles.ctaCard, { backgroundColor: colors.surface }]}>
              <Text style={[styles.ctaText, { color: colors.textSecondary }]}>
                Create an account to save your progress
              </Text>
              <TouchableOpacity
                style={[styles.ctaButton, { backgroundColor: colors.primary }]}
                onPress={handleCreateAccount}
                activeOpacity={0.8}
              >
                <Ionicons name="person-add-outline" size={18} color="#fff" />
                <Text style={styles.ctaButtonText}>Create Account</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Usage Quota */}
        <QuotaUsageSection />

        {/* Navigation Rows */}
        <SettingsSection title="Settings">
          {!isGuest && (
            <SettingsItem
              icon="person-circle-outline"
              label="Account Settings"
              onPress={() => router.push('/(tabs)/profile/account-settings')}
            />
          )}
          <SettingsItem
            icon="moon-outline"
            label="Dark Mode"
            showChevron={false}
            rightElement={
              <Switch
                value={isDark}
                onValueChange={toggleMode}
                trackColor={{ false: colors.border, true: colors.primary }}
              />
            }
          />
          <SettingsItem
            icon="shield-outline"
            label="Privacy & Support"
            onPress={() => router.push('/(tabs)/profile/privacy-support')}
          />
        </SettingsSection>

        {/* Logout */}
        <View style={styles.logoutContainer}>
          <TouchableOpacity
            style={[styles.logoutButton, { borderColor: colors.error }]}
            onPress={handleLogout}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={isGuest ? 'Exit Guest Mode' : 'Sign Out'}
          >
            <Ionicons name="log-out-outline" size={20} color={colors.error} />
            <Text style={[styles.logoutButtonText, { color: colors.error }]}>
              {isGuest ? 'Exit Guest Mode' : 'Sign Out'}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Full-screen blocking overlay during logout */}
      <Modal visible={isLoggingOut} transparent animationType="fade">
        <View style={styles.overlay}>
          <View style={[styles.overlayContent, { backgroundColor: colors.surface }]}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[styles.overlayText, { color: colors.text }]}>
              {isGuest ? 'Exiting guest mode...' : 'Signing out...'}
            </Text>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
  },
  heroCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 24,
    padding: 16,
    borderRadius: 12,
    gap: 14,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '600',
  },
  heroInfo: {
    flex: 1,
    gap: 1,
  },
  heroName: {
    fontSize: 18,
    fontWeight: '600',
  },
  heroMeta: {
    fontSize: 13,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 6,
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
  },
  chipText: {
    fontSize: 11,
    fontWeight: '600',
  },
  ctaWrapper: {
    paddingHorizontal: 16,
    marginBottom: 24,
  },
  ctaCard: {
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    gap: 14,
  },
  ctaText: {
    fontSize: 14,
    textAlign: 'center',
  },
  ctaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 10,
  },
  ctaButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  logoutContainer: {
    paddingHorizontal: 24,
    marginTop: 8,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    gap: 8,
  },
  logoutButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlayContent: {
    paddingHorizontal: 40,
    paddingVertical: 32,
    borderRadius: 16,
    alignItems: 'center',
    gap: 16,
  },
  overlayText: {
    fontSize: 16,
    fontWeight: '500',
  },
});
