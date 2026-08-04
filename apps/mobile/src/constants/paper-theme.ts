import { MD3DarkTheme, MD3LightTheme, type MD3Theme } from 'react-native-paper';

import { Colors } from './theme';

// Telas que usam React Native Paper (onboarding/perfil - ver decisão de
// 2026-08-04 na .tasks/fase-2-mvp-fechado.md) reaproveitam nossas cores de
// fundo/texto pra não destoar do resto do app, mas mantêm a cor primária
// padrão do Material (sem identidade de marca definida ainda).
export const paperLightTheme: MD3Theme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    background: Colors.light.background,
    surface: Colors.light.background,
    surfaceVariant: Colors.light.backgroundElement,
    onSurface: Colors.light.text,
    onSurfaceVariant: Colors.light.textSecondary,
    outline: Colors.light.backgroundSelected,
  },
};

export const paperDarkTheme: MD3Theme = {
  ...MD3DarkTheme,
  colors: {
    ...MD3DarkTheme.colors,
    background: Colors.dark.background,
    surface: Colors.dark.background,
    surfaceVariant: Colors.dark.backgroundElement,
    onSurface: Colors.dark.text,
    onSurfaceVariant: Colors.dark.textSecondary,
    outline: Colors.dark.backgroundSelected,
  },
};
