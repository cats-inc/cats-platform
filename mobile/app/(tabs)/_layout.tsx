import { Tabs } from 'expo-router';
import { Text } from 'react-native';

import { colors, typography } from '../../src/renderer/theme';
import {
  getMobileTabsCopy,
  resolveDefaultMobileLocale,
} from '../../../src/mobile/index.js';

type TabIconProps = { color: string };

function tabIcon(glyph: string) {
  return ({ color }: TabIconProps) => (
    <Text style={{ color, fontSize: 18, lineHeight: 22 }}>{glyph}</Text>
  );
}

export default function TabsLayout() {
  const copy = getMobileTabsCopy(resolveDefaultMobileLocale());

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.tab.active,
        tabBarInactiveTintColor: colors.tab.inactive,
        tabBarStyle: {
          backgroundColor: colors.tab.background,
          borderTopColor: colors.tab.border,
        },
        tabBarLabelStyle: {
          fontSize: typography.label.fontSize,
          fontWeight: typography.label.fontWeight,
        },
      }}
    >
      <Tabs.Screen
        name="lobby"
        options={{ title: copy.tabTitle.lobby, tabBarIcon: tabIcon('🏠') }}
      />
      <Tabs.Screen
        name="chat"
        options={{ title: copy.tabTitle.chat, tabBarIcon: tabIcon('💬') }}
      />
      <Tabs.Screen
        name="code"
        options={{ title: copy.tabTitle.code, tabBarIcon: tabIcon('⌘') }}
      />
      <Tabs.Screen
        name="work"
        options={{ title: copy.tabTitle.work, tabBarIcon: tabIcon('📋') }}
      />
      <Tabs.Screen
        name="settings"
        options={{ title: copy.tabTitle.settings, tabBarIcon: tabIcon('⚙') }}
      />
    </Tabs>
  );
}
