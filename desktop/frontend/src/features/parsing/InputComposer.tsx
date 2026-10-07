import { useRef, useState } from 'react';
import { Alert, App, Button, DatePicker, Input, InputNumber, Popover, Select, Switch } from 'antd';
import {
  ArrowRightOutlined,
  UploadOutlined,
  SlidersOutlined,
  CheckCircleOutlined,
} from '@ant-design/icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  AccountMode,
  AccountStatus,
  CacheMode,
  CollectionMode,
  LiveFilter,
  NoteKind,
  type Account,
  type CollectionConfig,
  type CollectionJob,
} from '@/shared/contracts';
import { UserAvatar } from '@/shared/components/UserAvatar';
import { validateAccount } from '@/features/accounts/api';
import { startCollection } from './api';
import { inspectInput } from './input';

type Props = {
  mode: CollectionMode;
  onMode: (mode: CollectionMode) => void;
  defaults: CollectionConfig;
  accounts: Account[];
  onCreated: (job: CollectionJob) => void;
};
export function InputComposer({ mode, onMode, defaults, accounts, onCreated }: Props) {
  const { message } = App.useApp();
  const client = useQueryClient();
  const file = useRef<HTMLInputElement>(null);
  const request = useRef({ key: '', id: '' });
  const [drafts, setDrafts] = useState({ notes: '', users: '' });
  const [accountID, setAccountID] = useState('');
  const [config, setConfig] = useState(defaults);
  const [userLimit, setUserLimit] = useState(100);
  const [range, setRange] = useState<{ from: number; until: number }>();
  const text = mode === CollectionMode.ModeUsers ? drafts.users : drafts.notes;
  const setText = (value: string) =>
    setDrafts((current) => ({
      ...current,
      [mode === CollectionMode.ModeUsers ? 'users' : 'notes']: value,
    }));
  const available = accounts.filter(
    (account) =>
      account.enabled &&
      account.has_cookie &&
      ![
        AccountStatus.Expired,
        AccountStatus.Restricted,
        AccountStatus.Disabled,
        AccountStatus.Error,
      ].includes(account.status),
  );
  const activeAccount =
    available.find((account) => account.id === accountID) ||
    available.find((account) => account.is_default) ||
    available[0];
  const inspection = inspectInput(text, mode);
  const accountMode = config.account_mode || AccountMode.AccountFixed;
  const selectedPool = config.account_ids?.length
    ? available.filter((account) => config.account_ids!.includes(account.id))
    : available;
  const hasAccount =
    accountMode === AccountMode.AccountFixed ? !!activeAccount : selectedPool.length > 0;
  const check = useMutation({
    mutationFn: (id: string) => validateAccount(id),
    onSuccess: (account) => {
      client.setQueryData<Account[]>(['accounts'], (rows) =>
        rows?.map((row) => (row.id === account.id ? account : row)),
      );
      void client.invalidateQueries({ queryKey: ['accounts'] });
      if (account.status === AccountStatus.Valid) void message.success('账号校验通过');
      else void message.warning(account.last_error || '账号校验未通过');
    },
    onError: (error: Error) => {
      void message.error(error.message);
    },
  });
  const create = useMutation({
    mutationFn: () => {
      const next = {
        ...config,
        max_notes: mode === CollectionMode.ModeUsers ? userLimit : config.max_notes,
        account_ids:
          accountMode === AccountMode.AccountBySource
            ? selectedPool.map((account) => account.id)
            : [],
        published_from_ms: range?.from || 0,
        published_until_ms: range?.until || 0,
      };
      const input = {
        mode,
        account_id: activeAccount?.id || '',
        text: inspection.canonical,
        config: next,
      };
      const key = JSON.stringify(input);
      if (request.current.key !== key) request.current = { key, id: crypto.randomUUID() };
      return startCollection({ ...input, request_id: request.current.id });
    },
    onSuccess: (job) => {
      request.current = { key: '', id: '' };
      void client.invalidateQueries({ queryKey: ['collections'] });
      onCreated(job);
    },
    onError: (error: Error) => {
      void message.error(error.message);
    },
  });
  const change = (patch: Partial<CollectionConfig>) =>
    setConfig((current) => ({ ...current, ...patch }));
  const importFile = async (selected?: File) => {
    if (!selected) return;
    try {
      if (selected.size > 1024 * 1024) throw new Error('文本文件不能超过 1 MiB');
      setText(new TextDecoder('utf-8', { fatal: true }).decode(await selected.arrayBuffer()));
    } catch (error) {
      void message.error(error instanceof Error ? error.message : '无法读取文本文件');
    } finally {
      if (file.current) file.current.value = '';
    }
  };
  return (
    <section className="parse-composer" aria-label="解析输入">
      <div className="parse-mode-tabs" role="group" aria-label="解析来源">
        {[
          { value: CollectionMode.ModeNotes, label: '笔记链接' },
          { value: CollectionMode.ModeUsers, label: '用户主页' },
        ].map((item) => (
          <button
            type="button"
            aria-pressed={mode === item.value}
            className={mode === item.value ? 'is-active' : ''}
            key={item.value}
            disabled={create.isPending}
            onClick={() => onMode(item.value)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <Input.TextArea
        aria-label={mode === CollectionMode.ModeUsers ? '用户主页输入' : '笔记链接输入'}
        value={text}
        onChange={(event) => setText(event.target.value)}
        autoSize={{ minRows: 4, maxRows: 8 }}
        maxLength={1048576}
        disabled={create.isPending}
        autoComplete="off"
        placeholder={
          mode === CollectionMode.ModeUsers
            ? '粘贴用户主页链接或用户 ID，每行一个'
            : '粘贴小红书链接或分享文本\n一条或多条都可以，也支持短链接'
        }
      />
      {inspection.mixed ? (
        <Alert type="warning" title="笔记链接和用户主页请分开解析。" />
      ) : inspection.mismatch ? (
        <div className="parse-input-hint">
          识别到{mode === CollectionMode.ModeNotes ? '用户主页' : '笔记链接'}
          <Button
            type="link"
            size="small"
            onClick={() => {
              setDrafts((current) => ({
                ...current,
                [mode === CollectionMode.ModeNotes ? 'users' : 'notes']: text,
              }));
              onMode(
                mode === CollectionMode.ModeNotes
                  ? CollectionMode.ModeUsers
                  : CollectionMode.ModeNotes,
              );
            }}
          >
            切换到对应模式
          </Button>
        </div>
      ) : inspection.invalid > 0 && text.trim() ? (
        <div className="parse-input-error">
          有 {inspection.invalid} 条输入无法识别，请检查链接或 ID。
        </div>
      ) : inspection.tooMany ? (
        <div className="parse-input-error">单次最多 1000 条输入，请分批解析。</div>
      ) : (
        inspection.count > 0 && (
          <div className="parse-input-hint">
            <CheckCircleOutlined />
            识别到 {inspection.count} 条输入
          </div>
        )
      )}
      {mode === CollectionMode.ModeUsers && (
        <div className="parse-user-range">
          <label>
            本次最多解析
            <InputNumber
              aria-label="本次解析笔记上限"
              min={1}
              max={100000}
              precision={0}
              value={userLimit}
              disabled={create.isPending}
              onChange={(value) => setUserLimit(value || 100)}
              suffix="条"
            />
          </label>
          <span>多个主页合计</span>
        </div>
      )}
      <div className="parse-composer-footer">
        <input
          type="file"
          accept=".txt,text/plain"
          ref={file}
          hidden
          onChange={(event) => void importFile(event.target.files?.[0])}
        />
        <Button
          type="text"
          icon={<UploadOutlined />}
          disabled={create.isPending}
          onClick={() => file.current?.click()}
        >
          导入文本
        </Button>
        <div className="parse-account-select">
          <span>解析账号</span>
          <Select
            aria-label="解析账号"
            value={activeAccount?.id}
            disabled={create.isPending || accountMode !== AccountMode.AccountFixed}
            placeholder="选择账号"
            onChange={setAccountID}
            options={available.map((account) => ({
              value: account.id,
              label: (
                <div className="parse-account-option">
                  <UserAvatar
                    url={account.avatar_url}
                    name={account.nickname || account.name}
                    size={22}
                  />
                  <span>
                    {account.nickname || account.name}
                    {account.is_default ? ' · 默认' : ''}
                    {account.status === AccountStatus.Unchecked ||
                    account.status === AccountStatus.Unknown
                      ? ' · 待校验'
                      : ''}
                  </span>
                </div>
              ),
            }))}
          />
        </div>
        {activeAccount &&
          [AccountStatus.Unchecked, AccountStatus.Unknown].includes(activeAccount.status) && (
            <Button
              type="text"
              size="small"
              loading={check.isPending}
              onClick={() => check.mutate(activeAccount.id)}
            >
              校验
            </Button>
          )}
        <Popover
          trigger="click"
          placement="bottomRight"
          title="解析选项"
          content={
            <div className="parse-filter-options">
              <label>
                笔记类型
                <Select
                  value={config.kind}
                  onChange={(kind) => change({ kind })}
                  options={[
                    { value: NoteKind.KindUnknown, label: '全部' },
                    { value: NoteKind.KindImage, label: '图文' },
                    { value: NoteKind.KindVideo, label: '视频' },
                  ]}
                />
              </label>
              <label>
                标题关键词
                <Input
                  value={config.title_keyword}
                  maxLength={256}
                  onChange={(event) => change({ title_keyword: event.target.value })}
                />
              </label>
              <label>
                发布日期
                <DatePicker.RangePicker
                  onChange={(values) =>
                    setRange(
                      values?.[0] && values[1]
                        ? {
                            from: values[0].startOf('day').valueOf(),
                            until: values[1].endOf('day').valueOf(),
                          }
                        : undefined,
                    )
                  }
                />
              </label>
              <label>
                实况笔记范围
                <Select
                  value={config.live_photo}
                  onChange={(live_photo) => change({ live_photo })}
                  options={[
                    { value: LiveFilter.LiveAny, label: '全部笔记' },
                    { value: LiveFilter.LiveOnly, label: '只解析有实况的笔记' },
                    { value: LiveFilter.LiveExclude, label: '排除有实况的笔记' },
                  ]}
                />
              </label>
              <details>
                <summary>高级解析选项</summary>
                <label>
                  账号分配
                  <Select
                    value={accountMode}
                    onChange={(account_mode) => change({ account_mode })}
                    options={[
                      { value: AccountMode.AccountFixed, label: '固定账号' },
                      { value: AccountMode.AccountBySource, label: '按来源分配' },
                    ]}
                  />
                </label>
                {accountMode === AccountMode.AccountBySource && (
                  <label>
                    账号池
                    <Select
                      mode="multiple"
                      value={config.account_ids || []}
                      placeholder="全部可用账号"
                      onChange={(account_ids) => change({ account_ids })}
                      options={available.map((account) => ({
                        value: account.id,
                        label: account.nickname || account.name,
                      }))}
                    />
                  </label>
                )}
                <label>
                  解析并发
                  <InputNumber
                    min={1}
                    max={16}
                    precision={0}
                    value={config.concurrency}
                    onChange={(value) => change({ concurrency: value || 2 })}
                  />
                </label>
                <label>
                  每用户页数上限
                  <InputNumber
                    min={1}
                    max={10000}
                    precision={0}
                    value={config.max_pages}
                    onChange={(value) => change({ max_pages: value || 100 })}
                  />
                </label>
                <label>
                  详情缓存
                  <Select
                    value={config.cache_mode}
                    onChange={(cache_mode) => change({ cache_mode })}
                    options={[
                      { value: CacheMode.UseFresh, label: '优先使用最近缓存' },
                      { value: CacheMode.ForceRefresh, label: '重新获取详情' },
                      { value: CacheMode.CacheOnly, label: '只使用缓存' },
                    ]}
                  />
                </label>
                <label className="parse-switch-label">
                  保留原始响应
                  <Switch checked={config.save_raw} onChange={(save_raw) => change({ save_raw })} />
                </label>
              </details>
            </div>
          }
        >
          <Button type="text" icon={<SlidersOutlined />} disabled={create.isPending}>
            选项
          </Button>
        </Popover>
        <Button
          className="parse-start-button"
          type="primary"
          size="large"
          icon={<ArrowRightOutlined />}
          loading={create.isPending}
          disabled={
            !hasAccount ||
            !text.trim() ||
            inspection.invalid > 0 ||
            inspection.mismatch ||
            inspection.mixed ||
            inspection.tooMany ||
            check.isPending
          }
          onClick={() => create.mutate()}
        >
          解析
        </Button>
      </div>
    </section>
  );
}
