import { useEffect, useState } from 'react';
import {
  Container,
  Title,
  Text,
  Button,
  Group,
  Card,
  Stack,
  Badge,
  TextInput,
  Textarea,
  Modal,
  ActionIcon,
  Loader,
  Center,
  Alert,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { IconPlus, IconTrash, IconAlertCircle } from '@tabler/icons-react';
import { CreateItemSchema, ItemStatusLabels, type Item, type CreateItemDto } from '@acme/shared';
import { api } from '@/api/client';
import { useAuth } from '@/auth';

export function DashboardPage() {
  const { user, logout } = useAuth();
  const [items, setItems] = useState<Item[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [opened, { open, close }] = useDisclosure(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateItemDto>({
    resolver: zodResolver(CreateItemSchema),
  });

  const fetchItems = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await api.items.list();
      setItems(response.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch items');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchItems();
  }, []);

  const onCreateItem = async (data: CreateItemDto) => {
    try {
      const newItem = await api.items.create(data);
      setItems((prev) => [newItem, ...prev]);
      reset();
      close();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create item');
    }
  };

  const onDeleteItem = async (id: string) => {
    try {
      await api.items.delete(id);
      setItems((prev) => prev.filter((item) => item.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete item');
    }
  };

  return (
    <Container size="md" py="xl">
      <Group justify="space-between" mb="xl">
        <div>
          <Title order={2}>Dashboard</Title>
          <Text c="dimmed">Welcome, {user?.name}</Text>
        </div>
        <Group>
          <Button leftSection={<IconPlus size={16} />} onClick={open}>
            New Item
          </Button>
          <Button variant="outline" onClick={logout}>
            Logout
          </Button>
        </Group>
      </Group>

      {error && (
        <Alert icon={<IconAlertCircle size={16} />} color="red" variant="light" mb="md">
          {error}
        </Alert>
      )}

      {isLoading ? (
        <Center py="xl">
          <Loader />
        </Center>
      ) : items.length === 0 ? (
        <Card withBorder p="xl" ta="center">
          <Text c="dimmed">No items yet. Create your first item!</Text>
        </Card>
      ) : (
        <Stack>
          {items.map((item) => (
            <Card key={item.id} withBorder>
              <Group justify="space-between">
                <div>
                  <Group gap="xs" mb="xs">
                    <Text fw={500}>{item.name}</Text>
                    <Badge size="sm" variant="light">
                      {ItemStatusLabels[item.status]}
                    </Badge>
                  </Group>
                  {item.description && (
                    <Text size="sm" c="dimmed">
                      {item.description}
                    </Text>
                  )}
                </div>
                <ActionIcon
                  color="red"
                  variant="subtle"
                  onClick={() => onDeleteItem(item.id)}
                >
                  <IconTrash size={16} />
                </ActionIcon>
              </Group>
            </Card>
          ))}
        </Stack>
      )}

      <Modal opened={opened} onClose={close} title="Create New Item">
        <form onSubmit={handleSubmit(onCreateItem)}>
          <Stack>
            <TextInput
              label="Name"
              placeholder="Item name"
              {...register('name')}
              error={errors.name?.message}
            />
            <Textarea
              label="Description"
              placeholder="Optional description"
              {...register('description')}
              error={errors.description?.message}
            />
            <Button type="submit" loading={isSubmitting}>
              Create
            </Button>
          </Stack>
        </form>
      </Modal>
    </Container>
  );
}
