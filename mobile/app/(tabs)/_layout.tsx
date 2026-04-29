import { Tabs } from 'expo-router';
import { Text } from 'react-native';

import { colors, typography } from '../../src/renderer/theme';

type TabIconProps = { color: string };

function tabIcon(glyph: string) {
  return ({ color }: TabIconProps) => (
    <Text style={{ color, fontSize: 18, lineHeight: 22 }}>{glyph}</Text>
  );
}

export default function TabsLayout() {
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
        options={{ title: 'Lobby', tabBarIcon: tabIcon('🏠') }}
      />
      <Tabs.Screen
        name="chat"
        options={{ title: 'Chat', tabBarIcon: tabIcon('💬') }}
      />
      <Tabs.Screen
        name="code"
        options={{ title: 'Code', tabBarIcon: tabIcon('⌘') }}
      />
      <Tabs.Screen
        name="work"
        options={{ title: 'Work', tabBarIcon: tabIcon('📋') }}
      />
      <Tabs.Screen
        name="settings"
        options={{ title: 'Settings', tabBarIcon: tabIcon('⚙') }}
      />
    </Tabs>
  );
}
