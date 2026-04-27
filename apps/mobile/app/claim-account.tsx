import { useAuth, useOtpFlow } from '@/hooks';
import { otpFlowStyles as s } from '@/styles/otpFlow';
import { useTheme } from '@/theme';
import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import { Controller } from 'react-hook-form';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function ClaimAccountScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { claimGuest } = useAuth();
  const { colors } = useTheme();

  const onVerify = useCallback(
    async (email: string, code: string, name: string) => {
      await claimGuest(email, code, name);
      router.back();
    },
    [claimGuest, router]
  );

  const flow = useOtpFlow({ onVerify, alwaysShowName: true });

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={[s.container, { backgroundColor: colors.background }]}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.closeButton}>
          <Text style={[styles.closeText, { color: colors.primary }]}>Cancel</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={[s.content, { paddingBottom: Math.max(insets.bottom, 24) }]}
        keyboardShouldPersistTaps="handled"
        bounces={false}
      >
        <Text style={[s.title, { color: colors.text }]}>
          {flow.step === 'email' ? 'Create your account' : 'Almost there'}
        </Text>
        <Text style={[s.subtitle, { color: colors.textSecondary }]}>
          {flow.step === 'email'
            ? 'Verify your email to save your data and access it from any device.'
            : `We sent a 6-digit code to ${flow.email}`}
        </Text>

        {flow.step === 'email' ? (
          <View style={s.form}>
            <View>
              <Text style={[s.label, { color: colors.text }]}>Email</Text>
              <Controller
                control={flow.control}
                name="email"
                render={({ field: { onChange, onBlur, value } }) => (
                  <TextInput
                    style={[
                      s.input,
                      { borderColor: colors.border, color: colors.text },
                      flow.errors.email && { borderColor: colors.error },
                    ]}
                    placeholder="you@example.com"
                    placeholderTextColor={colors.textSecondary}
                    keyboardType="email-address"
                    textContentType="emailAddress"
                    autoComplete="email"
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoFocus
                    onBlur={onBlur}
                    onChangeText={onChange}
                    value={value}
                    editable={!flow.isLoading}
                  />
                )}
              />
              {flow.errors.email && (
                <Text style={[s.errorText, { color: colors.error }]}>
                  {flow.errors.email.message}
                </Text>
              )}
            </View>

            <TouchableOpacity
              style={[
                s.button,
                { backgroundColor: colors.primary },
                flow.isLoading && s.buttonDisabled,
              ]}
              onPress={flow.handleSubmit(flow.handleSendOtp)}
              disabled={flow.isLoading}
            >
              {flow.isSending ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={s.buttonText}>Send code</Text>
              )}
            </TouchableOpacity>
          </View>
        ) : (
          <View style={s.form}>
            <View>
              <Text style={[s.label, { color: colors.text }]}>Your name</Text>
              <TextInput
                ref={flow.nameInputRef}
                style={[s.input, { borderColor: colors.border, color: colors.text }]}
                placeholder="Jane Doe"
                placeholderTextColor={colors.textSecondary}
                autoCapitalize="words"
                autoCorrect={false}
                value={flow.name}
                onChangeText={flow.setName}
                editable={!flow.isLoading}
                returnKeyType="next"
                onSubmitEditing={() => flow.codeInputRef.current?.focus()}
              />
            </View>

            <View>
              <Text style={[s.label, { color: colors.text }]}>Verification code</Text>
              <TextInput
                ref={flow.codeInputRef}
                style={[s.codeInput, { borderColor: colors.border, color: colors.text }]}
                placeholder="000000"
                placeholderTextColor={colors.textSecondary}
                keyboardType="number-pad"
                maxLength={6}
                value={flow.code}
                onChangeText={flow.setCode}
                editable={!flow.isLoading}
              />
            </View>

            <TouchableOpacity
              style={[
                s.button,
                { backgroundColor: colors.primary },
                (flow.isLoading || flow.code.length !== 6 || flow.name.trim().length < 2) &&
                  s.buttonDisabled,
              ]}
              onPress={flow.handleVerify}
              disabled={flow.isLoading || flow.code.length !== 6 || flow.name.trim().length < 2}
            >
              {flow.isVerifying ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={s.buttonText}>Create account</Text>
              )}
            </TouchableOpacity>

            <View style={s.linkRow}>
              <Text style={[s.resendText, { color: colors.textSecondary }]}>
                Didn't receive a code?{' '}
              </Text>
              <TouchableOpacity onPress={flow.handleResend} disabled={flow.isSending}>
                <Text style={[s.resendLink, { color: colors.primary }]}>Resend</Text>
              </TouchableOpacity>
            </View>

            <View style={s.linkRow}>
              <TouchableOpacity onPress={flow.handleChangeEmail} disabled={flow.isLoading}>
                <Text style={[s.changeEmailLink, { color: colors.primary }]}>
                  Use a different email
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  closeButton: {
    paddingVertical: 8,
    paddingHorizontal: 8,
  },
  closeText: {
    fontSize: 16,
    fontWeight: '500',
  },
});
