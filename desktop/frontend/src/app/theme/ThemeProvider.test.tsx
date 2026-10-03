import { StrictMode } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ThemeMode } from '@/shared/contracts';
import { ThemeProvider } from './ThemeProvider';
import { useTheme } from './context';
import { readThemePreference } from './preferences';

function Probe() {
  const { dark, preview, clearPreview } = useTheme();
  return <><span data-testid="theme">{dark ? 'dark' : 'light'}</span>
    <button onClick={() => preview(ThemeMode.ThemeDark)}>preview</button>
    <button onClick={clearPreview}>reset</button></>;
}

function mediaController() {
  let dark = false;
  const listeners = new Set<() => void>();
  vi.spyOn(window, 'matchMedia').mockImplementation(media => ({
    get matches() { return media.includes('prefers-color-scheme') && dark; }, media, onchange: null,
    addEventListener: (_type: string, listener: EventListenerOrEventListenerObject) => { listeners.add(listener as () => void); },
    removeEventListener: (_type: string, listener: EventListenerOrEventListenerObject) => { listeners.delete(listener as () => void); },
    addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: () => true,
  }));
  return { listeners, setDark(value: boolean) { act(() => { dark = value; listeners.forEach(fn => fn()); }); } };
}

describe('theme lifetime', () => {
  it('follows the system and cleans up under StrictMode', () => {
    const media = mediaController();
    const view = render(<StrictMode><ThemeProvider mode={ThemeMode.ThemeSystem}><Probe /></ThemeProvider></StrictMode>);
    expect(media.listeners.size).toBe(1);
    media.setDark(true);
    expect(screen.getByTestId('theme')).toHaveTextContent('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    view.unmount();
    expect(media.listeners.size).toBe(0);
  });
  it('does not let system changes override a manual mode', () => {
    const media = mediaController();
    const view = render(<ThemeProvider mode={ThemeMode.ThemeLight}><Probe /></ThemeProvider>);
    media.setDark(true);
    expect(media.listeners.size).toBe(0);
    expect(screen.getByTestId('theme')).toHaveTextContent('light');
    view.rerender(<ThemeProvider mode={ThemeMode.ThemeSystem}><Probe /></ThemeProvider>);
    expect(screen.getByTestId('theme')).toHaveTextContent('dark');
    expect(media.listeners.size).toBe(1);
  });
  it('previews without overwriting the persistent startup mirror', () => {
    mediaController();
    render(<ThemeProvider mode={ThemeMode.ThemeLight}><Probe /></ThemeProvider>);
    fireEvent.click(screen.getByText('preview'));
    expect(screen.getByTestId('theme')).toHaveTextContent('dark');
    expect(readThemePreference()).toBe(ThemeMode.ThemeLight);
    fireEvent.click(screen.getByText('reset'));
    expect(screen.getByTestId('theme')).toHaveTextContent('light');
  });
  it('ignores corrupt or unavailable optional local storage', () => {
    localStorage.setItem('xhs-desktop.theme', 'invalid');
    expect(readThemePreference()).toBe(ThemeMode.ThemeSystem);
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied'); });
    expect(readThemePreference()).toBe(ThemeMode.ThemeSystem);
  });
});
