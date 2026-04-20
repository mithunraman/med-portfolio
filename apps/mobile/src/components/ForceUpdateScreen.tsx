import type { UpdatePolicy } from '@acme/shared';
import { useTheme } from '@/theme';
import { Ionicons } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface Props {
  updatePolicy: UpdatePolicy;
}

export function ForceUpdateScreen({ updatePolicy }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const handleUpdate = () => {
    Linking.openURL(updatePolicy.storeUrl);
  };

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: colors.background, paddingTop: insets.top, paddingBottom: insets.bottom },
      ]}
    >
      <View style={styles.content}>
        <View style={[styles.iconContainer, { backgroundColor: colors.primary + '15' }]}>
          <Ionicons name="arrow-up-circle-outline" size={64} color={colors.primary} />
        </View>
        <Text style={[styles.title, { color: colors.text }]}>Update Required</Text>
        <Text style={[styles.message, { color: colors.textSecondary }]}>
          {updatePolicy.message ||
            'A new version of the app is available. Please update to continue using the app.'}
        </Text>
        {updatePolicy.latestVersion && (
          <Text style={[styles.version, { color: colors.textSecondary }]}>
            Version {updatePolicy.latestVersion} available
          </Text>
        )}
      </View>
      <TouchableOpacity
        style={[styles.button, { backgroundColor: colors.primary }]}
        onPress={handleUpdate}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel="Update the app"
      >
        <Text style={styles.buttonText}>Update Now</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'space-between',
    paddingHorizontal: 32,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  iconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  message: {
    fontSize: 16,
    lineHeight: 24,
    textAlign: 'center',
    paddingHorizontal: 16,
  },
  version: {
    fontSize: 13,
    marginTop: 4,
  },
  button: {
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 16,
  },
  buttonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },
});
