import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Container,
  Paper,
  Title,
  TextInput,
  PinInput,
  Button,
  Text,
  Stack,
  Alert,
} from '@mantine/core';
import { IconAlertCircle } from '@tabler/icons-react';
import { useAuth } from '@/auth';

type Step = 'email' | 'otp';

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { otpSend, otpVerify } = useAuth();

  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [isNewUser, setIsNewUser] = useState(false);
  const [devOtp, setDevOtp] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const from = (location.state as { from?: { pathname: string } })?.from?.pathname || '/';

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const result = await otpSend(email);
      setIsNewUser(result.isNewUser);
      setDevOtp(result.devOtp);
      setStep('otp');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send code');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (code.length !== 6) return;
    if (isNewUser && name.length < 2) {
      setError('Name must be at least 2 characters');
      return;
    }
    setError(null);
    setIsSubmitting(true);
    try {
      await otpVerify(email, code, isNewUser ? name : undefined);
      navigate(from, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid code');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Container size={420} my={40}>
      <Title ta="center">
        {step === 'email' ? 'Welcome' : 'Enter your code'}
      </Title>
      <Text c="dimmed" size="sm" ta="center" mt={5}>
        {step === 'email'
          ? 'Sign in or create an account with your email'
          : `We sent a 6-digit code to ${email}`}
      </Text>

      <Paper withBorder shadow="md" p={30} mt={30} radius="md">
        {step === 'email' ? (
          <form onSubmit={handleSendOtp}>
            <Stack>
              {error && (
                <Alert icon={<IconAlertCircle size={16} />} color="red" variant="light">
                  {error}
                </Alert>
              )}

              <TextInput
                label="Email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.currentTarget.value)}
                required
                type="email"
              />

              <Button type="submit" fullWidth mt="xl" loading={isSubmitting}>
                Continue
              </Button>
            </Stack>
          </form>
        ) : (
          <form onSubmit={handleVerifyOtp}>
            <Stack>
              {error && (
                <Alert icon={<IconAlertCircle size={16} />} color="red" variant="light">
                  {error}
                </Alert>
              )}

              {devOtp && (
                <Alert color="blue" variant="light">
                  Dev OTP: {devOtp}
                </Alert>
              )}

              {isNewUser && (
                <TextInput
                  label="Name"
                  placeholder="Your name"
                  value={name}
                  onChange={(e) => setName(e.currentTarget.value)}
                  required
                  minLength={2}
                />
              )}

              <PinInput
                length={6}
                type="number"
                value={code}
                onChange={setCode}
                oneTimeCode
                autoFocus
              />

              <Button type="submit" fullWidth mt="xl" loading={isSubmitting} disabled={code.length !== 6}>
                {isNewUser ? 'Create account' : 'Sign in'}
              </Button>

              <Button variant="subtle" size="sm" onClick={() => { setStep('email'); setCode(''); setError(null); }}>
                Use a different email
              </Button>
            </Stack>
          </form>
        )}
      </Paper>
    </Container>
  );
}
