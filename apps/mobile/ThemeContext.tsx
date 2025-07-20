import React, { createContext, useContext, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';
import { createTheme } from './theme';

const ThemeContext = createContext({
  theme: createTheme('#1976d2', 'light'),
  mode: 'light',
  setMode: (mode: 'light' | 'dark' | 'system') => {},
  primary: '#1976d2',
  setPrimary: (color: string) => {},
});

export const ThemeProvider = ({ children }: { children: React.ReactNode }) => {
  const systemScheme = useColorScheme();
  const [mode, setMode] = useState<'light' | 'dark' | 'system'>('system');
  const [primary, setPrimary] = useState('#1976d2');
  const theme = useMemo(() => {
    const scheme = mode === 'system' ? systemScheme : mode;
    return createTheme(primary, scheme === 'dark' ? 'dark' : 'light');
  }, [mode, systemScheme, primary]);
  return (
    <ThemeContext.Provider value={{ theme, mode, setMode, primary, setPrimary }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext); 