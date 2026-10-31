import { ui } from './ui-strings.js';
export type Theme = 'system' | 'light' | 'dark';
export const themeKey = 'appearanceTheme';
export const validTheme = (value: unknown): Theme => value === 'light' || value === 'dark' ? value : 'system';

// System mode is handled entirely by CSS color-scheme: no polling or media listeners.
export async function initAppearance() {
 const select = document.getElementById('appearance') as HTMLSelectElement;
 const message = document.getElementById('appearance-status')!;
 let saved: Theme = 'system';
 const apply = (value: unknown) => {
  const theme = validTheme(value);
  document.documentElement.dataset.theme = theme;
  select.value = theme;
 };
 apply(saved);
 select.disabled = true;
 try {
  saved = validTheme((await chrome.storage.local.get(themeKey))[themeKey]);
  apply(saved);
 } catch {
  message.textContent = ui.appearance.restoreError;
 } finally { select.disabled = false; }
 select.addEventListener('change', async () => {
  const next = validTheme(select.value);
  apply(next);
  select.disabled = true;
  message.textContent = '';
  try {
   await chrome.storage.local.set({[themeKey]:next});
   saved = next;
   message.textContent = ui.appearance.saved;
  } catch {
   apply(saved);
   message.textContent = ui.appearance.saveError;
  } finally { select.disabled = false; }
 });
 chrome.storage.onChanged.addListener((changes,area) => {
  if(area === 'local' && changes[themeKey]) {
   saved = validTheme(changes[themeKey].newValue);
   apply(saved);
  }
 });
}
