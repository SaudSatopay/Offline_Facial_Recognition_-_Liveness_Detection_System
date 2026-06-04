import 'react-native-gesture-handler'; // must be first — initializes the touch/gesture system
import { useEffect, useState } from 'react';
import { View, Image, Text } from 'react-native';
import { Stack } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { enableScreens } from 'react-native-screens';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import {
  Archivo_400Regular, Archivo_500Medium, Archivo_600SemiBold,
  Archivo_700Bold, Archivo_800ExtraBold, Archivo_900Black,
} from '@expo-google-fonts/archivo';
import { SpaceMono_400Regular, SpaceMono_700Bold } from '@expo-google-fonts/space-mono';
import Ionicons from '@expo/vector-icons/Ionicons';
import { getDb } from '../src/db/database';
import { colors } from '../src/theme/colors';

// Use JS-based screen containers instead of native ones. On RN 0.76 + the old
// architecture, native screens (react-native-screens) can fail to forward
// touch/animation events, leaving the UI rendered but completely unresponsive.
enableScreens(false);

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Archivo_400Regular, Archivo_500Medium, Archivo_600SemiBold,
    Archivo_700Bold, Archivo_800ExtraBold, Archivo_900Black,
    SpaceMono_400Regular, SpaceMono_700Bold,
    ...Ionicons.font, // @expo/vector-icons doesn't auto-load reliably in release
  });
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    getDb();
    const t = setTimeout(() => setTimedOut(true), 1500);
    return () => clearTimeout(t);
  }, []);

  const ready = fontsLoaded || !!fontError || timedOut;

  if (!ready) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', gap: 16 }}>
        <Image source={require('../assets/adaptive-icon.png')} style={{ width: 110, height: 110 }} />
        <Text style={{ color: colors.textFaint, fontSize: 12, letterSpacing: 2 }}>LOADING…</Text>
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        <View style={{ flex: 1, backgroundColor: colors.bg }}>
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }} />
        </View>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
