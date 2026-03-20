import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import type { ConversationSummary } from '@/lib/api';

export interface ConversationTabsProps {
  conversations: ConversationSummary[];
  activeConversationId: string | null;
  onSelect: (conversationId: string) => void;
  onCreate: () => Promise<void> | void;
  disabled?: boolean;
}

export function ConversationTabs({
  conversations,
  activeConversationId,
  onSelect,
  onCreate,
  disabled,
}: ConversationTabsProps) {
  const colorScheme = useColorScheme();
  const insets = useSafeAreaInsets();

  const activeBg = useMemo(() => {
    return Colors[colorScheme ?? 'light'].tint;
  }, [colorScheme]);

  return (
    <ThemedView
      style={[
        styles.container,
        // 这里用 safe-area 的顶部安全区来“向下留出空间”：
        // - 在手机前置摄像头/状态栏区域，系统会通过 insets.top 告诉我们需要避开的高度
        // - 在此基础上再额外加一点 padding，确保视觉上不会贴得太紧
        { paddingTop: 8 + insets.top },
      ]}
    >
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabsRow}
      >
        {conversations.map((conv, index) => {
          const isActive = conv.conversationId === activeConversationId;
          const label = (conv.title ?? '').trim() || `对话 ${index + 1}`;

          return (
            <TouchableOpacity
              key={conv.conversationId}
              style={[
                styles.tab,
                isActive && { backgroundColor: activeBg, borderColor: activeBg },
              ]}
              onPress={() => onSelect(conv.conversationId)}
              disabled={disabled}
            >
              <ThemedText
                numberOfLines={1}
                style={[styles.tabText, isActive && { color: '#fff' }]}
              >
                {label}
              </ThemedText>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <TouchableOpacity
        style={[
          styles.newTabButton,
          disabled && { opacity: 0.5 },
          !disabled && { backgroundColor: Colors[colorScheme ?? 'light'].background },
        ]}
        onPress={() => onCreate()}
        disabled={disabled}
      >
        <ThemedText style={{ color: Colors[colorScheme ?? 'light'].tint, fontSize: 18 }}>
          +
        </ThemedText>
        <ThemedText style={styles.newTabText}>新建</ThemedText>
      </TouchableOpacity>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingBottom: 6,
  },
  tabsRow: {
    flexGrow: 1,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  tab: {
    borderWidth: 1,
    borderColor: 'transparent',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    maxWidth: 180,
  },
  tabText: {
    fontSize: 13,
    lineHeight: 16,
    fontWeight: '600',
    // inactive 状态颜色由 ThemedText 默认 theme text 色控制
  },
  newTabButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: Colors.light.icon,
  },
  newTabText: {
    fontSize: 13,
    fontWeight: '600',
  },
});

