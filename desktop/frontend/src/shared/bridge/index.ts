import { Window, type CancellablePromise } from '@wailsio/runtime';
import * as AppService from '../../../bindings/github.com/cry5tallize/xhs_spider_desktop/internal/bridge/appservice';
import * as SettingsService from '../../../bindings/github.com/cry5tallize/xhs_spider_desktop/internal/bridge/settingsservice';
import * as FileService from '../../../bindings/github.com/cry5tallize/xhs_spider_desktop/internal/bridge/fileservice';
import type { UpdateGeneral } from '../contracts';

async function withSignal<T>(call: CancellablePromise<T>, signal?: AbortSignal): Promise<T> {
  const cancel = () => call.cancel();
  if (signal?.aborted) cancel();
  else signal?.addEventListener('abort', cancel, { once: true });
  try { return await call; }
  finally { signal?.removeEventListener('abort', cancel); }
}

export const getBootstrap = (signal?: AbortSignal) => withSignal(AppService.GetBootstrap(), signal);
export const updateGeneral = (input: UpdateGeneral) => withSignal(SettingsService.UpdateGeneral(input));
export const setWindowAppearance = (dark: boolean) => withSignal(AppService.SetWindowAppearance(dark));
export const chooseOutputDirectory = () => withSignal(FileService.ChooseOutputDirectory());
export const minimizeWindow = () => Window.Minimise();
export const maximizeWindow = () => Window.ToggleMaximise();
export const closeWindow = () => Window.Close();
