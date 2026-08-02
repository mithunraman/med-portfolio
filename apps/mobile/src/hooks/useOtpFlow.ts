import { OtpSendRequestSchema } from '@acme/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Alert, type TextInput } from 'react-native';
import { useAuth } from './useAuth';

type Step = 'email' | 'code';

// Client-side resend cooldown. The backend already caps sends per email
// (3/window, see OtpService), but a visible countdown stops users burning that
// budget in a panicked burst and turns an invisible limit into a calm one.
const RESEND_COOLDOWN_SECONDS = 30;

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
  const [resendCooldown, setResendCooldown] = useState(0);
  const codeInputRef = useRef<TextInput>(null);
  const nameInputRef = useRef<TextInput>(null);
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const remainingRef = useRef(0);

  const startResendCooldown = useCallback(() => {
    if (cooldownRef.current) clearInterval(cooldownRef.current);
    remainingRef.current = RESEND_COOLDOWN_SECONDS;
    setResendCooldown(remainingRef.current);
    // Side effects (clearInterval + ref mutation) live in the timer callback, not
    // in the setState updater - React may call updaters more than once, so they
    // must stay pure. Here setResendCooldown only ever receives a plain number.
    cooldownRef.current = setInterval(() => {
      remainingRef.current -= 1;
      setResendCooldown(remainingRef.current);
      if (remainingRef.current <= 0) {
        if (cooldownRef.current) clearInterval(cooldownRef.current);
        cooldownRef.current = null;
      }
    }, 1000);
  }, []);

  // Clear the ticking interval if the component unmounts mid-countdown.
  useEffect(() => {
    return () => {
      if (cooldownRef.current) clearInterval(cooldownRef.current);
    };
  }, []);

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
        startResendCooldown();
        if (alwaysShowName) {
          setTimeout(() => nameInputRef.current?.focus(), 100);
        }
      } catch (error) {
        Alert.alert('Error', error instanceof Error ? error.message : 'Failed to send code');
      } finally {
        setIsSending(false);
      }
    },
    [otpSend, alwaysShowName, startResendCooldown]
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
    if (resendCooldown > 0) return;
    setIsSending(true);
    try {
      await otpSend(email);
      startResendCooldown();
      Alert.alert('Code Sent', 'A new code has been sent to your email.');
    } catch (error) {
      Alert.alert('Error', error instanceof Error ? error.message : 'Failed to resend code');
    } finally {
      setIsSending(false);
    }
  }, [otpSend, email, resendCooldown, startResendCooldown]);

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
    resendCooldown,

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
