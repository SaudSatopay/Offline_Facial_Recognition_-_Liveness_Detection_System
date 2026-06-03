import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../src/theme/colors';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.line,
          height: 60,
          paddingBottom: 6,
          paddingTop: 6,
        },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMut,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: 'Home', tabBarIcon: ({ color, size }) => <Ionicons name="grid" color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="attendance"
        options={{ title: 'Attend', tabBarIcon: ({ color, size }) => <Ionicons name="scan-circle" color={color} size={size + 4} /> }}
      />
      <Tabs.Screen
        name="enroll"
        options={{ title: 'Enroll', tabBarIcon: ({ color, size }) => <Ionicons name="person-add" color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="records"
        options={{ title: 'Records', tabBarIcon: ({ color, size }) => <Ionicons name="list" color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="settings"
        options={{ title: 'Settings', tabBarIcon: ({ color, size }) => <Ionicons name="settings" color={color} size={size} /> }}
      />
    </Tabs>
  );
}
