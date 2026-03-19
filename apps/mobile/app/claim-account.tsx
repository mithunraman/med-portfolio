import { useAuth } from '@/hooks';
import { useTheme } from '@/theme';
import { OtpSendRequestSchema } from '@acme/shared';
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

export default function ClaimAccountScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { otpSend, claimGuest, devOtp } = useAuth();
  const { colors } = useTheme();

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
        setTimeout(() => nameInputRef.current?.focus(), 100);
      } catch (error) {
        Alert.alert('Error', error instanceof Error ? error.message : 'Failed to send code');
      } finally {
        setIsSending(false);
      }
    },
    [otpSend]
  );

  const handleVerify = useCallback(async () => {
    if (code.length !== 6) return;
    if (name.trim().length < 2) {
      Alert.alert('Name required', 'Please enter your name (at least 2 characters).');
      return;
    }

    setIsVerifying(true);
    try {
      await claimGuest(email, code, name.trim());
      router.back();
    } catch (error) {
      Alert.alert('Error', error instanceof Error ? error.message : 'Failed to create account');
      setCode('');
    } finally {
      setIsVerifying(false);
    }
  }, [claimGuest, email, code, name, router]);

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
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.closeButton}>
          <Text style={[styles.closeText, { color: colors.primary }]}>Cancel</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, 24) }]}
        keyboardShouldPersistTaps="handled"
        bounces={false}
      >
        <Text style={[styles.title, { color: colors.text }]}>
          {step === 'email' ? 'Create your account' : 'Almost there'}
        </Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          {step === 'email'
            ? 'Verify your email to save your data and access it from any device.'
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
            <View>
              <Text style={[styles.label, { color: colors.text }]}>Your name</Text>
              <TextInput
                ref={nameInputRef}
                style={[styles.input, { borderColor: colors.border, color: colors.text }]}
                placeholder="Jane Doe"
                placeholderTextColor={colors.textSecondary}
                autoCapitalize="words"
                autoCorrect={false}
                value={name}
                onChangeText={setName}
                editable={!isLoading}
                returnKeyType="next"
                onSubmitEditing={() => codeInputRef.current?.focus()}
              />
            </View>

            <View>
              <Text style={[styles.label, { color: colors.text }]}>Verification code</Text>
              <TextInput
                ref={codeInputRef}
                style={[styles.codeInput, { borderColor: colors.border, color: colors.text }]}
                placeholder="000000"
                placeholderTextColor={colors.textSecondary}
                keyboardType="number-pad"
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
                (isLoading || code.length !== 6 || name.trim().length < 2) && styles.buttonDisabled,
              ]}
              onPress={handleVerify}
              disabled={isLoading || code.length !== 6 || name.trim().length < 2}
            >
              {isVerifying ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>Create account</Text>
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
  content: {
    paddingHorizontal: 24,
    paddingTop: 24,
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
