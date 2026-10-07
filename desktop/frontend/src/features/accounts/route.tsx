import { useState } from 'react';
import {
  Alert,
  App,
  Button,
  Dropdown,
  Form,
  Input,
  Modal,
  Popover,
  Switch,
  Tooltip,
  Typography,
} from 'antd';
import {
  PlusOutlined,
  ReloadOutlined,
  EditOutlined,
  KeyOutlined,
  DeleteOutlined,
  StarOutlined,
  StarFilled,
  UserOutlined,
  SearchOutlined,
  MoreOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  ClockCircleOutlined,
  LockOutlined,
  QuestionCircleOutlined,
  ArrowRightOutlined,
  SyncOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { AccountStatus, type Account } from '@/shared/contracts';
import {
  PageHeading,
  FilterTabs,
  WorkspaceEmpty,
  WorkspaceSkeleton,
} from '@/shared/components/Workspace';
import { UserAvatar } from '@/shared/components/UserAvatar';
import { usePageFilters } from '@/shared/hooks/use-page-filters';
import { formatTime } from '@/features/notes/labels';
import {
  listAccounts,
  createAccount,
  updateAccount,
  replaceAccountCookie,
  setDefaultAccount,
  validateAccount,
  deleteAccount,
} from './api';

const queryKey = ['accounts'] as const;
const statuses: Record<AccountStatus, { label: string; tone: string }> = {
  [AccountStatus.Unknown]: { label: '未校验', tone: 'neutral' },
  [AccountStatus.Unchecked]: { label: '待校验', tone: 'neutral' },
  [AccountStatus.Valid]: { label: '可用', tone: 'success' },
  [AccountStatus.Expired]: { label: '登录已过期', tone: 'warning' },
  [AccountStatus.Restricted]: { label: '访问受限', tone: 'warning' },
  [AccountStatus.Disabled]: { label: '已停用', tone: 'neutral' },
  [AccountStatus.Error]: { label: '校验失败', tone: 'danger' },
};
type Editor = { kind: 'create' } | { kind: 'rename' | 'cookie'; account: Account };
type EditorFields = { name: string; cookie: string };
const isAvailable = (account: Account) =>
  account.enabled && account.has_cookie && account.status === AccountStatus.Valid;
const needsAttention = (account: Account) =>
  account.enabled &&
  (!account.has_cookie ||
    [AccountStatus.Expired, AccountStatus.Restricted, AccountStatus.Error].includes(
      account.status,
    ));
const isUnchecked = (account: Account) =>
  account.enabled && [AccountStatus.Unknown, AccountStatus.Unchecked].includes(account.status);

export function Component() {
  const { message, modal } = App.useApp();
  const navigate = useNavigate();
  const client = useQueryClient();
  const accounts = useQuery({ queryKey, queryFn: ({ signal }) => listAccounts(signal) });
  const { params, update } = usePageFilters();
  const search = params.get('q') || '';
  const filter = ['valid', 'attention', 'unchecked', 'disabled'].includes(
    params.get('status') || '',
  )
    ? params.get('status')!
    : 'all';
  const [editor, setEditor] = useState<Editor | null>(null);
  const [form] = Form.useForm<EditorFields>();
  const refresh = () => {
    void client.invalidateQueries({ queryKey });
  };
  const error = (err: Error) => {
    void message.error(err.message || '操作失败');
  };
  const cache = (account: Account) =>
    client.setQueryData<Account[]>(queryKey, (rows) =>
      rows
        ? rows.some((row) => row.id === account.id)
          ? rows.map((row) => (row.id === account.id ? account : row))
          : [...rows, account]
        : [account],
    );
  const save = useMutation({
    mutationFn: async (values: EditorFields) => {
      if (editor?.kind === 'create') return createAccount(values);
      if (editor?.kind === 'cookie')
        return replaceAccountCookie({
          id: editor.account.id,
          cookie: values.cookie,
          expected_version: editor.account.credential_version,
        });
      if (editor?.kind === 'rename')
        return updateAccount({
          id: editor.account.id,
          name: values.name,
          enabled: editor.account.enabled,
        });
      throw new Error('未选择账号');
    },
    onSuccess: (account) => {
      cache(account);
      form.resetFields();
      setEditor(null);
      refresh();
      void message.success('账号已保存');
    },
    onError: error,
  });
  const check = useMutation({
    mutationFn: (id: string) => validateAccount(id),
    onSuccess: (account) => {
      cache(account);
      refresh();
      if (account.status === AccountStatus.Valid) void message.success('账号校验通过');
      else void message.warning(account.last_error || '账号校验未通过');
    },
    onError: error,
  });
  const change = useMutation({
    mutationFn: updateAccount,
    onSuccess: (account) => {
      cache(account);
      refresh();
    },
    onError: error,
  });
  const makeDefault = useMutation({
    mutationFn: (id: string) => setDefaultAccount(id),
    onSuccess: (account) => {
      client.setQueryData<Account[]>(queryKey, (rows) =>
        rows?.map((row) => (row.id === account.id ? account : { ...row, is_default: false })),
      );
      refresh();
      void message.success('默认账号已更新');
    },
    onError: error,
  });
  const remove = useMutation({
    mutationFn: (id: string) => deleteAccount(id),
    onSuccess: (_result, id) => {
      client.setQueryData<Account[]>(queryKey, (rows) => rows?.filter((row) => row.id !== id));
      refresh();
    },
    onError: error,
  });
  const open = (next: Editor) => {
    form.resetFields();
    if (next.kind !== 'create') form.setFieldValue('name', next.account.name);
    setEditor(next);
  };
  const confirmDelete = (account: Account) =>
    modal.confirm({
      title: '删除“' + (account.nickname || account.name) + '”？',
      content: '本机登录凭证会清除，已保存的笔记和下载记录保留。',
      okText: '删除账号',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: () => remove.mutateAsync(account.id),
    });
  const rows = accounts.data || [];
  const valid = rows.filter(isAvailable).length;
  const attention = rows.filter(needsAttention).length;
  const unchecked = rows.filter(isUnchecked).length;
  const filtered = rows
    .filter(
      (account) =>
        [account.name, account.nickname, account.user_id]
          .join(' ')
          .toLocaleLowerCase()
          .includes(search.trim().toLocaleLowerCase()) &&
        (filter === 'valid'
          ? isAvailable(account)
          : filter === 'attention'
            ? needsAttention(account)
            : filter === 'unchecked'
              ? isUnchecked(account)
              : filter === 'disabled'
                ? !account.enabled
                : true),
    )
    .sort(
      (a, b) =>
        Number(b.is_default) - Number(a.is_default) || Number(b.enabled) - Number(a.enabled),
    );
  const defaultAccount = rows.find((account) => account.is_default);
  return (
    <div className="page workspace-page calm-page connections-page">
      <PageHeading
        title="账号管理"
        description={
          accounts.isPending
            ? '管理用于解析的账号与登录状态。'
            : rows.length
              ? rows.length + ' 个账号 · ' + valid + ' 个可用'
              : '添加账号，准备开始整理笔记。'
        }
        actions={
          <>
            <Popover
              title="如何添加账号"
              trigger="click"
              placement="bottomRight"
              content={
                <div className="account-help-content">
                  <p>在浏览器登录小红书，复制请求头中的 Cookie。</p>
                  <p>添加后点击“校验”，即可同步头像、昵称和用户 ID。</p>
                  <div>
                    <LockOutlined />
                    登录凭证加密保存在本机。
                  </div>
                </div>
              }
            >
              <Button type="text" icon={<QuestionCircleOutlined />} aria-label="账号添加帮助" />
            </Popover>
            <Tooltip title="刷新账号">
              <Button
                type="text"
                icon={<ReloadOutlined />}
                aria-label="刷新账号"
                loading={accounts.isFetching && !accounts.isPending}
                onClick={() => void accounts.refetch()}
              />
            </Tooltip>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => open({ kind: 'create' })}>
              添加账号
            </Button>
          </>
        }
      />
      {accounts.isError && (
        <Alert
          className="workspace-alert"
          type="error"
          showIcon
          title="账号加载失败"
          description={accounts.error.message}
          action={<Button onClick={() => void accounts.refetch()}>重试</Button>}
        />
      )}
      {defaultAccount && (
        <div className="default-account-bar">
          <span className="default-account-symbol" aria-hidden="true">
            <StarFilled />
          </span>
          <div>
            <span>默认解析账号</span>
            <strong>{defaultAccount.nickname || defaultAccount.name}</strong>
          </div>
          <p>
            {isAvailable(defaultAccount)
              ? '解析时会优先使用这个账号。'
              : !defaultAccount.enabled
                ? '此账号已停用，请启用或设置其他默认账号。'
                : needsAttention(defaultAccount)
                  ? '登录状态需要处理，可更新 Cookie 后重新校验。'
                  : '校验后可确认头像、昵称和登录状态。'}
          </p>
          {isAvailable(defaultAccount) ? (
            <Button
              type="text"
              icon={<ArrowRightOutlined />}
              iconPlacement="end"
              onClick={() => void navigate('/parse')}
            >
              去解析
            </Button>
          ) : defaultAccount.enabled && !needsAttention(defaultAccount) ? (
            <Button
              size="small"
              loading={check.isPending && check.variables === defaultAccount.id}
              disabled={check.isPending}
              onClick={() => check.mutate(defaultAccount.id)}
            >
              校验默认账号
            </Button>
          ) : (
            needsAttention(defaultAccount) && (
              <Button
                size="small"
                icon={<KeyOutlined />}
                onClick={() => open({ kind: 'cookie', account: defaultAccount })}
              >
                更新 Cookie
              </Button>
            )
          )}
        </div>
      )}
      {rows.length > 0 && !defaultAccount && (
        <div className="default-account-notice">
          <StarOutlined />
          选择一个默认账号，解析时就能直接使用。
        </div>
      )}
      <div className="calm-toolbar connections-toolbar">
        <FilterTabs
          value={filter}
          onChange={(value) => update({ status: value === 'all' ? undefined : value })}
          label="账号状态"
          items={[
            { value: 'all', label: '全部' },
            { value: 'valid', label: '可用' },
            { value: 'unchecked', label: '待校验', ...(unchecked ? { count: unchecked } : {}) },
            { value: 'attention', label: '需处理', ...(attention ? { count: attention } : {}) },
            { value: 'disabled', label: '已停用' },
          ]}
        />
        <Input
          className="calm-search"
          prefix={<SearchOutlined />}
          placeholder="搜索昵称、备注或 ID"
          aria-label="搜索账号"
          allowClear
          value={search}
          onChange={(event) => update({ q: event.target.value || undefined })}
        />
      </div>
      {accounts.isPending ? (
        <WorkspaceSkeleton count={2} />
      ) : filtered.length ? (
        <section className="connection-grid" aria-label="账号列表">
          {filtered.map((account) => {
            const checking = check.isPending && check.variables === account.id;
            const status = !account.enabled
              ? { label: '已停用', tone: 'neutral' }
              : checking
                ? { label: '校验中', tone: 'primary' }
                : !account.has_cookie
                  ? { label: '缺少凭证', tone: 'warning' }
                  : statuses[account.status];
            const repair = needsAttention(account);
            return (
              <article
                className={
                  'connection-card' +
                  (account.is_default ? ' is-default' : '') +
                  (!account.enabled ? ' is-disabled' : '')
                }
                key={account.id}
                aria-label={'账号：' + (account.nickname || account.name)}
              >
                <div className="connection-card-heading">
                  <UserAvatar
                    key={account.id + ':' + account.validated_at_ms}
                    url={account.avatar_url}
                    name={account.nickname || account.name}
                    size={52}
                  />
                  <div className="connection-identity">
                    <h2 title={account.nickname || account.name}>
                      {account.nickname || account.name}
                    </h2>
                    {account.nickname && account.nickname !== account.name ? (
                      <p title={account.name}>{account.name}</p>
                    ) : !account.nickname ? (
                      <p>校验后同步身份信息</p>
                    ) : null}
                  </div>
                  <span className={'connection-status status-' + status.tone}>
                    {checking ? (
                      <SyncOutlined spin />
                    ) : account.enabled && account.status === AccountStatus.Valid ? (
                      <CheckCircleOutlined />
                    ) : repair ? (
                      <ExclamationCircleOutlined />
                    ) : (
                      <ClockCircleOutlined />
                    )}
                    {status.label}
                  </span>
                </div>
                <div className="connection-meta">
                  <div>
                    <span>用户 ID</span>
                    {account.user_id ? (
                      <Typography.Text copyable={{ text: account.user_id }}>
                        {account.user_id}
                      </Typography.Text>
                    ) : (
                      <span>校验后获取</span>
                    )}
                  </div>
                  <div>
                    <span>最近校验</span>
                    <time title={formatTime(account.validated_at_ms)}>
                      {formatTime(account.validated_at_ms)}
                    </time>
                  </div>
                </div>
                {(account.last_error || !account.has_cookie) && (
                  <div className="connection-issue">
                    <ExclamationCircleOutlined />
                    <span>{account.last_error || '登录凭证缺失，请更新 Cookie。'}</span>
                  </div>
                )}
                <div className="connection-card-actions">
                  <div>
                    {repair ? (
                      <Button
                        type="primary"
                        icon={<KeyOutlined />}
                        size="small"
                        onClick={() => open({ kind: 'cookie', account })}
                      >
                        更新 Cookie
                      </Button>
                    ) : (
                      <Button
                        type={isUnchecked(account) ? 'primary' : 'default'}
                        size="small"
                        loading={checking}
                        disabled={!account.enabled || check.isPending}
                        aria-label={'校验账号：' + account.name}
                        onClick={() => check.mutate(account.id)}
                      >
                        校验账号
                      </Button>
                    )}
                    {repair ? (
                      <Button
                        type="text"
                        size="small"
                        aria-label={'校验账号：' + account.name}
                        disabled={!account.enabled || check.isPending}
                        loading={checking}
                        onClick={() => check.mutate(account.id)}
                      >
                        重新校验
                      </Button>
                    ) : (
                      <Button
                        type="text"
                        size="small"
                        icon={<KeyOutlined />}
                        onClick={() => open({ kind: 'cookie', account })}
                      >
                        更新 Cookie
                      </Button>
                    )}
                  </div>
                  <label className="connection-enabled">
                    {account.enabled ? '已启用' : '已停用'}
                    <Switch
                      size="small"
                      checked={account.enabled}
                      aria-label={'启用账号：' + account.name}
                      loading={change.isPending && change.variables?.id === account.id}
                      disabled={change.isPending}
                      onChange={(enabled) =>
                        change.mutate({ id: account.id, name: account.name, enabled })
                      }
                    />
                  </label>
                </div>
                <div className="connection-card-footer">
                  {account.is_default ? (
                    <span className="connection-default">
                      <StarFilled />
                      默认解析账号
                    </span>
                  ) : (
                    <Button
                      type="text"
                      size="small"
                      icon={<StarOutlined />}
                      aria-label={'设为默认：' + account.name}
                      disabled={!account.enabled || !account.has_cookie || makeDefault.isPending}
                      loading={makeDefault.isPending && makeDefault.variables === account.id}
                      onClick={() => makeDefault.mutate(account.id)}
                    >
                      设为默认
                    </Button>
                  )}
                  <Dropdown
                    trigger={['click']}
                    menu={{
                      items: [
                        { key: 'rename', label: '修改备注', icon: <EditOutlined /> },
                        { type: 'divider' },
                        {
                          key: 'delete',
                          label: '删除账号',
                          icon: <DeleteOutlined />,
                          danger: true,
                          disabled: remove.isPending,
                        },
                      ],
                      onClick: ({ key }) => {
                        if (key === 'rename') open({ kind: 'rename', account });
                        if (key === 'delete') confirmDelete(account);
                      },
                    }}
                  >
                    <Button
                      type="text"
                      size="small"
                      icon={<MoreOutlined />}
                      aria-label={'更多操作：' + account.name}
                    />
                  </Dropdown>
                </div>
              </article>
            );
          })}
        </section>
      ) : (
        !accounts.isError && (
          <WorkspaceEmpty
            icon={<UserOutlined />}
            title={rows.length ? '没有找到匹配账号' : '添加你的第一个账号'}
            description={
              rows.length
                ? '试试其他昵称、备注或用户 ID。'
                : '填写 Cookie 后校验，就能同步身份信息并开始解析。'
            }
            action={rows.length ? '清除筛选' : '添加账号'}
            onAction={() =>
              rows.length ? update({ q: undefined, status: undefined }) : open({ kind: 'create' })
            }
          />
        )
      )}
      {rows.length > 0 && (
        <div className="connections-footnote">
          <LockOutlined />
          登录凭证加密保存在本机
          <Popover
            title="关于登录凭证"
            content={
              <div className="account-help-content">
                <p>普通账号列表只展示身份与登录状态。</p>
                <p>更新 Cookie 后，重新校验以确认对应用户。</p>
              </div>
            }
            trigger="click"
          >
            <Button type="link" size="small">
              了解更多
            </Button>
          </Popover>
        </div>
      )}
      <Modal
        title={
          editor?.kind === 'create'
            ? '添加账号'
            : editor?.kind === 'cookie'
              ? '更新 Cookie'
              : '修改账号备注'
        }
        open={editor !== null}
        okText="保存"
        cancelText="取消"
        confirmLoading={save.isPending}
        destroyOnHidden
        onOk={() => form.submit()}
        onCancel={() => {
          if (!save.isPending) {
            form.resetFields();
            setEditor(null);
          }
        }}
      >
        {editor?.kind === 'cookie' && (
          <div className="connection-editor-identity">
            <UserAvatar
              url={editor.account.avatar_url}
              name={editor.account.nickname || editor.account.name}
              size={32}
            />
            <span>{editor.account.nickname || editor.account.name}</span>
          </div>
        )}
        <Form
          form={form}
          layout="vertical"
          onFinish={(values) => save.mutate(values)}
          style={{ marginTop: 20 }}
          disabled={save.isPending}
        >
          {editor?.kind !== 'cookie' && (
            <Form.Item
              name="name"
              label="账号备注"
              rules={[
                { required: true, whitespace: true, message: '请输入账号备注' },
                { max: 128, message: '备注最多 128 个字符' },
              ]}
              extra={editor?.kind === 'create' ? '用来区分账号，校验后会展示真实昵称。' : undefined}
            >
              <Input autoComplete="off" placeholder="例如：日常账号" />
            </Form.Item>
          )}
          {editor?.kind !== 'rename' && (
            <Form.Item
              name="cookie"
              label="Cookie"
              rules={[{ required: true, whitespace: true, message: '请填写 Cookie' }]}
              extra="复制浏览器请求头中的 Cookie，需要包含 a1 和 web_session。"
            >
              <Input.Password autoComplete="new-password" placeholder="a1=...; web_session=..." />
            </Form.Item>
          )}
        </Form>
      </Modal>
    </div>
  );
}
