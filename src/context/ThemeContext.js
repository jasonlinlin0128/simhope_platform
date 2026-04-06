import { createContext, useContext } from 'react';

export const ThemeContext = createContext({ isDark: false, toggle: () => {} });
export const useTheme = () => useContext(ThemeContext);
