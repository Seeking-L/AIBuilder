import React, { useCallback } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import * as Linking from 'expo-linking';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors, Fonts } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useGenerateAppAsync } from '@/hooks/use-generate-app-async';
import { useGenerateApp } from '@/hooks/use-generate-app';
import { useHealthCheck } from '@/hooks/use-health-check';
import type { AgentEvent, AgentEventType } from '@/lib/api';

export function GenerateAppScreen() {
  const [description, setDescription] = React.useState('');
  const [framework, setFramework] = React.useState('expo');
  const [descriptionError, setDescriptionError] = React.useState<string | null>(null);
  const [showLogs, setShowLogs] = React.useState(true);
  const [openingExpoUrl, setOpeningExpoUrl] = React.useState(false);
  const [openingExpoUrlError, setOpeningExpoUrlError] = React.useState<string | null>(
    null,
  );

  const {
    data: health,
    loading: healthLoading,
    error: healthError,
    refresh,
  } = useHealthCheck();

  const {
    result,
    loading,
    error,
    runGenerateApp,
  } = useGenerateApp();

  const {
    status: asyncStatus,
    events: asyncEvents,
    error: asyncError,
    start: startAsyncGenerate,
    expoUrl: asyncExpoUrl,
  } = useGenerateAppAsync();

  const colorScheme = useColorScheme();
  const insets = useSafeAreaInsets();

  const tintColor = Colors[colorScheme ?? 'light'].tint;
  const backgroundColor = Colors[colorScheme ?? 'light'].background;
  const textColor = Colors[colorScheme ?? 'light'].text;
  const borderColor = Colors[colorScheme ?? 'light'].icon;

  const handleGenerate = useCallback(async () => {
    const trimmed = description.trim();
    if (!trimmed || loading) {
      if (!trimmed) {
        setDescriptionError('请输入你想生成的应用需求');
      }
      return;
    }

    setDescriptionError(null);
    await runGenerateApp(trimmed, framework.trim() || undefined);
  }, [description, framework, loading, runGenerateApp]);

  const hasResult = !!result;
  const events: AgentEvent[] = result?.events ?? [];
  const hasAsyncTask = asyncStatus !== 'idle';

  const handleGenerateRealtime = useCallback(async () => {
    const trimmed = description.trim();
    if (
      !trimmed ||
      asyncStatus === 'starting' ||
      asyncStatus === 'running'
    ) {
      if (!trimmed) {
        setDescriptionError('请输入你想生成的应用需求');
      }
      return;
    }

    setDescriptionError(null);
    await startAsyncGenerate(trimmed, framework.trim() || undefined);
  }, [description, framework, asyncStatus, startAsyncGenerate]);

  const handleViewApplication = useCallback(
    async (expoUrl: string | null | undefined) => {
      if (!expoUrl) return;
      if (openingExpoUrl) return;

      setOpeningExpoUrl(true);
      setOpeningExpoUrlError(null);
      try {
        // 约定：后端传下来的链接应为 exp://...，直接交给 Expo Go 打开。
        if (!expoUrl.startsWith('exp://')) {
          setOpeningExpoUrlError('该应用链接不可用（非 exp://）。');
          return;
        }
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
    },
    [openingExpoUrl],
  );

  return (
    <ThemedView
      style={[
        styles.container,
        { backgroundColor, paddingTop: insets.top + 8 },
      ]}
    >
      {/* 头部标题 */}
      <View style={styles.header}>
        <View style={styles.headerTitleRow}>
          <Text
            style={[
              styles.headerTitle,
              styles.headerTitleAI,
              { color: tintColor, textShadowColor: tintColor },
            ]}
          >
            AI
          </Text>
          <Text
            style={[
              styles.headerTitle,
              styles.headerTitleBuilder,
              { color: textColor },
            ]}
          >
            Builder
          </Text>
        </View>
      </View>

      {/* 后端健康状态 */}
      <ThemedView style={[styles.healthCard, { borderColor }]}>
        <View style={styles.healthRow}>
          <IconSymbol
            name={
              health && !healthError
                ? 'checkmark.seal.fill'
                : 'exclamationmark.triangle.fill'
            }
            size={18}
            color={health && !healthError ? '#16a34a' : '#f97316'}
          />
          <ThemedText style={styles.healthText}>
            {healthLoading && '正在检查后端服务连接...'}
            {!healthLoading &&
              health &&
              !healthError &&
              `后端已连接，工作区：${health.workspaceRoot}`}
            {!healthLoading &&
              !health &&
              healthError &&
              '后端不可用，请确认 http://localhost:4000 是否已启动'}
          </ThemedText>
        </View>
        <TouchableOpacity onPress={refresh} style={styles.healthRefreshButton}>
          <IconSymbol name="arrow.clockwise" size={18} color={tintColor} />
        </TouchableOpacity>
      </ThemedView>

      {/* 主体内容 */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* 表单 */}
        <ThemedView style={styles.section}>
          <ThemedText type="subtitle" style={styles.sectionTitle}>
            应用需求
          </ThemedText>
          <TextInput
            style={[
              styles.textArea,
              {
                backgroundColor:
                  colorScheme === 'dark' ? '#2C2D2E' : '#F2F3F5',
                color: textColor,
                borderColor: descriptionError ? '#ef4444' : 'transparent',
              },
            ]}
            placeholder="例如：用 Expo 搭一个包含登录页和列表页的 demo app"
            placeholderTextColor={Colors[colorScheme ?? 'light'].icon}
            value={description}
            onChangeText={(text) => {
              setDescription(text);
              if (descriptionError && text.trim()) {
                setDescriptionError(null);
              }
            }}
            multiline
            maxLength={1000}
            editable={!loading}
          />
          {descriptionError && (
            <Text style={styles.errorText}>{descriptionError}</Text>
          )}
        </ThemedView>

        <ThemedView style={styles.section}>
          <ThemedText type="subtitle" style={styles.sectionTitle}>
            技术栈（可选）
          </ThemedText>
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor:
                  colorScheme === 'dark' ? '#2C2D2E' : '#F2F3F5',
                color: textColor,
              },
            ]}
            placeholder='例如 "expo"、"nextjs"、"react-native"...'
            placeholderTextColor={Colors[colorScheme ?? 'light'].icon}
            value={framework}
            onChangeText={setFramework}
            editable={!loading}
          />
        </ThemedView>

        {/* 提交按钮 */}
        <TouchableOpacity
          style={[
            styles.primaryButton,
            {
              backgroundColor:
                description.trim() && !loading ? tintColor : 'transparent',
              borderColor: tintColor,
            },
            (!description.trim() || loading) && styles.primaryButtonDisabled,
          ]}
          onPress={handleGenerate}
          disabled={!description.trim() || loading}
        >
          {loading ? (
            <ActivityIndicator color={tintColor} size="small" />
          ) : (
            <View style={styles.primaryButtonContent}>
              <IconSymbol
                name="sparkles"
                size={20}
                color={description.trim() ? '#fff' : tintColor}
              />
              <Text
                style={[
                  styles.primaryButtonText,
                  { color: description.trim() ? '#fff' : tintColor },
                ]}
              >
                生成应用
              </Text>
            </View>
          )}
        </TouchableOpacity>

        {/* 实时生成按钮 */}
        <TouchableOpacity
          style={[
            styles.secondaryButton,
            {
              borderColor: tintColor,
            },
            (!description.trim() ||
              asyncStatus === 'starting' ||
              asyncStatus === 'running') &&
              styles.primaryButtonDisabled,
          ]}
          onPress={handleGenerateRealtime}
          disabled={
            !description.trim() ||
            asyncStatus === 'starting' ||
            asyncStatus === 'running'
          }
        >
          <View style={styles.primaryButtonContent}>
            {(asyncStatus === 'starting' || asyncStatus === 'running') && (
              <ActivityIndicator color={tintColor} size="small" />
            )}
            {(asyncStatus === 'idle' || asyncStatus === 'completed' || asyncStatus === 'failed') && (
              <IconSymbol
                name="waveform.path.ecg"
                size={20}
                color={tintColor}
              />
            )}
            <Text
              style={[
                styles.primaryButtonText,
                { color: tintColor },
              ]}
            >
              {asyncStatus === 'starting'
                ? '创建任务中...'
                : asyncStatus === 'running'
                  ? '实时生成中...'
                  : '实时生成（展示过程）'}
            </Text>
          </View>
        </TouchableOpacity>

        {/* 错误信息 */}
        {error && (
          <ThemedText style={styles.errorHint}>
            {error.message || '生成任务执行失败，请稍后重试'}
          </ThemedText>
        )}

        {/* 实时任务进度状态 */}
        {hasAsyncTask && (
          <ThemedView style={styles.section}>
            <ThemedText type="subtitle" style={styles.sectionTitle}>
              实时生成进度
            </ThemedText>
            <View style={styles.asyncStatusRow}>
              {(asyncStatus === 'starting' || asyncStatus === 'running') && (
                <ActivityIndicator color={tintColor} size="small" />
              )}
              <ThemedText style={styles.asyncStatusText}>
                {asyncStatus === 'starting' &&
                  '任务创建中，请稍候，稍后会开始展示 AI 的工作过程。'}
                {asyncStatus === 'running' &&
                  'AI 正在工作中，下面的时间线会实时更新每一步操作。'}
                {asyncStatus === 'completed' &&
                  '任务已完成，你可以在时间线和生成结果中查看详情。'}
                {asyncStatus === 'failed' &&
                  '任务执行失败，请查看错误信息后重试。'}
              </ThemedText>
            </View>
            {asyncError && (
              <Text style={styles.errorText}>{asyncError}</Text>
            )}
            {asyncEvents.length > 0 && (
              <>
                <ThemedText
                  style={[
                    styles.timelineDescription,
                    { color: Colors[colorScheme ?? 'light'].icon },
                  ]}
                >
                  下面展示的是本次实时任务中 AI 的每一步思考和操作。
                </ThemedText>
                <AgentTimeline events={asyncEvents} />
              </>
            )}

            {/* 实时任务：过程时间线下方（由 asyncExpoUrl 驱动） */}
            {asyncExpoUrl ? (
              <View style={styles.viewAppSection}>
                <TouchableOpacity
                  style={[
                    styles.viewAppButton,
                    {
                      backgroundColor: tintColor,
                      borderColor: tintColor,
                      opacity: openingExpoUrl ? 0.7 : 1,
                    },
                  ]}
                  onPress={() => void handleViewApplication(asyncExpoUrl)}
                  disabled={openingExpoUrl}
                >
                  <View style={styles.viewAppButtonContent}>
                    {openingExpoUrl ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <IconSymbol
                        name="arrow.up.right.square.fill"
                        size={18}
                        color="#fff"
                      />
                    )}
                    <ThemedText style={styles.viewAppButtonText}>
                      查看应用
                    </ThemedText>
                  </View>
                </TouchableOpacity>
              </View>
            ) : null}
          </ThemedView>
        )}

        {/* 结果摘要 */}
        {hasResult && (
          <ThemedView style={styles.section}>
            <ThemedText type="subtitle" style={styles.sectionTitle}>
              结果摘要
            </ThemedText>
            <ThemedView style={styles.summaryCard}>
              <ThemedText>{result?.summary}</ThemedText>
            </ThemedView>
          </ThemedView>
        )}

        {/* 同步任务的 AI 工作过程时间线 */}
        {hasResult && events.length > 0 && (
          <ThemedView style={styles.section}>
            <ThemedText type="subtitle" style={styles.sectionTitle}>
              上一次同步生成过程
            </ThemedText>
            <ThemedText
              style={[
                styles.timelineDescription,
                { color: Colors[colorScheme ?? 'light'].icon },
              ]}
            >
              下面展示的是本次任务中 AI 的每一步思考和操作，便于你理解过程。
            </ThemedText>
            <AgentTimeline events={events} />
          </ThemedView>
        )}

        {/* 同步任务：时间线下方（由 result.expoUrl 驱动，展示优先级在时间线渲染之后） */}
        {hasResult && events.length > 0 && result?.expoUrl ? (
          <View style={styles.viewAppSection}>
            <TouchableOpacity
              style={[
                styles.viewAppButton,
                {
                  backgroundColor: tintColor,
                  borderColor: tintColor,
                  opacity: openingExpoUrl ? 0.7 : 1,
                },
              ]}
              onPress={() => void handleViewApplication(result.expoUrl)}
              disabled={openingExpoUrl}
            >
              <View style={styles.viewAppButtonContent}>
                {openingExpoUrl ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <IconSymbol name="arrow.up.right.square.fill" size={18} color="#fff" />
                )}
                <ThemedText style={styles.viewAppButtonText}>查看应用</ThemedText>
              </View>
            </TouchableOpacity>
          </View>
        ) : null}

        {/* 同步任务：若没有同步过程时间线，则把按钮放在“结果摘要”附近 */}
        {hasResult && events.length === 0 && result?.expoUrl ? (
          <View style={styles.viewAppSection}>
            <TouchableOpacity
              style={[
                styles.viewAppButton,
                {
                  backgroundColor: tintColor,
                  borderColor: tintColor,
                  opacity: openingExpoUrl ? 0.7 : 1,
                },
              ]}
              onPress={() => void handleViewApplication(result.expoUrl)}
              disabled={openingExpoUrl}
            >
              <View style={styles.viewAppButtonContent}>
                {openingExpoUrl ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <IconSymbol name="arrow.up.right.square.fill" size={18} color="#fff" />
                )}
                <ThemedText style={styles.viewAppButtonText}>查看应用</ThemedText>
              </View>
            </TouchableOpacity>
          </View>
        ) : null}

        {openingExpoUrlError ? (
          <Text style={styles.viewAppErrorText}>
            {openingExpoUrlError}
          </Text>
        ) : null}

        {/* 执行日志 */}
        {hasResult && result?.logs?.length > 0 && (
          <ThemedView style={styles.section}>
            <TouchableOpacity
              style={styles.logsHeader}
              onPress={() => setShowLogs((prev) => !prev)}
            >
              <ThemedText type="subtitle" style={styles.sectionTitle}>
                执行详情（调试日志）
              </ThemedText>
              <IconSymbol
                name={showLogs ? 'chevron.up' : 'chevron.down'}
                size={18}
                color={Colors[colorScheme ?? 'light'].icon}
              />
            </TouchableOpacity>
            {showLogs && (
              <ThemedView style={styles.logsContainer}>
                {result.logs.map((line, index) => (
                  <Text
                    key={`${index}-${line.slice(0, 10)}`}
                    style={styles.logLine}
                  >
                    {line}
                  </Text>
                ))}
              </ThemedView>
            )}
          </ThemedView>
        )}
      </ScrollView>
    </ThemedView>
  );
}

function getEventColor(type: AgentEventType): string {
  switch (type) {
    case 'round_start':
      return '#6b7280';
    case 'llm_response':
      return '#3b82f6';
    case 'tool_call':
      return '#f97316';
    case 'tool_result':
      return '#22c55e';
    case 'finished':
      return '#a855f7';
    default:
      return '#6b7280';
  }
}

function AgentTimeline({ events }: { events: AgentEvent[] }) {
  if (!events?.length) return null;

  const sorted = events.slice().sort((a, b) => a.stepId - b.stepId);

  return (
    <ThemedView style={styles.timelineCard}>
      {sorted.map((evt, index) => {
        const color = getEventColor(evt.type);
        return (
          <View key={`${evt.stepId}-${evt.type}-${index}`} style={styles.timelineItem}>
            <View style={styles.timelineItemHeader}>
              <View
                style={[styles.timelineDot, { backgroundColor: color }]}
              />
              <ThemedText style={styles.timelineItemTitle}>
                {evt.title || `步骤 ${evt.stepId}`}
              </ThemedText>
              <Text style={[styles.timelineItemType, { color }]}>
                {evt.type}
              </Text>
            </View>
            {evt.detail && (
              <View style={styles.timelineDetailBox}>
                <Text style={styles.timelineDetailText}>{evt.detail}</Text>
              </View>
            )}
          </View>
        );
      })}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 2,
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  headerTitleAI: {
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  headerTitleBuilder: {
    opacity: 0.9,
  },
  healthCard: {
    marginHorizontal: 16,
    marginBottom: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  healthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  healthText: {
    fontSize: 13,
    flexShrink: 1,
  },
  healthRefreshButton: {
    padding: 6,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
    gap: 16,
  },
  section: {
    gap: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  textArea: {
    minHeight: 100,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    lineHeight: 20,
    borderWidth: 1,
  },
  input: {
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  errorText: {
    fontSize: 12,
    color: '#ef4444',
  },
  primaryButton: {
    marginTop: 4,
    marginHorizontal: 16,
    borderRadius: 24,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  primaryButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  primaryButtonDisabled: {
    opacity: 0.5,
  },
  secondaryButton: {
    marginTop: 8,
    marginHorizontal: 16,
    borderRadius: 24,
    paddingVertical: 9,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    backgroundColor: 'transparent',
  },
  errorHint: {
    marginTop: 8,
    marginHorizontal: 16,
    fontSize: 13,
    color: '#ef4444',
  },
  summaryCard: {
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,0,0,0.12)',
  },
  logsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  logsContainer: {
    marginTop: 8,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: 'rgba(0,0,0,0.04)',
  },
  logLine: {
    fontFamily: Fonts.mono,
    fontSize: 12,
    lineHeight: 18,
  },
  timelineDescription: {
    fontSize: 13,
  },
  asyncStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  asyncStatusText: {
    flex: 1,
    fontSize: 13,
  },
  timelineCard: {
    marginTop: 4,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,0,0,0.08)',
    gap: 8,
  },
  timelineItem: {
    gap: 4,
  },
  timelineItemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  timelineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  timelineItemTitle: {
    fontSize: 14,
    fontWeight: '500',
    flex: 1,
  },
  timelineItemType: {
    fontSize: 12,
    fontWeight: '500',
    textTransform: 'none',
  },
  timelineDetailBox: {
    marginLeft: 16,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: 'rgba(0,0,0,0.03)',
  },
  timelineDetailText: {
    fontFamily: Fonts.mono,
    fontSize: 12,
    lineHeight: 18,
  },

  viewAppSection: {
    marginTop: 10,
    marginHorizontal: 16,
    gap: 8,
  },
  viewAppButton: {
    borderRadius: 24,
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
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
    marginTop: 8,
    marginHorizontal: 16,
    fontSize: 13,
    color: '#ef4444',
  },
});

// 默认路由导出：切换到多对话聊天页实现
export { default } from './chat';

