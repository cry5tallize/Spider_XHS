import { App, Button, Checkbox, Drawer, Form, InputNumber, Select } from 'antd';
import { DedupMode, ExistingPolicy, type DownloadConfig } from '@/shared/contracts';
import { SelectionFields } from './SelectionFields';
import { changeLive } from './selection';

function Contents({
  config,
  snapshotID,
  batch,
  onApply,
}: {
  config: DownloadConfig;
  snapshotID: string;
  batch: boolean;
  onApply: (config: DownloadConfig) => void;
}) {
  const [form] = Form.useForm<DownloadConfig>();
  const { message } = App.useApp();
  return (
    <Form
      form={form}
      layout="vertical"
      initialValues={config}
      onValuesChange={(changed) => {
        if (changed.selection?.video?.mode !== undefined) {
          form.setFieldValue(['selection', 'video', 'width'], 0);
          form.setFieldValue(['selection', 'video', 'height'], 0);
          form.setFieldValue(['selection', 'video', 'max_short_edge'], 0);
        }
      }}
      onFinish={(values) => {
        const next = form.getFieldsValue(true) as DownloadConfig;
        onApply(
          values.selection.live_photo !== config.selection.live_photo
            ? changeLive(next, values.selection.live_photo)
            : next,
        );
      }}
    >
      <SelectionFields snapshotID={snapshotID} batch={batch} />
      <div className="download-config-grid">
        <Form.Item name={['output', 'existing_policy']} label="已有文件">
          <Select
            options={[
              { value: ExistingPolicy.Overwrite, label: '新文件完成后替换' },
              { value: ExistingPolicy.SkipExisting, label: '跳过已有文件' },
            ]}
          />
        </Form.Item>
        <Form.Item name={['dedup', 'mode']} label="已下载内容">
          <Select
            options={[
              { value: DedupMode.SameOutput, label: '复用同目录的有效文件' },
              { value: DedupMode.DedupOff, label: '重新下载' },
            ]}
          />
        </Form.Item>
        <Form.Item name={['execution', 'retries_per_url']} label="每个地址额外重试">
          <InputNumber min={0} max={5} />
        </Form.Item>
        <Form.Item name={['execution', 'max_attempts']} label="单个文件总尝试上限">
          <InputNumber min={1} max={64} />
        </Form.Item>
      </div>
      <div className="advanced-output-checks">
        {(
          [
            ['pretty', '笔记 JSON'],
            ['raw', '原始响应 JSON'],
            ['manifest', '文件索引与实况配对清单'],
          ] as const
        ).map(([key, label]) => (
          <Form.Item key={key} name={['media', key]} valuePropName="checked">
            <Checkbox>{label}</Checkbox>
          </Form.Item>
        ))}
        <Form.Item name={['execution', 'continue_on_error']} valuePropName="checked">
          <Checkbox>单个文件失败后继续后续内容</Checkbox>
        </Form.Item>
        <Form.Item name={['dedup', 'force']} valuePropName="checked">
          <Checkbox>忽略下载历史，强制重新下载</Checkbox>
        </Form.Item>
        <Form.Item name={['dedup', 'strict_hash']} valuePropName="checked">
          <Checkbox>复用前完整校验文件</Checkbox>
        </Form.Item>
      </div>
      <div className="advanced-options-actions">
        <Button
          onClick={() => {
            form.setFieldsValue(config);
            void message.info('已恢复打开时的设置');
          }}
        >
          恢复本次设置
        </Button>
        <Button type="primary" htmlType="submit">
          应用选项
        </Button>
      </div>
    </Form>
  );
}
export function AdvancedOptions({
  open,
  onClose,
  config,
  snapshotID,
  batch,
  onApply,
}: {
  open: boolean;
  onClose: () => void;
  config: DownloadConfig;
  snapshotID: string;
  batch: boolean;
  onApply: (config: DownloadConfig) => void;
}) {
  return (
    <Drawer title="更多下载选项" open={open} onClose={onClose} size={640} destroyOnHidden>
      {open && (
        <Contents
          config={config}
          snapshotID={snapshotID}
          batch={batch}
          onApply={(next) => {
            onApply(next);
            onClose();
          }}
        />
      )}
    </Drawer>
  );
}
