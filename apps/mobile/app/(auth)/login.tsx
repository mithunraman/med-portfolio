import { useAuth } from '@/hooks';
import { useTheme } from '@/theme';
import { OtpSendRequestSchema } from '@acme/shared';
import { Ionicons } from '@expo/vector-icons';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import {
  ActivityIndicator,
  Alert,
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

type Step = 'email' | 'code';

export default function OtpLoginScreen() {
  const { otpSend, otpVerify, isNewUser, devOtp } = useAuth();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const codeInputRef = useRef<TextInput>(null);
  const nameInputRef = useRef<TextInput>(null);

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<{ email: string }>({
    resolver: zodResolver(OtpSendRequestSchema),
    defaultValues: { email: '' },
  });

  const handleSendOtp = useCallback(
    async (data: { email: string }) => {
      setIsSending(true);
      try {
        await otpSend(data.email);
        setEmail(data.email);
        setStep('code');
        // Focus handled via autoFocus on name field (new user) or code field (returning user)
      } catch (error) {
        Alert.alert('Error', error instanceof Error ? error.message : 'Failed to send code');
      } finally {
        setIsSending(false);
      }
    },
    [otpSend]
  );

  const handleVerifyOtp = useCallback(async () => {
    if (code.length !== 6) return;
    if (isNewUser && name.trim().length < 2) {
      Alert.alert('Name required', 'Please enter your name (at least 2 characters).');
      return;
    }

    setIsVerifying(true);
    try {
      await otpVerify(email, code, isNewUser ? name.trim() : undefined);
      // Navigation happens automatically via RootLayoutNav when status changes
    } catch (error) {
      Alert.alert('Error', error instanceof Error ? error.message : 'Invalid code');
      setCode('');
    } finally {
      setIsVerifying(false);
    }
  }, [otpVerify, email, code, name, isNewUser]);

  const handleResend = useCallback(async () => {
    setIsSending(true);
    try {
      await otpSend(email);
      Alert.alert('Code Sent', 'A new code has been sent to your email.');
    } catch (error) {
      Alert.alert('Error', error instanceof Error ? error.message : 'Failed to resend code');
    } finally {
      setIsSending(false);
    }
  }, [otpSend, email]);

  const handleChangeEmail = useCallback(() => {
    setStep('email');
    setCode('');
    setName('');
  }, []);

  const isLoading = isSending || isVerifying;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={[styles.container, { backgroundColor: colors.background }]}
    >
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: Math.max(insets.top, 24), paddingBottom: Math.max(insets.bottom, 32) },
        ]}
        keyboardShouldPersistTaps="handled"

        bounces={false}
      >
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>

        <Text style={[styles.title, { color: colors.text }]}>
          {step === 'email' ? 'Sign in' : 'Enter code'}
        </Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          {step === 'email'
            ? "We'll send a verification code to your email"
            : `We sent a 6-digit code to ${email}`}
        </Text>

        {step === 'code' && devOtp && (
          <Text style={[styles.devOtp, { color: colors.error }]}>[DEV] OTP: {devOtp}</Text>
        )}

        {step === 'email' ? (
          <View style={styles.form}>
            <View>
              <Text style={[styles.label, { color: colors.text }]}>Email</Text>
              <Controller
                control={control}
                name="email"
                render={({ field: { onChange, onBlur, value } }) => (
                  <TextInput
                    style={[
                      styles.input,
                      { borderColor: colors.border, color: colors.text },
                      errors.email && { borderColor: colors.error },
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
                    editable={!isLoading}
                  />
                )}
              />
              {errors.email && (
                <Text style={[styles.errorText, { color: colors.error }]}>
                  {errors.email.message}
                </Text>
              )}
            </View>

            <TouchableOpacity
              style={[
                styles.button,
                { backgroundColor: colors.primary },
                isLoading && styles.buttonDisabled,
              ]}
              onPress={handleSubmit(handleSendOtp)}
              disabled={isLoading}
            >
              {isSending ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>Send code</Text>
              )}
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.form}>
            {isNewUser && (
              <View>
                <Text style={[styles.label, { color: colors.text }]}>Your name</Text>
                <TextInput
                  ref={nameInputRef}
                  style={[styles.input, { borderColor: colors.border, color: colors.text }]}
                  placeholder="Jane Doe"
                  placeholderTextColor={colors.textSecondary}
                  autoCapitalize="words"
                  autoCorrect={false}
                  autoFocus
                  value={name}
                  onChangeText={setName}
                  editable={!isLoading}
                  returnKeyType="next"
                  onSubmitEditing={() => codeInputRef.current?.focus()}
                />
              </View>
            )}

            <View>
              <Text style={[styles.label, { color: colors.text }]}>Verification code</Text>
              <TextInput
                ref={codeInputRef}
                style={[styles.codeInput, { borderColor: colors.border, color: colors.text }]}
                placeholder="000000"
                placeholderTextColor={colors.textSecondary}
                keyboardType="number-pad"
                autoFocus={!isNewUser}
                maxLength={6}
                value={code}
                onChangeText={setCode}
                editable={!isLoading}
              />
            </View>

            <TouchableOpacity
              style={[
                styles.button,
                { backgroundColor: colors.primary },
                (isLoading || code.length !== 6 || (isNewUser && name.trim().length < 2)) &&
                  styles.buttonDisabled,
              ]}
              onPress={handleVerifyOtp}
              disabled={
                isLoading || code.length !== 6 || (isNewUser === true && name.trim().length < 2)
              }
            >
              {isVerifying ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>Verify</Text>
              )}
            </TouchableOpacity>

            <View style={styles.linkRow}>
              <Text style={[styles.resendText, { color: colors.textSecondary }]}>
                Didn't receive a code?{' '}
              </Text>
              <TouchableOpacity onPress={handleResend} disabled={isSending}>
                <Text style={[styles.resendLink, { color: colors.primary }]}>Resend</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.linkRow}>
              <TouchableOpacity onPress={handleChangeEmail} disabled={isLoading}>
                <Text style={[styles.changeEmailLink, { color: colors.primary }]}>
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
  container: {
    flex: 1,
  },
  backButton: {
    marginBottom: 16,
    width: 40,
    height: 40,
    justifyContent: 'center',
  },
  content: {
    paddingHorizontal: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 22,
    paddingHorizontal: 16,
  },
  devOtp: {
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 16,
  },
  form: {
    gap: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
  },
  codeInput: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontSize: 18,
    textAlign: 'center',
    letterSpacing: 6,
  },
  errorText: {
    fontSize: 12,
    marginTop: 4,
  },
  button: {
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  linkRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 12,
    minHeight: 44,
  },
  resendText: {
    fontSize: 14,
  },
  resendLink: {
    fontSize: 14,
    fontWeight: '600',
  },
  changeEmailLink: {
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
  },
});
