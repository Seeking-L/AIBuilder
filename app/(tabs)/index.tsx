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

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors, Fonts } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useGenerateApp } from '@/hooks/use-generate-app';
import { useHealthCheck } from '@/hooks/use-health-check';

export default function GenerateAppScreen() {
  const [description, setDescription] = React.useState('');
  const [framework, setFramework] = React.useState('expo');
  const [descriptionError, setDescriptionError] = React.useState<string | null>(null);
  const [showLogs, setShowLogs] = React.useState(true);

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

        {/* 错误信息 */}
        {error && (
          <ThemedText style={styles.errorHint}>
            {error.message || '生成任务执行失败，请稍后重试'}
          </ThemedText>
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

        {/* 执行日志 */}
        {hasResult && result?.logs?.length > 0 && (
          <ThemedView style={styles.section}>
            <TouchableOpacity
              style={styles.logsHeader}
              onPress={() => setShowLogs((prev) => !prev)}
            >
              <ThemedText type="subtitle" style={styles.sectionTitle}>
                执行详情
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
});

