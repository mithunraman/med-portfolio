import { useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import {
  Container,
  Paper,
  Title,
  TextInput,
  PasswordInput,
  Button,
  Text,
  Anchor,
  Stack,
  Alert,
} from '@mantine/core';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { IconAlertCircle } from '@tabler/icons-react';
import { LoginRequestSchema, type LoginRequest } from '@acme/shared';
import { useAuth } from '@/auth';

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();
  const [error, setError] = useState<string | null>(null);

  const from = (location.state as { from?: { pathname: string } })?.from?.pathname || '/';

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginRequest>({
    resolver: zodResolver(LoginRequestSchema),
  });

  const onSubmit = async (data: LoginRequest) => {
    setError(null);
    try {
      await login(data);
      navigate(from, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    }
  };

  return (
    <Container size={420} my={40}>
      <Title ta="center">Welcome back</Title>
      <Text c="dimmed" size="sm" ta="center" mt={5}>
        Don&apos;t have an account?{' '}
        <Anchor component={Link} to="/register" size="sm">
          Create account
        </Anchor>
      </Text>

      <Paper withBorder shadow="md" p={30} mt={30} radius="md">
        <form onSubmit={handleSubmit(onSubmit)}>
          <Stack>
            {error && (
              <Alert icon={<IconAlertCircle size={16} />} color="red" variant="light">
                {error}
              </Alert>
            )}

            <TextInput
              label="Email"
              placeholder="you@example.com"
              {...register('email')}
              error={errors.email?.message}
            />

            <PasswordInput
              label="Password"
              placeholder="Your password"
              {...register('password')}
              error={errors.password?.message}
            />

            <Button type="submit" fullWidth mt="xl" loading={isSubmitting}>
              Sign in
            </Button>
          </Stack>
        </form>
      </Paper>
    </Container>
  );
}
