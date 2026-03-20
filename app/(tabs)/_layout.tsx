import { Stack } from 'expo-router';
import React from 'react';

/**
 * 说明：
 * - 原项目使用 `expo-router` 的 `Tabs` 作为底部栏导航（home/explore/chat）。
 * - 本次需求移除底部栏，应用启动后默认进入 `chat`。
 * - 因此这里改为 `Stack`：不展示任何 tab bar UI，仅保留页面结构。
 */
export default function TabsLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      {/* 默认路由：`app/(tabs)/index.tsx` 当前通过 re-export 指向 `./chat` */}
      <Stack.Screen name="index" />

      {/* 仍保留 explore 路由，便于后续需要时可通过深链直接访问 */}
      <Stack.Screen name="explore" />
    </Stack>
  );
}
