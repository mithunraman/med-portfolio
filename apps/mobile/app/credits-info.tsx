import { api } from '@/api/client';
import { SkeletonBone } from '@/components/SkeletonBone';
import { SkeletonProvider } from '@/components/SkeletonProvider';
import { useTheme } from '@/theme';
import type { CreditInfoItem } from '@acme/shared';
import { Feather } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

type Status = 'loading' | 'error' | 'success';

let cachedItems: CreditInfoItem[] | null = null;

function CreditInfoCard({
  item,
  index,
  colors,
}: {
  item: CreditInfoItem;
  index: number;
  colors: { primary: string; text: string; textSecondary: string };
}) {
  return (
    <View style={styles.card}>
      <View style={[styles.numberBadge, { backgroundColor: colors.primary }]}>
        <Text style={styles.numberText}>{index + 1}</Text>
      </View>
      <View style={styles.cardBody}>
        <Text style={[styles.cardTitle, { color: colors.text }]}>{item.title}</Text>
        <Text style={[styles.cardDescription, { color: colors.textSecondary }]}>
          {item.description}
        </Text>
      </View>
    </View>
  );
}

export default function CreditsInfoScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const [items, setItems] = useState<CreditInfoItem[]>(cachedItems ?? []);
  const [status, setStatus] = useState<Status>(cachedItems ? 'success' : 'loading');

  const fetchInfo = async () => {
    setStatus('loading');
    try {
      const data = await api.quota.getCreditInfo();
      cachedItems = data;
      setItems(data);
      setStatus('success');
    } catch {
      setStatus('error');
    }
  };

  useEffect(() => {
    if (!cachedItems) fetchInfo();
  }, []);

  const header = (
    <Stack.Screen
      options={{
        headerShown: true,
        title: 'AI Credits',
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.text,
        headerShadowVisible: false,
        headerLeft: () => (
          <Pressable onPress={() => router.back()} hitSlop={8}>
            <Feather name="arrow-left" size={24} color={colors.text} />
          </Pressable>
        ),
      }}
    />
  );

  if (status === 'loading') {
    return (
      <ScrollView
        style={[styles.container, { backgroundColor: colors.background }]}
        contentContainerStyle={styles.content}
      >
        {header}
        <SkeletonProvider>
          {[0, 1, 2, 3].map((i) => (
            <View key={i} style={styles.card}>
              <SkeletonBone width={28} height={28} borderRadius={14} style={{ marginTop: 2 }} />
              <View style={styles.cardBody}>
                <SkeletonBone width="60%" height={16} />
                <SkeletonBone width="100%" height={12} style={{ marginTop: 4 }} />
                <SkeletonBone width="75%" height={12} style={{ marginTop: 4 }} />
              </View>
            </View>
          ))}
        </SkeletonProvider>
      </ScrollView>
    );
  }

  if (status === 'error') {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: colors.background }]}>
        {header}
        <Text style={[styles.errorText, { color: colors.textSecondary }]}>
          Couldn't load credit information.
        </Text>
        <TouchableOpacity
          style={[styles.retryButton, { backgroundColor: colors.primary }]}
          onPress={fetchInfo}
          activeOpacity={0.8}
        >
          <Text style={styles.retryText}>Try again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
    >
      {header}
      {items.map((item, index) => (
        <CreditInfoCard key={index} item={item} index={index} colors={colors} />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 20,
    gap: 16,
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    flexDirection: 'row',
    gap: 14,
    alignItems: 'flex-start',
  },
  numberBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  numberText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  cardBody: {
    flex: 1,
    gap: 4,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  cardDescription: {
    fontSize: 14,
    lineHeight: 20,
  },
  errorText: {
    fontSize: 15,
    marginBottom: 16,
    textAlign: 'center',
  },
  retryButton: {
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: 10,
  },
  retryText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
});
