import { create } from 'zustand';

export type Theme = 'dark' | 'light';

const STORAGE_KEY = 'clearcut-theme';

/** 读取持久化主题，默认暗色 */
function readInitialTheme(): Theme {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {
    /* localStorage 不可用时回退默认 */
  }
  return 'dark';
}

/** 将主题写入 <html data-theme> 并持久化 */
function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    /* 忽略写入失败 */
  }
}

interface ThemeState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

const initialTheme = readInitialTheme();
// 模块加载时立即同步到 DOM，避免首屏闪烁
applyTheme(initialTheme);

export const useThemeStore = create<ThemeState>((set, get) => ({
  theme: initialTheme,
  setTheme: (theme) => {
    applyTheme(theme);
    set({ theme });
  },
  toggleTheme: () => {
    const next: Theme = get().theme === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    set({ theme: next });
  },
}));
