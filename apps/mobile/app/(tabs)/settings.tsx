import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Alert, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/hooks';
import { useTheme } from '@/theme';

interface SettingsItemProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress?: () => void;
  rightElement?: React.ReactNode;
  showChevron?: boolean;
}

function SettingsItem({ icon, label, onPress, rightElement, showChevron = true }: SettingsItemProps) {
  const { colors } = useTheme();

  return (
    <TouchableOpacity
      style={[styles.settingsItem, { borderBottomColor: colors.border }]}
      onPress={onPress}
      disabled={!onPress && !rightElement}
      activeOpacity={onPress ? 0.7 : 1}
    >
      <View style={styles.settingsItemLeft}>
        <Ionicons name={icon} size={22} color={colors.textSecondary} style={styles.settingsIcon} />
        <Text style={[styles.settingsLabel, { color: colors.text }]}>{label}</Text>
      </View>
      {rightElement || (showChevron && onPress && (
        <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
      ))}
    </TouchableOpacity>
  );
}

interface SettingsSectionProps {
  title: string;
  children: React.ReactNode;
}

function SettingsSection({ title, children }: SettingsSectionProps) {
  const { colors } = useTheme();

  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>{title}</Text>
      <View style={[styles.sectionContent, { backgroundColor: colors.surface }]}>
        {children}
      </View>
    </View>
  );
}

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { colors, isDark, toggleMode } = useTheme();
  const { user, isGuest, logout } = useAuth();

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
          onPress: logout,
        },
      ]
    );
  };

  const handleCreateAccount = () => {
    router.push('/(auth)/register');
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={{ paddingTop: 16, paddingBottom: insets.bottom + 24 }}
      >
        {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>Settings</Text>
      </View>

      {/* Account Section */}
      <SettingsSection title="Account">
        <View style={[styles.accountInfo, { borderBottomColor: colors.border }]}>
          <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
            <Text style={styles.avatarText}>
              {user?.name?.charAt(0).toUpperCase() || 'G'}
            </Text>
          </View>
          <View style={styles.accountDetails}>
            <Text style={[styles.accountName, { color: colors.text }]}>
              {user?.name || 'Guest User'}
            </Text>
            {isGuest ? (
              <View style={[styles.guestBadge, { backgroundColor: colors.border }]}>
                <Text style={[styles.guestBadgeText, { color: colors.textSecondary }]}>
                  Guest Mode
                </Text>
              </View>
            ) : (
              <Text style={[styles.accountEmail, { color: colors.textSecondary }]}>
                {user?.email || ''}
              </Text>
            )}
          </View>
        </View>
        {isGuest && (
          <SettingsItem
            icon="person-add-outline"
            label="Create Account"
            onPress={handleCreateAccount}
          />
        )}
      </SettingsSection>

      {/* Preferences Section */}
      <SettingsSection title="Preferences">
        <SettingsItem
          icon="moon-outline"
          label="Dark Mode"
          showChevron={false}
          rightElement={
            <Switch
              value={isDark}
              onValueChange={toggleMode}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor="#fff"
            />
          }
        />
        <SettingsItem
          icon="notifications-outline"
          label="Notifications"
          onPress={() => Alert.alert('Coming Soon', 'Notification settings will be available soon.')}
        />
        <SettingsItem
          icon="language-outline"
          label="Language"
          onPress={() => Alert.alert('Coming Soon', 'Language settings will be available soon.')}
        />
      </SettingsSection>

      {/* Support Section */}
      <SettingsSection title="Support">
        <SettingsItem
          icon="help-circle-outline"
          label="Help Center"
          onPress={() => Alert.alert('Help', 'Contact support@example.com for help.')}
        />
        <SettingsItem
          icon="document-text-outline"
          label="Privacy Policy"
          onPress={() => Alert.alert('Privacy Policy', 'Privacy policy will be available soon.')}
        />
        <SettingsItem
          icon="information-circle-outline"
          label="Terms of Service"
          onPress={() => Alert.alert('Terms of Service', 'Terms will be available soon.')}
        />
      </SettingsSection>

      {/* About Section */}
      <SettingsSection title="About">
        <SettingsItem
          icon="code-slash-outline"
          label="App Version"
          showChevron={false}
          rightElement={
            <Text style={[styles.versionText, { color: colors.textSecondary }]}>1.0.0</Text>
          }
        />
      </SettingsSection>

      {/* Logout Button */}
      <View style={styles.logoutContainer}>
        <TouchableOpacity
          style={[styles.logoutButton, { borderColor: colors.error }]}
          onPress={handleLogout}
          activeOpacity={0.8}
        >
          <Ionicons name="log-out-outline" size={20} color={colors.error} />
          <Text style={[styles.logoutButtonText, { color: colors.error }]}>
            {isGuest ? 'Exit Guest Mode' : 'Sign Out'}
          </Text>
        </TouchableOpacity>
      </View>
      </ScrollView>
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
    paddingHorizontal: 24,
    paddingBottom: 16,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
    paddingHorizontal: 24,
  },
  sectionContent: {
    marginHorizontal: 16,
    borderRadius: 12,
    overflow: 'hidden',
  },
  accountInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '600',
  },
  accountDetails: {
    flex: 1,
  },
  accountName: {
    fontSize: 17,
    fontWeight: '600',
    marginBottom: 2,
  },
  accountEmail: {
    fontSize: 14,
  },
  guestBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    marginTop: 4,
  },
  guestBadgeText: {
    fontSize: 12,
    fontWeight: '500',
  },
  settingsItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  settingsItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  settingsIcon: {
    marginRight: 12,
  },
  settingsLabel: {
    fontSize: 16,
  },
  versionText: {
    fontSize: 16,
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
});
