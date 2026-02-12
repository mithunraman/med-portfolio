import { useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../theme';
import { useAppDispatch, useAppSelector } from '../hooks';
import { markNudgeShown, hideNudge } from '../store';
import type { MainStackScreenProps } from '../navigation/types';

type NavigationProp = MainStackScreenProps<'Home'>['navigation'];

export function SignupNudgeModal() {
  const navigation = useNavigation<NavigationProp>();
  const { colors } = useTheme();
  const dispatch = useAppDispatch();
  const shouldShow = useAppSelector((state) => state.nudge.shouldShowNudge);

  const handleSignUp = useCallback(async () => {
    await dispatch(markNudgeShown());
    navigation.navigate('Onboarding', { screen: 'Register' });
  }, [dispatch, navigation]);

  const handleSignIn = useCallback(async () => {
    await dispatch(markNudgeShown());
    navigation.navigate('Onboarding', { screen: 'Login' });
  }, [dispatch, navigation]);

  const handleDismiss = useCallback(async () => {
    await dispatch(markNudgeShown());
    dispatch(hideNudge());
  }, [dispatch]);

  if (!shouldShow) {
    return null;
  }

  return (
    <Modal visible={shouldShow} transparent animationType="slide">
      <View style={styles.overlay}>
        <View style={[styles.container, { backgroundColor: colors.background }]}>
          {/* Close button */}
          <TouchableOpacity style={styles.closeButton} onPress={handleDismiss}>
            <Text style={[styles.closeButtonText, { color: colors.textSecondary }]}>X</Text>
          </TouchableOpacity>

          {/* Content */}
          <View style={[styles.iconContainer, { backgroundColor: colors.surface }]}>
            <Text style={[styles.iconText, { color: colors.primary }]}>!</Text>
          </View>

          <Text style={[styles.title, { color: colors.text }]}>Save your progress</Text>

          <Text style={[styles.description, { color: colors.textSecondary }]}>
            Create a free account to keep your data safe and access it from any device.
          </Text>

          {/* CTA Buttons */}
          <TouchableOpacity
            style={[styles.primaryButton, { backgroundColor: colors.primary }]}
            onPress={handleSignUp}
            activeOpacity={0.8}
          >
            <Text style={styles.primaryButtonText}>Create free account</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.secondaryButton} onPress={handleSignIn} activeOpacity={0.8}>
            <Text style={[styles.secondaryButtonText, { color: colors.primary }]}>
              I already have an account
            </Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.dismissLink} onPress={handleDismiss} activeOpacity={0.8}>
            <Text style={[styles.dismissLinkText, { color: colors.textSecondary }]}>
              Maybe later
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  container: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
    alignItems: 'center',
  },
  closeButton: {
    position: 'absolute',
    top: 16,
    right: 16,
    padding: 8,
  },
  closeButtonText: {
    fontSize: 18,
    fontWeight: '600',
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    marginTop: 16,
  },
  iconText: {
    fontSize: 28,
    fontWeight: 'bold',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 8,
  },
  description: {
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 24,
    paddingHorizontal: 16,
  },
  primaryButton: {
    width: '100%',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 12,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    paddingVertical: 12,
  },
  secondaryButtonText: {
    fontSize: 16,
    fontWeight: '500',
  },
  dismissLink: {
    paddingVertical: 8,
    marginTop: 8,
  },
  dismissLinkText: {
    fontSize: 14,
  },
});
