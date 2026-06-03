import { useEffect, useState } from 'react';
import { View, Image, Text } from 'react-native';
import { Stack } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import {
  Archivo_400Regular, Archivo_500Medium, Archivo_600SemiBold,
  Archivo_700Bold, Archivo_800ExtraBold, Archivo_900Black,
} from '@expo-google-fonts/archivo';
import { SpaceMono_400Regular, SpaceMono_700Bold } from '@expo-google-fonts/space-mono';
import { getDb } from '../src/db/database';
import { colors } from '../src/theme/colors';

export default function RootLayout() {
  // Fonts are a *progressive enhancement* — never block the whole app on them.
  const [fontsLoaded, fontError] = useFonts({
    Archivo_400Regular, Archivo_500Medium, Archivo_600SemiBold,
    Archivo_700Bold, Archivo_800ExtraBold, Archivo_900Black,
    SpaceMono_400Regular, SpaceMono_700Bold,
  });
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    getDb();
    // safety net: if font loading ever hangs, start the app anyway (system
    // fallback). When fonts do resolve, the tree re-renders and they apply.
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
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg }, animation: 'fade' }} />
        </View>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
