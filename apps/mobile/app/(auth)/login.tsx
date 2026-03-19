import { OtpSendRequestSchema } from '@acme/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useCallback, useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useAuth } from '@/hooks';
import { useTheme } from '@/theme';

type Step = 'email' | 'code';

export default function OtpLoginScreen() {
  const { otpSend, otpVerify } = useAuth();
  const { colors } = useTheme();

  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const codeInputRef = useRef<TextInput>(null);

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
        setTimeout(() => codeInputRef.current?.focus(), 100);
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

    setIsVerifying(true);
    try {
      await otpVerify(email, code);
      // Navigation happens automatically via RootLayoutNav when status changes
    } catch (error) {
      Alert.alert('Error', error instanceof Error ? error.message : 'Invalid code');
      setCode('');
    } finally {
      setIsVerifying(false);
    }
  }, [otpVerify, email, code]);

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
  }, []);

  const isLoading = isSending || isVerifying;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={[styles.container, { backgroundColor: colors.background }]}
    >
      <View style={styles.content}>
        <Text style={[styles.title, { color: colors.text }]}>
          {step === 'email' ? 'Sign in' : 'Enter code'}
        </Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          {step === 'email'
            ? "We'll send a verification code to your email"
            : `We sent a 6-digit code to ${email}`}
        </Text>

        {step === 'email' ? (
          <View style={styles.form}>
            <View style={styles.inputContainer}>
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
              style={[styles.button, { backgroundColor: colors.primary }, isLoading && styles.buttonDisabled]}
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
            <View style={styles.inputContainer}>
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
                (isLoading || code.length !== 6) && styles.buttonDisabled,
              ]}
              onPress={handleVerifyOtp}
              disabled={isLoading || code.length !== 6}
            >
              {isVerifying ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>Verify</Text>
              )}
            </TouchableOpacity>

            <View style={styles.resendRow}>
              <Text style={[styles.resendText, { color: colors.textSecondary }]}>
                Didn't receive a code?{' '}
              </Text>
              <TouchableOpacity onPress={handleResend} disabled={isSending}>
                <Text style={[styles.resendLink, { color: colors.primary }]}>Resend</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity onPress={handleChangeEmail} disabled={isLoading}>
              <Text style={[styles.changeEmailLink, { color: colors.primary }]}>
                Use a different email
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
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
    marginBottom: 32,
    lineHeight: 22,
  },
  form: {
    gap: 16,
  },
  inputContainer: {
    marginBottom: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 8,
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
    padding: 16,
    fontSize: 24,
    textAlign: 'center',
    letterSpacing: 8,
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
  resendRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 8,
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
    marginTop: 4,
  },
});
