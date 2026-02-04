import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
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
import { RegisterRequestSchema, type RegisterRequest } from '@acme/shared';
import { useAuth } from '@/auth';

export function RegisterPage() {
  const navigate = useNavigate();
  const { register: registerUser } = useAuth();
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterRequest>({
    resolver: zodResolver(RegisterRequestSchema),
  });

  const onSubmit = async (data: RegisterRequest) => {
    setError(null);
    try {
      await registerUser(data);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    }
  };

  return (
    <Container size={420} my={40}>
      <Title ta="center">Create an account</Title>
      <Text c="dimmed" size="sm" ta="center" mt={5}>
        Already have an account?{' '}
        <Anchor component={Link} to="/login" size="sm">
          Sign in
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
              label="Name"
              placeholder="Your name"
              {...register('name')}
              error={errors.name?.message}
            />

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
              Create account
            </Button>
          </Stack>
        </form>
      </Paper>
    </Container>
  );
}
