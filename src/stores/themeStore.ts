import { create } from 'zustand';

export type Theme = 'dark' | 'light';

const STORAGE_KEY = 'clearcut-theme';

/** 读取系统主题偏好 */
function getSystemTheme(): Theme {
  try {
    if (typeof window !== 'undefined' && window.matchMedia) {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
  } catch {
    /* matchMedia 不可用时回退 */
  }
  return 'dark';
}

/** 读取持久化主题，未设置时跟随系统 */
function readInitialTheme(): Theme {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {
    /* localStorage 不可用时回退 */
  }
  return getSystemTheme();
}

/** 将主题同步到 <html data-theme> */
function syncThemeToDom(theme: Theme) {
  document.documentElement.dataset.theme = theme;
}

/** 持久化用户手动选择 */
function persistTheme(theme: Theme) {
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
syncThemeToDom(initialTheme);

export const useThemeStore = create<ThemeState>((set, get) => ({
  theme: initialTheme,
  setTheme: (theme) => {
    syncThemeToDom(theme);
    persistTheme(theme);
    set({ theme });
  },
  toggleTheme: () => {
    const next: Theme = get().theme === 'dark' ? 'light' : 'dark';
    syncThemeToDom(next);
    persistTheme(next);
    set({ theme: next });
  },
}));

// 用户未手动设置时，跟随系统主题切换
try {
  if (typeof window !== 'undefined' && window.matchMedia) {
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => {
      let saved: string | null = null;
      try {
        saved = localStorage.getItem(STORAGE_KEY);
      } catch {
        /* 忽略 */
      }
      if (saved === 'light' || saved === 'dark') return;
      const next: Theme = e.matches ? 'dark' : 'light';
      syncThemeToDom(next);
      useThemeStore.setState({ theme: next });
    };
    if (mql.addEventListener) {
      mql.addEventListener('change', handler);
    } else if ((mql as MediaQueryList & { addListener?: (cb: (e: MediaQueryListEvent) => void) => void }).addListener) {
      (mql as MediaQueryList & { addListener: (cb: (e: MediaQueryListEvent) => void) => void }).addListener(handler);
    }
  }
} catch {
  /* 忽略系统主题监听失败 */
}
