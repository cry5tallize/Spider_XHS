import { useEffect, useState } from 'react';
import { App, Button, Collapse, Form, Input, InputNumber, Typography } from 'antd';
import {
  DesktopOutlined,
  SunOutlined,
  MoonOutlined,
  CheckOutlined,
  FolderOpenOutlined,
  CheckCircleOutlined,
} from '@ant-design/icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ThemeMode, type Bootstrap, type General, type UpdateGeneral } from '@/shared/contracts';
import { useBootstrap, bootstrapKey } from '@/app/bootstrap-context';
import { useTheme } from '@/app/theme/context';
import { PageHeading } from '@/shared/components/Workspace';
import { updateGeneral, chooseOutputDirectory } from './api';

type FormValues = Pick<General, 'theme_mode' | 'max_concurrent_notes' | 'output_directory'>;
const pickValues = (settings: General): FormValues => ({
  theme_mode: settings.theme_mode,
  max_concurrent_notes: settings.max_concurrent_notes,
  output_directory: settings.output_directory,
});
const watchValues = (values: Partial<FormValues>) => ({
  theme_mode: values.theme_mode,
  output_directory: values.output_directory,
  max_concurrent_notes: values.max_concurrent_notes,
});

function ThemePicker({
  value,
  onChange,
  disabled,
}: {
  value?: ThemeMode;
  onChange?: (value: ThemeMode) => void;
  disabled?: boolean;
}) {
  const options = [
    { value: ThemeMode.ThemeLight, label: '浅色', icon: <SunOutlined />, appearance: 'light' },
    { value: ThemeMode.ThemeDark, label: '深色', icon: <MoonOutlined />, appearance: 'dark' },
    {
      value: ThemeMode.ThemeSystem,
      label: '跟随系统',
      icon: <DesktopOutlined />,
      appearance: 'system',
    },
  ];
  return (
    <div className="theme-picker" role="radiogroup" aria-label="主题模式">
      {options.map((option, index) => (
        <button
          type="button"
          role="radio"
          aria-checked={value === option.value}
          aria-label={option.label}
          tabIndex={value === option.value ? 0 : -1}
          disabled={disabled}
          key={option.value}
          className={'theme-option' + (value === option.value ? ' is-selected' : '')}
          onClick={() => onChange?.(option.value)}
          onKeyDown={(event) => {
            const offset = ['ArrowRight', 'ArrowDown'].includes(event.key)
              ? 1
              : ['ArrowLeft', 'ArrowUp'].includes(event.key)
                ? -1
                : 0;
            if (!offset && event.key !== 'Home' && event.key !== 'End') return;
            event.preventDefault();
            const next =
              event.key === 'Home'
                ? 0
                : event.key === 'End'
                  ? options.length - 1
                  : (index + offset + options.length) % options.length;
            onChange?.(options[next].value);
            event.currentTarget.parentElement
              ?.querySelectorAll<HTMLButtonElement>('button')
              [next]?.focus();
          }}
        >
          <div className={'theme-miniature preview-' + option.appearance} aria-hidden="true">
            <div className="mini-sidebar">
              <i />
              <i />
              <i />
            </div>
            <div className="mini-content">
              <i />
              <div>
                <i />
                <i />
              </div>
            </div>
          </div>
          <span className="theme-option-label">
            {option.icon}
            {option.label}
            <span className="theme-option-check">
              {value === option.value && <CheckCircleOutlined />}
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}

export function Component() {
  const bootstrap = useBootstrap();
  const { settings } = bootstrap;
  const { preview, clearPreview } = useTheme();
  const { message } = App.useApp();
  const [form] = Form.useForm<FormValues>();
  const [baseline, setBaseline] = useState(() => pickValues(settings));
  const [editingRevision, setEditingRevision] = useState(settings.revision);
  const values = Form.useWatch(watchValues, form);
  const dirty =
    values?.theme_mode !== undefined &&
    (values.theme_mode !== baseline.theme_mode ||
      values.output_directory !== baseline.output_directory ||
      values.max_concurrent_notes !== baseline.max_concurrent_notes);
  const queryClient = useQueryClient();
  const chooseDirectory = useMutation({
    mutationFn: chooseOutputDirectory,
    onSuccess: (directory) => {
      if (directory) form.setFieldValue('output_directory', directory);
    },
    onError: (error: Error) => void message.error(error.message || '无法打开文件夹选择器'),
  });
  useEffect(() => clearPreview, [clearPreview]);
  const save = useMutation({
    mutationFn: (input: UpdateGeneral) => updateGeneral(input),
    onSuccess: (saved) => {
      queryClient.setQueryData<Bootstrap>(bootstrapKey, (old) =>
        old ? { ...old, settings: saved } : old,
      );
      void queryClient.invalidateQueries({ queryKey: ['download-defaults'] });
      const next = pickValues(saved);
      form.setFieldsValue(next);
      setBaseline(next);
      clearPreview();
      setEditingRevision(saved.revision);
      void message.success('偏好已保存');
    },
    onError: (error: Error) => void message.error(error.message || '保存失败，请重试'),
  });
  const undo = () => {
    form.setFieldsValue(baseline);
    clearPreview();
  };
  return (
    <div className="page workspace-page calm-page preferences-page">
      <PageHeading title="设置" />
      <Form
        form={form}
        layout="vertical"
        initialValues={baseline}
        disabled={save.isPending}
        onValuesChange={(changed) => {
          if (changed.theme_mode !== undefined) preview(changed.theme_mode as ThemeMode);
        }}
        onFinish={(values) => save.mutate({ ...values, expected_revision: editingRevision })}
      >
        <section className="preference-section" aria-labelledby="appearance-heading">
          <div className="preference-section-heading">
            <h2 id="appearance-heading">外观</h2>
            <p>选择你习惯的主题。</p>
          </div>
          <Form.Item name="theme_mode" rules={[{ required: true }]} noStyle>
            <ThemePicker disabled={save.isPending} />
          </Form.Item>
        </section>
        <section className="preference-section" aria-labelledby="download-heading">
          <div className="preference-section-heading">
            <h2 id="download-heading">下载</h2>
            <p>新任务会使用这些偏好。</p>
          </div>
          <div className="preference-fields">
            <div className="preference-field directory-preference">
              <div className="preference-field-label">
                <label htmlFor="download-directory">保存位置</label>
                <Button
                  type="link"
                  size="small"
                  onClick={() => form.setFieldValue('output_directory', '')}
                >
                  恢复默认
                </Button>
              </div>
              <div className="directory-input">
                <Form.Item name="output_directory" noStyle>
                  <Input
                    id="download-directory"
                    aria-label="默认下载目录"
                    allowClear
                    placeholder={bootstrap.default_download_directory}
                    autoComplete="off"
                  />
                </Form.Item>
                <Button
                  aria-label="选择下载目录"
                  icon={<FolderOpenOutlined />}
                  loading={chooseDirectory.isPending}
                  onClick={() => chooseDirectory.mutate()}
                >
                  选择文件夹
                </Button>
              </div>
            </div>
            <div className="preference-field concurrency-preference">
              <div>
                <label htmlFor="download-concurrency">同时下载</label>
                <p id="download-concurrency-help">建议 2–4 条，按网络情况调整。</p>
              </div>
              <Form.Item
                name="max_concurrent_notes"
                rules={[
                  {
                    required: true,
                    type: 'number',
                    min: 1,
                    max: 32,
                    message: '请输入 1–32 之间的整数',
                  },
                ]}
                className="concurrency-input"
                style={{ marginBottom: 0 }}
              >
                <InputNumber
                  id="download-concurrency"
                  aria-label="同时下载的笔记数"
                  aria-describedby="download-concurrency-help"
                  min={1}
                  max={32}
                  precision={0}
                  suffix="条笔记"
                />
              </Form.Item>
            </div>
          </div>
        </section>
        {dirty && (
          <div className="preferences-save-bar" role="region" aria-label="保存设置">
            <span>有未保存的更改</span>
            <div>
              <Button aria-label="撤销" onClick={undo} disabled={save.isPending}>
                撤销
              </Button>
              <Button
                type="primary"
                htmlType="submit"
                aria-label="保存偏好"
                icon={<CheckOutlined />}
                loading={save.isPending}
              >
                保存更改
              </Button>
            </div>
          </div>
        )}
      </Form>
      <Collapse
        ghost
        className="preferences-about"
        items={[
          {
            key: 'about',
            label: '本地数据与版本',
            extra: <span className="workspace-muted">v{bootstrap.version}</span>,
            children: (
              <div className="preferences-data">
                <p>账号、笔记和下载记录保存在本机。</p>
                <Typography.Text copyable>{bootstrap.data_directory}</Typography.Text>
                <p>默认下载位置</p>
                <Typography.Text copyable>{bootstrap.default_download_directory}</Typography.Text>
              </div>
            ),
          },
        ]}
      />
    </div>
  );
}
