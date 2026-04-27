import { useAuth, useOtpFlow } from '@/hooks';
import { otpFlowStyles as s } from '@/styles/otpFlow';
import { useTheme } from '@/theme';
import { Ionicons } from '@expo/vector-icons';
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

export default function OtpLoginScreen() {
  const { otpVerify } = useAuth();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const onVerify = useCallback(
    async (email: string, code: string, name: string) => {
      await otpVerify(email, code, name || undefined);
      // Navigation happens automatically via RootLayoutNav when status changes
    },
    [otpVerify]
  );

  const flow = useOtpFlow({ onVerify, alwaysShowName: false });

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={[s.container, { backgroundColor: colors.background }]}
    >
      <ScrollView
        contentContainerStyle={[
          s.content,
          { paddingTop: Math.max(insets.top, 24), paddingBottom: Math.max(insets.bottom, 32) },
        ]}
        keyboardShouldPersistTaps="handled"
        bounces={false}
      >
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>

        <Text style={[s.title, { color: colors.text }]}>
          {flow.step === 'email' ? 'Sign in' : 'Enter code'}
        </Text>
        <Text style={[s.subtitle, { color: colors.textSecondary }]}>
          {flow.step === 'email'
            ? "We'll send a verification code to your email"
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
            {flow.showNameField && (
              <View>
                <Text style={[s.label, { color: colors.text }]}>Your name</Text>
                <TextInput
                  ref={flow.nameInputRef}
                  style={[s.input, { borderColor: colors.border, color: colors.text }]}
                  placeholder="Jane Doe"
                  placeholderTextColor={colors.textSecondary}
                  autoCapitalize="words"
                  autoCorrect={false}
                  autoFocus
                  value={flow.name}
                  onChangeText={flow.setName}
                  editable={!flow.isLoading}
                  returnKeyType="next"
                  onSubmitEditing={() => flow.codeInputRef.current?.focus()}
                />
              </View>
            )}

            <View>
              <Text style={[s.label, { color: colors.text }]}>Verification code</Text>
              <TextInput
                ref={flow.codeInputRef}
                style={[s.codeInput, { borderColor: colors.border, color: colors.text }]}
                placeholder="000000"
                placeholderTextColor={colors.textSecondary}
                keyboardType="number-pad"
                autoFocus={!flow.showNameField}
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
                (flow.isLoading ||
                  flow.code.length !== 6 ||
                  (flow.showNameField && flow.name.trim().length < 2)) &&
                  s.buttonDisabled,
              ]}
              onPress={flow.handleVerify}
              disabled={
                flow.isLoading ||
                flow.code.length !== 6 ||
                (flow.showNameField && flow.name.trim().length < 2)
              }
            >
              {flow.isVerifying ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={s.buttonText}>Verify</Text>
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
  backButton: {
    marginBottom: 16,
    width: 40,
    height: 40,
    justifyContent: 'center',
  },
});
