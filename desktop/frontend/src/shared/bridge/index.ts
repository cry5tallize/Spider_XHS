import { Window, type CancellablePromise } from '@wailsio/runtime';
import * as AppService from '../../../bindings/github.com/cry5tallize/xhs_spider_desktop/internal/bridge/appservice';
import * as SettingsService from '../../../bindings/github.com/cry5tallize/xhs_spider_desktop/internal/bridge/settingsservice';
import * as FileService from '../../../bindings/github.com/cry5tallize/xhs_spider_desktop/internal/bridge/fileservice';
import * as AccountService from '../../../bindings/github.com/cry5tallize/xhs_spider_desktop/internal/bridge/accountservice';
import * as NoteService from '../../../bindings/github.com/cry5tallize/xhs_spider_desktop/internal/bridge/noteservice';
import type { StartParse, NoteListInput } from '../contracts';
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
export const startParse = (input: StartParse) => withSignal(NoteService.StartParse(input));
export const listParseJobs = (signal?: AbortSignal) => withSignal(NoteService.ListParseJobs(), signal);
export const getParseJob = (id: string, signal?: AbortSignal) => withSignal(NoteService.GetParseJob(id), signal);
export const cancelParse = (id: string) => withSignal(NoteService.CancelParse(id));
export const listNotes = (input: NoteListInput, signal?: AbortSignal) => withSignal(NoteService.ListNotes(input), signal);
export const getNote = (id: string, signal?: AbortSignal) => withSignal(NoteService.GetNote(id), signal);
export const getSnapshot = (id: string, signal?: AbortSignal) => withSignal(NoteService.GetSnapshot(id), signal);
export const listSnapshots = (id: string, signal?: AbortSignal) => withSignal(NoteService.ListSnapshots(id), signal);
export const getRawSnapshot = (id: string, signal?: AbortSignal) => withSignal(NoteService.GetRawSnapshot(id), signal);
