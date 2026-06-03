import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../src/theme/colors';
import { font } from '../../src/theme/type';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.bgElev,
          borderTopColor: colors.line,
          borderTopWidth: 1,
          height: 64,
          paddingBottom: 8,
          paddingTop: 8,
          elevation: 0,
        },
        tabBarActiveTintColor: colors.amber,
        tabBarInactiveTintColor: colors.textFaint,
        tabBarLabelStyle: { fontFamily: font.monoBold, fontSize: 9, letterSpacing: 1, textTransform: 'uppercase' },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Status', tabBarIcon: ({ color, size }) => <Ionicons name="pulse" color={color} size={size} /> }} />
      <Tabs.Screen name="attendance" options={{ title: 'Scan', tabBarIcon: ({ color, size }) => <Ionicons name="scan" color={color} size={size + 3} /> }} />
      <Tabs.Screen name="enroll" options={{ title: 'Enrol', tabBarIcon: ({ color, size }) => <Ionicons name="add-circle-outline" color={color} size={size + 2} /> }} />
      <Tabs.Screen name="records" options={{ title: 'Log', tabBarIcon: ({ color, size }) => <Ionicons name="document-text-outline" color={color} size={size} /> }} />
      <Tabs.Screen name="settings" options={{ title: 'Config', tabBarIcon: ({ color, size }) => <Ionicons name="options" color={color} size={size} /> }} />
    </Tabs>
  );
}
