import type { Message } from '@acme/shared';
import { MessageRole } from '@acme/shared';
import { Ionicons } from '@expo/vector-icons';
import { memo, useCallback, useMemo } from 'react';
import { Modal, Pressable, StyleSheet, Text } from 'react-native';
import type { ContextMenuAction } from './types';

interface Action {
  id: ContextMenuAction;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}

const COPY_ACTION: Action = { id: 'copy', label: 'Copy', icon: 'copy-outline' };
const DELETE_ACTION: Action = { id: 'delete', label: 'Delete', icon: 'trash-outline' };

interface Props {
  message: Message | null;
  onAction: (action: ContextMenuAction, message: Message) => void;
  onDismiss: () => void;
}

export const MessageContextMenu = memo(function MessageContextMenu({
  message,
  onAction,
  onDismiss,
}: Props) {
  const actions = useMemo(() => {
    if (!message) return [COPY_ACTION];
    const items: Action[] = [COPY_ACTION];
    if (message.role === MessageRole.USER) items.push(DELETE_ACTION);
    return items;
  }, [message]);

  const handleAction = useCallback(
    (action: ContextMenuAction) => {
      if (!message) return;
      onAction(action, message);
      onDismiss();
    },
    [message, onAction, onDismiss]
  );

  return (
    <Modal visible={message !== null} transparent animationType="fade" onRequestClose={onDismiss}>
      {/* Backdrop */}
      <Pressable style={styles.backdrop} onPress={onDismiss}>
        {/* Action row — stop propagation so tapping it doesn't dismiss */}
        <Pressable style={styles.menuContainer} onPress={() => {}}>
          {actions.map((action, index) => (
            <Pressable
              key={action.id}
              style={[styles.actionItem, index < actions.length - 1 && styles.actionItemBorder]}
              onPress={() => handleAction(action.id)}
              accessibilityLabel={action.label}
            >
              <Ionicons name={action.icon} size={22} color="#111b21" />
              <Text style={styles.actionLabel}>{action.label}</Text>
            </Pressable>
          ))}
        </Pressable>
      </Pressable>
    </Modal>
  );
});

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuContainer: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    overflow: 'hidden',
    minWidth: 200,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
  },
  actionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  actionItemBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e9edef',
  },
  actionLabel: {
    fontSize: 15,
    color: '#111b21',
  },
});
