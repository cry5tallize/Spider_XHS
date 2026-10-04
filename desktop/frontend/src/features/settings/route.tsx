import { useEffect, useState } from 'react';
import { App, Button, Card, Form, Input, InputNumber, Segmented, Space, Typography } from 'antd';
import { DesktopOutlined, SunOutlined, MoonOutlined, CheckOutlined, FolderOpenOutlined } from '@ant-design/icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ThemeMode, type Bootstrap, type General, type UpdateGeneral } from '@/shared/contracts';
import { useBootstrap, bootstrapKey } from '@/app/bootstrap-context';
import { useTheme } from '@/app/theme/context';
import { updateGeneral, chooseOutputDirectory } from './api';

type FormValues = Pick<General, 'theme_mode' | 'max_concurrent_notes' | 'output_directory'>;

export function Component() {
  const bootstrap = useBootstrap();
  const { settings } = bootstrap;
  const { preview, clearPreview } = useTheme();
  const { message } = App.useApp();
  const [form] = Form.useForm<FormValues>();
  const [editingRevision, setEditingRevision] = useState(settings.revision);
  const queryClient = useQueryClient();
  const chooseDirectory = useMutation({
    mutationFn: chooseOutputDirectory,
    onSuccess: directory => { if (directory) form.setFieldValue('output_directory', directory); },
    onError: (error: Error) => void message.error(error.message || '无法打开文件夹选择器'),
  });
  useEffect(() => clearPreview, [clearPreview]);
  const save = useMutation({
    mutationFn: (input: UpdateGeneral) => updateGeneral(input),
    onSuccess: saved => {
      queryClient.setQueryData<Bootstrap>(bootstrapKey, old => old ? { ...old, settings: saved } : old);
      void queryClient.invalidateQueries({ queryKey: ['download-defaults'] });
      clearPreview();
      setEditingRevision(saved.revision);
      void message.success('偏好已保存');
    },
    onError: (error: Error) => void message.error(error.message || '保存失败，请重试'),
  });
  return <div className="page settings-page">
    <Typography.Title level={2}>设置</Typography.Title>
    <Typography.Paragraph type="secondary">调整外观与下载偏好，新任务将使用你保存的配置。</Typography.Paragraph>
    <Form form={form} layout="vertical" initialValues={settings}
      onValuesChange={changed => { if (changed.theme_mode !== undefined) preview(changed.theme_mode as ThemeMode); }}
      onFinish={values => save.mutate({ ...values, expected_revision: editingRevision })}>
      <Card title="外观" className="settings-card">
        <Form.Item name="theme_mode" label="主题模式" rules={[{ required: true }]}>
          <Segmented options={[
            { value: ThemeMode.ThemeSystem, label: '跟随系统', icon: <DesktopOutlined /> },
            { value: ThemeMode.ThemeLight, label: '浅色', icon: <SunOutlined /> },
            { value: ThemeMode.ThemeDark, label: '深色', icon: <MoonOutlined /> },
          ]} />
        </Form.Item>
      </Card>
      <Card title="下载偏好" className="settings-card">
        <Form.Item label="默认下载目录" extra={`留空使用 ${bootstrap.default_download_directory}；单条任务可以另选位置。`}>
          <Space.Compact style={{ width: '100%' }}>
            <Form.Item name="output_directory" noStyle><Input aria-label="默认下载目录" allowClear placeholder={bootstrap.default_download_directory} autoComplete="off" /></Form.Item>
            <Button aria-label="选择下载目录" icon={<FolderOpenOutlined />} loading={chooseDirectory.isPending} onClick={() => chooseDirectory.mutate()}>选择</Button>
            <Button onClick={() => form.setFieldValue('output_directory', '')}>恢复默认</Button>
          </Space.Compact>
        </Form.Item>
        <Form.Item name="max_concurrent_notes" label="同时下载的笔记数" extra="每条笔记的下载项始终按顺序执行。" rules={[{ required: true, type: 'number', min: 1, max: 32 }]}>
          <InputNumber min={1} max={32} precision={0} suffix="条笔记" style={{ width: 200 }} />
        </Form.Item>
      </Card>
      <div className="settings-actions"><Button type="primary" htmlType="submit" aria-label="保存偏好" icon={<CheckOutlined aria-hidden />} loading={save.isPending}>保存偏好</Button></div>
    </Form>
    <Card title="本地数据" className="settings-card">
      <Space orientation="vertical" size={8}>
        <Typography.Text type="secondary">应用版本：{bootstrap.version}</Typography.Text>
        <Typography.Text copyable>{bootstrap.data_directory}</Typography.Text>
        <Typography.Text type="secondary">账号、配置、记录和缓存统一保存在可执行文件旁的 data 目录。</Typography.Text>
        <Typography.Text type="secondary">未设置下载位置时使用 {bootstrap.default_download_directory}。</Typography.Text>
      </Space>
    </Card>
  </div>;
}
