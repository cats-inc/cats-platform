import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Tabs } from 'expo-router';

import { useMobileLocale } from '../../src/renderer/hooks/useMobileLocale';
import { colors, typography } from '../../src/renderer/theme';
import { getMobileTabsCopy } from '../../../src/mobile/index.js';

type TabIconProps = { color: string };

// Drive the rail off MaterialCommunityIcons so all five icons share
// one stroke weight + one cross-platform glyph set. Earlier mix of
// emoji (🐱 💬 📋 — colorful, render with the system emoji font and
// look different on iOS vs Android) plus monochrome Unicode symbols
// (⌘ ⚙ — sans-serif glyphs) was visually inconsistent both
// cross-platform and inside one platform.
type MaterialCommunityIconName = React.ComponentProps<
  typeof MaterialCommunityIcons
>['name'];

function tabIcon(name: MaterialCommunityIconName) {
  return ({ color }: TabIconProps) => (
    <MaterialCommunityIcons name={name} size={22} color={color} />
  );
}

export default function TabsLayout() {
  // Subscribe to locale changes so a Settings → Language pick
  // immediately re-renders the rail labels (e.g. "Settings" →
  // "設定"). Without this hook the labels stay cached until the
  // user reopens the app.
  const copy = getMobileTabsCopy(useMobileLocale());

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
        options={{ title: copy.tabTitle.cats, tabBarIcon: tabIcon('cat') }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          title: copy.tabTitle.chat,
          tabBarIcon: tabIcon('chat-outline'),
        }}
      />
      <Tabs.Screen
        name="code"
        options={{
          title: copy.tabTitle.code,
          tabBarIcon: tabIcon('code-tags'),
        }}
      />
      <Tabs.Screen
        name="work"
        options={{
          title: copy.tabTitle.work,
          tabBarIcon: tabIcon('briefcase-outline'),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: copy.tabTitle.settings,
          tabBarIcon: tabIcon('cog-outline'),
        }}
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
