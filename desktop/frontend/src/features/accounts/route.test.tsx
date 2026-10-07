import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from '@/app/theme/ThemeProvider';
import { AccountStatus, ThemeMode, type Account } from '@/shared/contracts';
import { Component } from './route';
import { listAccounts, validateAccount, setDefaultAccount } from './api';

vi.mock('./api', () => ({
  listAccounts: vi.fn(),
  validateAccount: vi.fn(),
  createAccount: vi.fn(),
  updateAccount: vi.fn(),
  replaceAccountCookie: vi.fn(),
  setDefaultAccount: vi.fn(),
  deleteAccount: vi.fn(),
}));

const account: Account = {
  id: 'account',
  name: '我的账号',
  nickname: '',
  user_id: '',
  avatar_url: '',
  enabled: true,
  is_default: false,
  has_cookie: true,
  credential_version: 1,
  status: AccountStatus.Unchecked,
  validated_at_ms: null,
  last_error: '',
  created_at_ms: 1,
  updated_at_ms: 1,
};

function renderAccounts() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ThemeProvider mode={ThemeMode.ThemeLight}>
        <MemoryRouter>
          <Component />
        </MemoryRouter>
      </ThemeProvider>
    </QueryClientProvider>,
  );
}

describe('validated account identity', () => {
  it('shows the saved nickname and avatar after validation', async () => {
    const validated = {
      ...account,
      status: AccountStatus.Valid,
      nickname: '真实昵称',
      user_id: 'user-id',
      avatar_url: 'https://cdn.example.test/avatar.png',
    };
    vi.mocked(listAccounts).mockResolvedValue([account]);
    vi.mocked(validateAccount).mockImplementation(async () => {
      vi.mocked(listAccounts).mockResolvedValue([validated]);
      return validated;
    });
    renderAccounts();
    fireEvent.click(await screen.findByRole('button', { name: '校验账号：我的账号' }));
    const image = await screen.findByRole('img', { name: '真实昵称的头像' });
    expect(image).toHaveAttribute('src', validated.avatar_url);
    expect(image).toHaveAttribute('referrerpolicy', 'no-referrer');
    expect(screen.getByRole('heading', { name: '真实昵称' })).toBeInTheDocument();
    expect(screen.getByText('user-id')).toBeInTheDocument();
    await waitFor(() => expect(vi.mocked(validateAccount).mock.calls[0]?.[0]).toBe(account.id));
  });

  it('loads a saved avatar immediately and falls back if the image fails', async () => {
    vi.mocked(listAccounts).mockResolvedValue([
      { ...account, nickname: '昵称', avatar_url: 'https://cdn.example.test/saved.png' },
    ]);
    renderAccounts();
    const image = await screen.findByRole('img', { name: '昵称的头像' });
    fireEvent.error(image);
    expect(screen.queryByRole('img', { name: '昵称的头像' })).not.toBeInTheDocument();
    expect(screen.getByText('昵')).toBeInTheDocument();
    expect(validateAccount).not.toHaveBeenCalled();
  });
  it('sets the default account directly and excludes disabled accounts from the available filter', async () => {
    const first = {
      ...account,
      status: AccountStatus.Valid,
      is_default: true,
      nickname: '一号用户',
    };
    const second = {
      ...account,
      id: 'second',
      name: '备用账号',
      status: AccountStatus.Valid,
      nickname: '二号用户',
    };
    const disabled = {
      ...account,
      id: 'disabled',
      name: '停用账号',
      nickname: '停用用户',
      enabled: false,
      status: AccountStatus.Disabled,
    };
    vi.mocked(listAccounts).mockResolvedValue([first, second, disabled]);
    vi.mocked(setDefaultAccount).mockImplementation(async () => {
      const saved = { ...second, is_default: true };
      vi.mocked(listAccounts).mockResolvedValue([{ ...first, is_default: false }, saved, disabled]);
      return saved;
    });
    renderAccounts();
    const disabledButton = await screen.findByRole('button', { name: '设为默认：停用账号' });
    expect(disabledButton).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: '设为默认：备用账号' }));
    await waitFor(() => expect(setDefaultAccount).toHaveBeenCalledWith('second'));
    await waitFor(() =>
      expect(
        within(screen.getByRole('article', { name: '账号：二号用户' })).getByText('默认解析账号'),
      ).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole('button', { name: '可用' }));
    expect(screen.queryByRole('article', { name: '账号：停用用户' })).not.toBeInTheDocument();
  });
});
