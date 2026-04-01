import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/hooks';
import { useAppDispatch, useAppSelector } from '@/hooks';
import { SettingsItem, SettingsSection } from '@/components';
import { fetchSpecialties, updateProfile } from '@/store/slices/authSlice';
import { useTheme } from '@/theme';
import { useRouter } from 'expo-router';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

export default function AccountSettingsScreen() {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const { colors } = useTheme();
  const { user } = useAuth();
  const specialties = useAppSelector((s) => s.auth.specialties);

  // Name edit modal state
  const [nameModalVisible, setNameModalVisible] = useState(false);
  const [editedName, setEditedName] = useState(user?.name ?? '');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (specialties.length === 0) {
      dispatch(fetchSpecialties());
    }
  }, [dispatch, specialties.length]);

  const specialtyConfig = specialties.find((s) => s.specialty === user?.specialty);
  const specialtyLabel = specialtyConfig?.name ?? null;
  const stageLabel =
    specialtyConfig?.trainingStages.find((s) => s.code === user?.trainingStage)?.label ??
    user?.trainingStage ??
    null;

  const handleChangeSpecialty = useCallback(() => {
    router.push('/(auth)/select-specialty');
  }, [router]);

  const handleOpenNameEdit = useCallback(() => {
    setEditedName(user?.name ?? '');
    setNameModalVisible(true);
  }, [user?.name]);

  const handleSaveName = useCallback(async () => {
    const trimmed = editedName.trim();
    if (trimmed.length < 2) {
      Alert.alert('Invalid Name', 'Name must be at least 2 characters.');
      return;
    }
    if (trimmed === user?.name) {
      setNameModalVisible(false);
      return;
    }

    setIsSaving(true);
    try {
      await dispatch(
        updateProfile({
          name: trimmed,
          specialty: user!.specialty!,
          trainingStage: user!.trainingStage!,
        })
      ).unwrap();
      setNameModalVisible(false);
    } catch (_err) {
      Alert.alert('Error', 'Failed to update name. Please try again.');
    } finally {
      setIsSaving(false);
    }
  }, [dispatch, editedName, user]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        {/* Personal */}
        <SettingsSection title="Personal">
          <SettingsItem
            icon="person-outline"
            label="Name"
            value={user?.name || 'Not set'}
            onPress={handleOpenNameEdit}
          />
          <SettingsItem
            icon="mail-outline"
            label="Email"
            value={user?.email || ''}
            showChevron={false}
          />
        </SettingsSection>

        {/* Training */}
        {specialtyLabel && (
          <SettingsSection title="Training">
            <SettingsItem
              icon="medical-outline"
              label="Specialty"
              value={specialtyLabel}
              onPress={handleChangeSpecialty}
            />
            {stageLabel && (
              <SettingsItem
                icon="school-outline"
                label="Training Stage"
                value={stageLabel}
                onPress={handleChangeSpecialty}
              />
            )}
          </SettingsSection>
        )}
      </ScrollView>

      {/* Name Edit Modal */}
      <Modal visible={nameModalVisible} transparent animationType="slide">
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Edit Name</Text>
            <TextInput
              style={[
                styles.textInput,
                { color: colors.text, borderColor: colors.border, backgroundColor: colors.background },
              ]}
              value={editedName}
              onChangeText={setEditedName}
              placeholder="Enter your name"
              placeholderTextColor={colors.textSecondary}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={handleSaveName}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalButton, { borderColor: colors.border }]}
                onPress={() => setNameModalVisible(false)}
              >
                <Text style={[styles.modalButtonText, { color: colors.text }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.primaryButton, { backgroundColor: colors.primary }]}
                onPress={handleSaveName}
                disabled={isSaving}
              >
                <Text style={[styles.modalButtonText, { color: '#fff' }]}>
                  {isSaving ? 'Saving...' : 'Save'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollView: { flex: 1 },
  content: { paddingTop: 16, paddingBottom: 24 },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },
  modalContent: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    gap: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  textInput: {
    fontSize: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  primaryButton: {
    borderWidth: 0,
  },
  modalButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
});
