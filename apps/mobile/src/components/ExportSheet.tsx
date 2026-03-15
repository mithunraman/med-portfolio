import { useTheme } from '@/theme';
import { shareAsPdf, copyAsText } from '@/utils/export';
import type { Artefact } from '@acme/shared';
import { Feather } from '@expo/vector-icons';
import { useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

interface ExportSheetProps {
  visible: boolean;
  onClose: () => void;
  artefact: Artefact;
}

export function ExportSheet({ visible, onClose, artefact }: ExportSheetProps) {
  const { colors } = useTheme();
  const [exporting, setExporting] = useState(false);

  const handleSharePdf = async () => {
    setExporting(true);
    try {
      await shareAsPdf(artefact);
      onClose();
    } catch {
      // share sheet dismissed or error — no action needed
    } finally {
      setExporting(false);
    }
  };

  const handleCopyText = async () => {
    await copyAsText(artefact);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={[styles.container, { backgroundColor: colors.background }]}>
          <View style={[styles.handle, { backgroundColor: colors.border }]} />

          <Text style={[styles.title, { color: colors.text }]}>Export Entry</Text>

          <Pressable
            style={[styles.option, { borderColor: colors.border }]}
            onPress={handleSharePdf}
            disabled={exporting}
          >
            {exporting ? (
              <ActivityIndicator size={20} color={colors.primary} />
            ) : (
              <Feather name="file-text" size={20} color={colors.primary} />
            )}
            <View style={styles.optionText}>
              <Text style={[styles.optionTitle, { color: colors.text }]}>Share as PDF</Text>
              <Text style={[styles.optionDesc, { color: colors.textSecondary }]}>
                Save to Files, AirDrop, email, or print
              </Text>
            </View>
            <Feather name="chevron-right" size={18} color={colors.textSecondary} />
          </Pressable>

          <Pressable
            style={[styles.option, { borderColor: colors.border }]}
            onPress={handleCopyText}
          >
            <Feather name="copy" size={20} color={colors.primary} />
            <View style={styles.optionText}>
              <Text style={[styles.optionTitle, { color: colors.text }]}>Copy as text</Text>
              <Text style={[styles.optionDesc, { color: colors.textSecondary }]}>
                Paste into FourteenFish or other apps
              </Text>
            </View>
            <Feather name="chevron-right" size={18} color={colors.textSecondary} />
          </Pressable>

          <Pressable style={styles.cancelButton} onPress={onClose}>
            <Text style={[styles.cancelText, { color: colors.textSecondary }]}>Cancel</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  container: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 20,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderWidth: 1,
    borderRadius: 12,
    marginBottom: 10,
    gap: 12,
  },
  optionText: {
    flex: 1,
  },
  optionTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  optionDesc: {
    fontSize: 12,
    marginTop: 2,
  },
  cancelButton: {
    alignItems: 'center',
    paddingVertical: 14,
    marginTop: 4,
  },
  cancelText: {
    fontSize: 15,
    fontWeight: '500',
  },
});
