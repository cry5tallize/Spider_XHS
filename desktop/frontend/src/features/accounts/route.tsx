import { useState } from 'react';
import { App, Button, Card, Form, Input, Modal, Space, Switch, Table, Tag, Typography } from 'antd';
import { PlusOutlined, ReloadOutlined, EditOutlined, KeyOutlined, DeleteOutlined, StarOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AccountStatus, type Account } from '@/shared/contracts';
import { listAccounts, createAccount, updateAccount, replaceAccountCookie, setDefaultAccount, validateAccount, deleteAccount } from './api';

const queryKey = ['accounts'] as const;
const statuses: Record<AccountStatus, { label: string; color?: string }> = {
  [AccountStatus.Unknown]: { label: '未知' }, [AccountStatus.Unchecked]: { label: '待校验', color: 'blue' },
  [AccountStatus.Valid]: { label: '有效', color: 'green' }, [AccountStatus.Expired]: { label: '已失效', color: 'orange' },
  [AccountStatus.Restricted]: { label: '受限', color: 'orange' }, [AccountStatus.Disabled]: { label: '已禁用' },
  [AccountStatus.Error]: { label: '校验失败', color: 'red' },
};
type Editor = { kind: 'create' } | { kind: 'rename' | 'cookie'; account: Account };
type EditorFields = { name: string; cookie: string };

export function Component() {
  const { message, modal } = App.useApp();
  const client = useQueryClient();
  const accounts = useQuery({ queryKey, queryFn: ({ signal }) => listAccounts(signal) });
  const [editor, setEditor] = useState<Editor | null>(null);
  const [form] = Form.useForm<EditorFields>();
  const refresh = () => { void client.invalidateQueries({ queryKey }); };
  const error = (err: Error) => { void message.error(err.message || '操作失败'); };
  const save = useMutation({
    mutationFn: async (values: EditorFields) => {
      if (editor?.kind === 'create') return createAccount(values);
      if (editor?.kind === 'cookie') return replaceAccountCookie({ id: editor.account.id, cookie: values.cookie, expected_version: editor.account.credential_version });
      if (editor?.kind === 'rename') return updateAccount({ id: editor.account.id, name: values.name, enabled: editor.account.enabled });
      throw new Error('未选择账号');
    },
    onSuccess: () => { form.resetFields(); setEditor(null); refresh(); void message.success('账号已保存'); }, onError: error,
  });
  const check = useMutation({ mutationFn: validateAccount, onSuccess: result => {
    refresh(); if (result.status === AccountStatus.Valid) void message.success('账号校验通过'); else void message.warning(result.last_error || '账号校验未通过');
  }, onError: error });
  const change = useMutation({ mutationFn: updateAccount, onSuccess: refresh, onError: error });
  const makeDefault = useMutation({ mutationFn: setDefaultAccount, onSuccess: refresh, onError: error });
  const remove = useMutation({ mutationFn: deleteAccount, onSuccess: refresh, onError: error });
  const open = (next: Editor) => {
    form.resetFields();
    if (next.kind !== 'create') form.setFieldValue('name', next.account.name);
    setEditor(next);
  };
  const confirmDelete = (account: Account) => modal.confirm({ title: `删除“${account.name}”？`,
    content: '清除本机保存的 Cookie，相关笔记和下载历史保留。', okText: '删除', okButtonProps: { danger: true }, cancelText: '取消',
    onOk: () => remove.mutateAsync(account.id),
  });
  return <div className="page">
    <div className="page-toolbar"><div><Typography.Title level={2} style={{ marginTop: 0 }}>账号管理</Typography.Title>
      <Typography.Text type="secondary">手动填写 Cookie，独立管理多个账号。保存后可按需校验。</Typography.Text></div>
      <Space><Button icon={<ReloadOutlined />} aria-label="刷新账号" onClick={() => void accounts.refetch()} />
        <Button type="primary" icon={<PlusOutlined />} onClick={() => open({ kind: 'create' })}>添加账号</Button></Space>
    </div>
    <Card className="account-table" styles={{ body: { padding: 0 } }}>
      {accounts.isError && <Typography.Paragraph type="danger" style={{ padding: 20 }}>{accounts.error.message}</Typography.Paragraph>}
      <Table<Account> rowKey="id" dataSource={accounts.data ?? []} loading={accounts.isPending} pagination={false}
        locale={{ emptyText: '还没有账号，点击“添加账号”填写 Cookie' }} scroll={{ x: 960 }} columns={[
          { title: '账号', dataIndex: 'name', width: 190, render: (_name: string, account) => <Space orientation="vertical" size={2}>
            <Space><Typography.Text strong>{account.name}</Typography.Text>{account.is_default && <Tag color="blue">默认</Tag>}</Space>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>{account.user_id || '尚未校验身份'}</Typography.Text>
          </Space> },
          { title: '状态', width: 110, render: (_value: unknown, account) => <Tag color={statuses[account.status]?.color}>{statuses[account.status]?.label || '未知'}</Tag> },
          { title: '校验信息', render: (_value: unknown, account) => <Space orientation="vertical" size={2}>
            <Typography.Text type={account.last_error ? 'danger' : 'secondary'} style={{ fontSize: 12 }}>{account.last_error || account.nickname || 'Cookie 已加密保存在本机'}</Typography.Text>
            {account.validated_at_ms && <Typography.Text type="secondary" style={{ fontSize: 12 }}>{new Date(account.validated_at_ms).toLocaleString('zh-CN')}</Typography.Text>}
          </Space> },
          { title: '启用', width: 76, render: (_value: unknown, account) => <Switch checked={account.enabled} loading={change.isPending && change.variables?.id === account.id}
            onChange={enabled => change.mutate({ id: account.id, name: account.name, enabled })} /> },
          { title: '操作', width: 290, render: (_value: unknown, account) => <Space size={4}>
            <Button size="small" onClick={() => check.mutate(account.id)} disabled={!account.enabled || check.isPending} loading={check.isPending && check.variables === account.id}>校验</Button>
            <Button size="small" type="text" icon={<StarOutlined />} aria-label={`设为默认：${account.name}`} disabled={!account.enabled || account.is_default || makeDefault.isPending} onClick={() => makeDefault.mutate(account.id)} />
            <Button size="small" type="text" icon={<EditOutlined />} aria-label={`编辑名称：${account.name}`} onClick={() => open({ kind: 'rename', account })} />
            <Button size="small" type="text" icon={<KeyOutlined />} aria-label={`更新 Cookie：${account.name}`} onClick={() => open({ kind: 'cookie', account })} />
            <Button size="small" type="text" danger icon={<DeleteOutlined />} aria-label={`删除账号：${account.name}`} onClick={() => confirmDelete(account)} />
          </Space> },
        ]} />
    </Card>
    <Modal title={editor?.kind === 'create' ? '添加账号' : editor?.kind === 'cookie' ? '更新 Cookie' : '编辑账号名称'} open={editor !== null}
      okText="保存" cancelText="取消" confirmLoading={save.isPending} onOk={() => form.submit()} onCancel={() => { if (!save.isPending) { form.resetFields(); setEditor(null); } }} destroyOnHidden>
      <Form form={form} layout="vertical" onFinish={values => save.mutate(values)} style={{ marginTop: 20 }}>
        {editor?.kind !== 'cookie' && <Form.Item name="name" label="账号名称" rules={[{ required: true, message: '请输入账号名称' }, { max: 128 }]}><Input placeholder="例如：主账号" autoComplete="off" /></Form.Item>}
        {editor?.kind !== 'rename' && <Form.Item name="cookie" label="Cookie" rules={[{ required: true, message: '请填写 Cookie' }]}
          extra="从浏览器复制 Cookie 请求头内容，需要包含 a1 和 web_session。普通查询不会返回 Cookie 原文。">
          <Input.Password autoComplete="new-password" placeholder="a1=...; web_session=..." /></Form.Item>}
      </Form>
    </Modal>
  </div>;
}
