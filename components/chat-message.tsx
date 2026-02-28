import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';
import type { MessageRole } from '@/hooks/use-chat';

interface ChatMessageProps {
  role: MessageRole;
  content: string;
}

/**
 * 聊天消息气泡组件
 * 用户消息右对齐，AI 消息左对齐
 */
export function ChatMessage({ role, content }: ChatMessageProps) {
  const colorScheme = useColorScheme();
  const isUser = role === 'user';

  // 根据主题和角色确定颜色
  const bubbleColor = isUser
    ? Colors[colorScheme ?? 'light'].tint
    : colorScheme === 'dark'
      ? '#2C2D2E'
      : '#F2F3F5';

  const textColor = isUser
    ? '#fff'
    : Colors[colorScheme ?? 'light'].text;

  return (
    <View
      style={[
        styles.container,
        isUser ? styles.userContainer : styles.assistantContainer,
      ]}
    >
      <ThemedView
        style={[
          styles.bubble,
          { backgroundColor: bubbleColor },
          isUser ? styles.userBubble : styles.assistantBubble,
        ]}
      >
        <ThemedText
          style={[styles.text, { color: textColor }]}
          lightColor={textColor}
          darkColor={textColor}
        >
          {content}
        </ThemedText>
      </ThemedView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 4,
    paddingHorizontal: 12,
  },
  userContainer: {
    alignItems: 'flex-end',
  },
  assistantContainer: {
    alignItems: 'flex-start',
  },
  bubble: {
    maxWidth: '80%',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
  },
  userBubble: {
    borderBottomRightRadius: 4,
  },
  assistantBubble: {
    borderBottomLeftRadius: 4,
  },
  text: {
    fontSize: 16,
    lineHeight: 22,
  },
});
