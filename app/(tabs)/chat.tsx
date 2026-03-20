import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import * as Linking from 'expo-linking';

import { ChatMessage } from '@/components/chat-message';
import { AgentTimeline } from '@/components/agent-timeline';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors, Fonts } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import type { MessageRole } from '@/hooks/use-chat';
import { useConversations } from '@/hooks/use-conversations';
import { useConversationMessages } from '@/hooks/use-conversation-messages';
import { useConversationRun } from '@/hooks/use-conversation-run';

export default function ChatScreen() {
  const colorScheme = useColorScheme();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();

  const tintColor = Colors[colorScheme ?? 'light'].tint;
  const backgroundColor = Colors[colorScheme ?? 'light'].background;
  const textColor = Colors[colorScheme ?? 'light'].text;
  const iconColor = Colors[colorScheme ?? 'light'].icon;

  const {
    conversations,
    activeConversationId,
    loading: conversationsLoading,
    error: conversationsError,
    createConversation,
    setActiveConversationId,
  } = useConversations();

  const {
    title: activeTitle,
    messages: conversationMessages,
    loading: messagesLoading,
    error: messagesError,
    reload: reloadMessages,
  } = useConversationMessages(activeConversationId);

  const {
    wsStatus,
    events,
    error: runError,
    send,
    runId,
    expoUrl,
  } = useConversationRun(activeConversationId);

  const [question, setQuestion] = useState('');
  const [autoCreating, setAutoCreating] = useState(false);
  const [openingExpoUrl, setOpeningExpoUrl] = useState(false);
  const [openingExpoUrlError, setOpeningExpoUrlError] = useState<string | null>(
    null,
  );

  /**
   * 只在“首次进入且没有历史对话”时自动创建一次。
   *
   * - 由于会话列表是异步拉取的，且 `activeConversationId` 初始为 `null`，
   *   所以需要一个 guard 防止 useEffect 在多个渲染周期重复触发 create。
   * - 如果 create 失败，本次也不会自动重试（避免无限循环）。
   */
  const didAutoCreateRef = useRef(false);

  // WS 结束后重新拉取消息，保证发送后能看到 assistant/user 消息落盘后的完整历史。
  useEffect(() => {
    if (wsStatus === 'completed' || wsStatus === 'failed') {
      void reloadMessages();
    }
  }, [wsStatus, reloadMessages]);

  // expoUrl 更新后，重置打开状态与错误信息
  useEffect(() => {
    setOpeningExpoUrl(false);
    setOpeningExpoUrlError(null);
  }, [expoUrl]);

  /**
   * 无历史对话时，默认创建一个新 conversation 并进入聊天界面。
   *
   * 需求点：
   * - 去掉底部 tabs 后，应用“打开即聊天”；
   * - 若用户没有任何历史对话，不应该展示空状态文案，
   *   而是应当自动出现一个“新对话”窗口（至少标题区/时间线区域）。
   */
  useEffect(() => {
    if (didAutoCreateRef.current) return;
    if (activeConversationId) return; // 已有 active 就不需要创建
    if (conversationsLoading) return; // 等待会话列表加载完成
    if (conversations.length > 0) return; // 列表里已经有会话，不需要创建

    didAutoCreateRef.current = true;
    setAutoCreating(true);

    void (async () => {
      try {
        await createConversation();
      } catch {
        // createConversation 的 error 会由上层 hook 暴露出来（conversationsError）
        // 这里不做额外处理，避免重复触发。
      } finally {
        setAutoCreating(false);
      }
    })();
  }, [
    activeConversationId,
    conversations,
    conversationsLoading,
    createConversation,
  ]);

  /**
   * 左侧侧滑菜单（drawer）
   *
   * 实现方式：
   * - `drawerAnim` 控制抽屉 translateX（从 -drawerWidth 滑入到 0）
   * - 遮罩层使用 translate/opacity 的动画来提供“其他区域被遮挡”的视觉效果
   */
  const [drawerOpen, setDrawerOpen] = useState(false);
  const drawerAnim = useRef(new Animated.Value(0)).current;
  const drawerWidth = windowWidth * 0.8;

  const overlayOpacity = drawerAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });
  const drawerTranslateX = drawerAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-drawerWidth, 0],
  });

  useEffect(() => {
    Animated.timing(drawerAnim, {
      toValue: drawerOpen ? 1 : 0,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [drawerAnim, drawerOpen]);

  const canSend = useMemo(() => {
    const runConflict =
      !!runError &&
      (runError.includes('A run is already running for this conversation') ||
        runError.toLowerCase().includes('run is already running'));

    return (
      !!activeConversationId &&
      wsStatus !== 'running' &&
      !runConflict &&
      question.trim().length > 0
    );
  }, [activeConversationId, wsStatus, question, runError]);

  const chatBubbles = useMemo(() => {
    return conversationMessages
      .map((m, index) => {
        if (m.role !== 'user' && m.role !== 'assistant') {
          return null;
        }

        return (
          <ChatMessage
            key={`${activeConversationId ?? 'no-conv'}-${index}-${m.role}`}
            role={m.role as MessageRole}
            content={m.content}
          />
        );
      })
      .filter(Boolean);
  }, [activeConversationId, conversationMessages]);

  const handleCreate = useCallback(async () => {
    await createConversation();
  }, [createConversation]);

  const handleCreateFromDrawer = useCallback(async () => {
    // 先关闭抽屉，让用户感知“已切换到新对话”
    setDrawerOpen(false);
    await handleCreate();
  }, [handleCreate]);

  const handleSend = useCallback(async () => {
    if (!canSend) return;
    const text = question.trim();
    // 发送完成后由 WS 状态 effect 触发 reload，这里立即清空输入提升体验
    setQuestion('');
    await send(text);
  }, [canSend, question, send]);

  const handleViewApplication = useCallback(async () => {
    if (!expoUrl) return;
    if (openingExpoUrl) return;

    setOpeningExpoUrl(true);
    setOpeningExpoUrlError(null);
    try {
      await Linking.openURL(expoUrl);
    } catch (e) {
      console.error('Failed to open expo experience:', {
        expoUrl,
        error: e instanceof Error ? e.message : String(e),
      });
      setOpeningExpoUrlError('打开失败，请确认设备已联网且安装 Expo Go。');
    } finally {
      setOpeningExpoUrl(false);
    }
  }, [expoUrl, openingExpoUrl]);

  return (
    <ThemedView style={[styles.container, { backgroundColor }]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          // 迁移顶部 safe-area 间距到 ScrollView，这样菜单按钮不会遮挡到可滚动内容。
          { paddingTop: insets.top + 60 },
          { paddingBottom: insets.bottom + 90 },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        {conversationsError && (
          <ThemedText style={styles.errorText}>
            {conversationsError}
          </ThemedText>
        )}

        {activeConversationId ? (
          <ThemedView style={styles.titleRow}>
            <ThemedText type="subtitle" style={styles.titleText}>
              {(activeTitle ?? '').trim() || '新对话'}
            </ThemedText>
            {wsStatus === 'running' && (
              <View style={styles.runningBadge}>
                <ActivityIndicator size="small" color={tintColor} />
                <ThemedText style={styles.runningBadgeText}>
                  生成中...
                </ThemedText>
              </View>
            )}
          </ThemedView>
        ) : autoCreating ? (
          <ThemedView style={styles.emptyState}>
            <ActivityIndicator size="small" color={tintColor} />
            <ThemedText style={{ marginTop: 8, color: iconColor }}>
              正在创建新对话...
            </ThemedText>
          </ThemedView>
        ) : null}

        {messagesError && (
          <ThemedText style={styles.errorText}>{messagesError}</ThemedText>
        )}

        <ThemedView style={styles.messagesList}>{chatBubbles}</ThemedView>

        {(messagesLoading || events.length > 0 || wsStatus !== 'idle') && (
          <ThemedView style={styles.timelineSection}>
            <ThemedText type="subtitle" style={styles.sectionTitle}>
              过程时间线
            </ThemedText>
            {runError && <ThemedText style={styles.errorText}>{runError}</ThemedText>}
            {wsStatus === 'completed' && (
              <ThemedText style={styles.successText}>
                生成/修改已完成{runId ? `（runId: ${runId}）` : ''}。
              </ThemedText>
            )}
            {wsStatus === 'failed' && !runError && (
              <ThemedText style={styles.errorText}>
                生成/修改失败，请查看上方时间线或稍后重试。
              </ThemedText>
            )}
            {events.length > 0 ? (
              <AgentTimeline events={events} />
            ) : wsStatus === 'running' ? (
              <ThemedText style={{ color: iconColor, fontFamily: Fonts.mono }}>
                正在接收事件...
              </ThemedText>
            ) : null}
          </ThemedView>
        )}

        {/* 过程时间线下方：查看应用按钮（由 expo_url_ready 或 task_status.expoUrl 驱动） */}
        {expoUrl ? (
          <ThemedView style={styles.viewAppSection}>
            <TouchableOpacity
              style={[
                styles.viewAppButton,
                {
                  backgroundColor: tintColor,
                  borderColor: tintColor,
                },
              ]}
              onPress={handleViewApplication}
              disabled={openingExpoUrl}
            >
              {openingExpoUrl ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <View style={styles.viewAppButtonContent}>
                  <IconSymbol name="arrow.up.right.square.fill" size={18} color="#fff" />
                  <ThemedText style={styles.viewAppButtonText}>查看应用</ThemedText>
                </View>
              )}
            </TouchableOpacity>

            {openingExpoUrlError ? (
              <ThemedText style={styles.viewAppErrorText}>
                {openingExpoUrlError}
              </ThemedText>
            ) : null}
          </ThemedView>
        ) : null}
      </ScrollView>

      <ThemedView
        style={[
          styles.inputContainer,
          { paddingBottom: insets.bottom + 12, borderColor: iconColor },
        ]}
      >
        <TextInput
          style={[
            styles.input,
            {
              backgroundColor: colorScheme === 'dark' ? '#2C2D2E' : '#F2F3F5',
              color: textColor,
              borderColor: !canSend && wsStatus === 'running' ? '#f97316' : 'transparent',
            },
          ]}
          placeholder="输入你的问题，然后按发送"
          placeholderTextColor={iconColor}
          value={question}
          onChangeText={setQuestion}
          multiline
          maxLength={1000}
          editable={wsStatus !== 'running'}
        />

        <TouchableOpacity
          style={[
            styles.sendButton,
            { backgroundColor: canSend ? tintColor : 'transparent', borderColor: tintColor },
            (!canSend || wsStatus === 'running') && styles.sendButtonDisabled,
          ]}
          onPress={handleSend}
          disabled={!canSend}
        >
          {wsStatus === 'running' ? (
            <ActivityIndicator size="small" color={tintColor} />
          ) : (
            <IconSymbol name="paperplane.fill" size={20} color={canSend ? '#fff' : tintColor} />
          )}
        </TouchableOpacity>
      </ThemedView>

      {/* 抽屉外区域遮罩 + 抽屉本体 */}
      {/* 遮罩层：覆盖除抽屉以外的区域，点击遮罩可关闭菜单 */}
      <Animated.View
        pointerEvents={drawerOpen ? 'auto' : 'none'}
        style={[
          styles.overlay,
          {
            left: drawerWidth,
            opacity: overlayOpacity,
          },
        ]}
      >
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          activeOpacity={1}
          onPress={() => setDrawerOpen(false)}
        />
      </Animated.View>

      {/* 抽屉：占据屏幕宽度的 80% */}
      <Animated.View
        style={[
          styles.drawer,
          {
            width: drawerWidth,
            transform: [{ translateX: drawerTranslateX }],
            backgroundColor,
          },
        ]}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[
            styles.drawerScrollContent,
            { paddingTop: insets.top + 12 },
          ]}
        >
          {/* 开启新对话按钮 */}
          <TouchableOpacity
            style={[
              styles.newConversationButton,
              { borderColor: iconColor, backgroundColor: 'transparent' },
            ]}
            onPress={handleCreateFromDrawer}
            disabled={conversationsLoading}
          >
            <ThemedText style={[styles.newConversationButtonText, { color: tintColor }]}>
              开启新对话
            </ThemedText>
          </TouchableOpacity>

          <ThemedText type="subtitle" style={[styles.drawerTitle, { color: textColor }]}>
            我的历史对话
          </ThemedText>

          {conversations.length === 0 ? (
            <ThemedText style={[styles.drawerEmptyText, { color: iconColor }]}>
              暂无历史对话（将自动创建新对话）
            </ThemedText>
          ) : null}

          {conversations.map((conv, index) => {
            const isActive = conv.conversationId === activeConversationId;
            const label = (conv.title ?? '').trim() || `对话 ${index + 1}`;

            return (
              <TouchableOpacity
                key={conv.conversationId}
                style={[
                  styles.drawerItem,
                  isActive && { backgroundColor: tintColor, borderColor: tintColor },
                ]}
                onPress={() => {
                  // 先关闭抽屉，再更新 active conversation，避免动画期间点击造成 UI 竞态
                  setDrawerOpen(false);
                  setActiveConversationId(conv.conversationId);
                }}
                disabled={conversationsLoading}
              >
                <ThemedText
                  numberOfLines={1}
                  style={[
                    styles.drawerItemText,
                    isActive && { color: '#fff' },
                  ]}
                >
                  {label}
                </ThemedText>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </Animated.View>

      {/* 左上角菜单按钮：仅在抽屉关闭时渲染，确保“打开抽屉后按钮不可见”。 */}
      {!drawerOpen ? (
        <TouchableOpacity
          style={[
            styles.menuButton,
            {
              position: 'absolute',
              top: insets.top + 8,
              left: 12,
              zIndex: 30,
              borderColor: iconColor,
            },
          ]}
          onPress={() => setDrawerOpen(true)}
          disabled={drawerOpen}
          accessibilityRole="button"
          accessibilityLabel="打开菜单"
        >
          <IconSymbol name="sidebar.left" size={26} color={tintColor} />
        </TouchableOpacity>
      ) : null}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  menuButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 12,
    paddingTop: 0,
    gap: 12,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    alignItems: 'center',
  },
  titleText: {
    flex: 1,
  },
  runningBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  runningBadgeText: {
    fontSize: 13,
    fontWeight: '600',
  },
  emptyState: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  messagesList: {
    gap: 4,
  },
  drawer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    borderRightWidth: StyleSheet.hairlineWidth,
    // borderColor 使用 inline style/视觉兜底
    zIndex: 20,
    elevation: 6,
  },
  overlay: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.45)',
    zIndex: 10,
  },
  drawerScrollContent: {
    paddingHorizontal: 12,
    gap: 12,
  },
  newConversationButton: {
    width: '100%',
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  newConversationButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  drawerTitle: {
    fontSize: 20,
    fontWeight: '800',
    marginTop: 4,
    marginBottom: 4,
  },
  drawerEmptyText: {
    fontSize: 13,
  },
  drawerItem: {
    width: '100%',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'transparent',
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  drawerItemText: {
    fontSize: 13,
    fontWeight: '600',
  },
  timelineSection: {
    gap: 8,
    paddingTop: 10,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  errorText: {
    fontSize: 13,
    color: '#ef4444',
  },
  successText: {
    fontSize: 13,
    color: '#10b981',
    fontWeight: '600',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    borderTopWidth: 1,
    paddingHorizontal: 12,
    paddingTop: 10,
    backgroundColor: 'transparent',
  },
  input: {
    flex: 1,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    lineHeight: 20,
    borderWidth: 1,
    minHeight: 44,
    maxHeight: 140,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
  },
  sendButtonDisabled: {
    opacity: 0.7,
  },
  viewAppSection: {
    marginTop: 10,
    paddingHorizontal: 0,
    gap: 8,
  },
  viewAppButton: {
    marginTop: 2,
    borderWidth: 1.5,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginHorizontal: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewAppButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  viewAppButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  viewAppErrorText: {
    fontSize: 12,
    color: '#ef4444',
    marginLeft: 2,
  },
});

