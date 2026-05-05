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
        name="cats"
        options={{ title: copy.tabTitle.cats, tabBarIcon: tabIcon('🐱') }}
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
      {/*
        Per PLAN-091 phase 5, the mobile Cats tab is the only entry
        point for the platform entity routes (Cat / Clowder / Cattery
        homes). Cat detail pushes within the Cats tab's own stack
        (`cats/_layout.tsx`); Clowder / Cattery detail screens live in
        sibling folders so their bottom tab bar stays mounted, but
        they do not appear as tabs themselves — `href: null` hides
        them from the tab bar while keeping the Stack-style push
        reachable from Cats directory row taps.
      */}
      <Tabs.Screen name="clowders/[id]" options={{ href: null }} />
      <Tabs.Screen name="catteries/[id]" options={{ href: null }} />
    </Tabs>
  );
}
