import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { AgentEvent, AgentEventType } from '@/lib/api';
import { Fonts } from '@/constants/theme';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';

export interface AgentTimelineProps {
  events: AgentEvent[];
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
    case 'command_start':
      return '#10b981';
    case 'command_output':
      return '#0ea5e9';
    case 'command_end':
      return '#14b8a6';
    default:
      return '#6b7280';
  }
}

function CommandBlock({ stepId, events }: { stepId: number; events: AgentEvent[] }) {
  const start = events.find((e) => e.type === 'command_start');
  const outputs = events.filter((e) => e.type === 'command_output');
  const end = events.find((e) => e.type === 'command_end');

  const commandText = start?.detail?.trim() || start?.title?.trim() || `command(${stepId})`;

  return (
    <ThemedView style={styles.timelineItem}>
      <View style={styles.timelineItemHeader}>
        <View
          style={[styles.timelineDot, { backgroundColor: getEventColor('command_start') }]}
        />
        <ThemedText style={styles.timelineItemTitle}>{`$ ${commandText}`}</ThemedText>
        <Text style={[styles.timelineItemType, { color: getEventColor('command_start') }]}>
          command
        </Text>
      </View>

      {outputs.length > 0 && (
        <ThemedView style={styles.commandOutputBox}>
          {outputs.map((evt, index) => {
            const isStderr = evt.title === 'stderr';
            const textColor = isStderr ? '#ef4444' : '#e5e7eb';
            return (
              <Text
                key={`${stepId}-${index}`}
                style={[
                  styles.commandOutputLine,
                  { color: textColor },
                ]}
              >
                {evt.detail ?? ''}
              </Text>
            );
          })}
        </ThemedView>
      )}

      {end?.detail && (
        <ThemedView style={styles.commandEndBox}>
          <Text style={styles.commandEndText}>{end.detail}</Text>
        </ThemedView>
      )}
    </ThemedView>
  );
}

export function AgentTimeline({ events }: AgentTimelineProps) {
  const stepGroups = useMemo(() => {
    // 按 stepId 将事件分组；并保留第一次出现的 stepId 顺序
    const order: number[] = [];
    const map = new Map<number, AgentEvent[]>();

    for (const evt of events ?? []) {
      if (!map.has(evt.stepId)) {
        order.push(evt.stepId);
        map.set(evt.stepId, []);
      }
      map.get(evt.stepId)?.push(evt);
    }

    return order.map((stepId) => ({
      stepId,
      events: map.get(stepId) ?? [],
    }));
  }, [events]);

  if (!events?.length) return null;

  return (
    <ThemedView style={styles.timelineCard}>
      {stepGroups.map(({ stepId, events: groupEvents }) => {
        const hasCommandStart = groupEvents.some((e) => e.type === 'command_start');
        if (hasCommandStart) {
          return <CommandBlock key={`cmd-${stepId}`} stepId={stepId} events={groupEvents} />;
        }

        // 非 command 的事件：按顺序逐条渲染
        return groupEvents.map((evt, idx) => {
          const color = getEventColor(evt.type);
          return (
            <View
              key={`${evt.stepId}-${evt.type}-${idx}`}
              style={styles.timelineItem}
            >
              <View style={styles.timelineItemHeader}>
                <View style={[styles.timelineDot, { backgroundColor: color }]} />
                <ThemedText style={styles.timelineItemTitle}>
                  {evt.title || `步骤 ${evt.stepId}`}
                </ThemedText>
                <Text style={[styles.timelineItemType, { color }]}>{evt.type}</Text>
              </View>
              {evt.detail && (
                <View style={styles.timelineDetailBox}>
                  <Text style={styles.timelineDetailText}>{evt.detail}</Text>
                </View>
              )}
            </View>
          );
        });
      })}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  timelineCard: {
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
  commandOutputBox: {
    marginLeft: 16,
    marginTop: 2,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: 'rgba(0,0,0,0.03)',
  },
  commandOutputLine: {
    fontFamily: Fonts.mono,
    fontSize: 12,
    lineHeight: 18,
  },
  commandEndBox: {
    marginLeft: 16,
    marginTop: 4,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: 'rgba(16,185,129,0.08)',
  },
  commandEndText: {
    fontFamily: Fonts.mono,
    fontSize: 12,
    lineHeight: 18,
    color: '#10b981',
  },
});

