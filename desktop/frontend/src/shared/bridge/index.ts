import { Window, type CancellablePromise } from '@wailsio/runtime';
import * as AppService from '../../../bindings/github.com/cry5tallize/xhs_spider_desktop/internal/bridge/appservice';
import * as SettingsService from '../../../bindings/github.com/cry5tallize/xhs_spider_desktop/internal/bridge/settingsservice';
import * as FileService from '../../../bindings/github.com/cry5tallize/xhs_spider_desktop/internal/bridge/fileservice';
import * as AccountService from '../../../bindings/github.com/cry5tallize/xhs_spider_desktop/internal/bridge/accountservice';
import type { UpdateGeneral, CreateAccount, UpdateAccount, ReplaceCookie } from '../contracts';

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
export const listAccounts = (signal?: AbortSignal) => withSignal(AccountService.List(), signal);
export const createAccount = (input: CreateAccount) => withSignal(AccountService.Create(input));
export const updateAccount = (input: UpdateAccount) => withSignal(AccountService.Update(input));
export const replaceAccountCookie = (input: ReplaceCookie) => withSignal(AccountService.ReplaceCookie(input));
export const setDefaultAccount = (id: string) => withSignal(AccountService.SetDefault(id));
export const validateAccount = (id: string) => withSignal(AccountService.Validate(id));
export const deleteAccount = (id: string) => withSignal(AccountService.Delete(id));
