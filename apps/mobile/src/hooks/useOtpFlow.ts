import { OtpSendRequestSchema } from '@acme/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useCallback, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Alert, type TextInput } from 'react-native';
import { useAuth } from './useAuth';

type Step = 'email' | 'code';

interface UseOtpFlowOptions {
  /** Called with (email, code, name) when the user submits the OTP code. */
  onVerify: (email: string, code: string, name: string) => Promise<void>;
  /** If true, the name field is always shown (claim flow). If false, only shown for new users (login flow). */
  alwaysShowName: boolean;
}

/**
 * Shared hook for OTP-based auth flows (login + claim-account).
 * Encapsulates form state, validation, and handlers.
 */
export function useOtpFlow({ onVerify, alwaysShowName }: UseOtpFlowOptions) {
  const { otpSend, isNewUser } = useAuth();

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

  const showNameField = alwaysShowName || !!isNewUser;

  const handleSendOtp = useCallback(
    async (data: { email: string }) => {
      setIsSending(true);
      try {
        await otpSend(data.email);
        setEmail(data.email);
        setStep('code');
        if (alwaysShowName) {
          setTimeout(() => nameInputRef.current?.focus(), 100);
        }
      } catch (error) {
        Alert.alert('Error', error instanceof Error ? error.message : 'Failed to send code');
      } finally {
        setIsSending(false);
      }
    },
    [otpSend, alwaysShowName]
  );

  const handleVerify = useCallback(async () => {
    if (code.length !== 6) return;
    if (showNameField && name.trim().length < 2) {
      Alert.alert('Name required', 'Please enter your name (at least 2 characters).');
      return;
    }

    setIsVerifying(true);
    try {
      await onVerify(email, code, name.trim());
    } catch (error) {
      Alert.alert('Error', error instanceof Error ? error.message : 'Invalid code');
      setCode('');
    } finally {
      setIsVerifying(false);
    }
  }, [onVerify, email, code, name, showNameField]);

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

  return {
    // State
    step,
    email,
    code,
    name,
    isSending,
    isVerifying,
    isLoading,
    showNameField,

    // Form
    control,
    errors,
    handleSubmit,

    // Refs
    codeInputRef,
    nameInputRef,

    // Handlers
    handleSendOtp,
    handleVerify,
    handleResend,
    handleChangeEmail,

    // Setters (for controlled inputs)
    setCode,
    setName,
  };
}
