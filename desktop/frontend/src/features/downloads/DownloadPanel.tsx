import { useEffect, useRef, useState } from 'react';
import { Alert, App, Button, Collapse, Input, Modal, Select, Skeleton, Space, Tooltip } from 'antd';
import {
  CheckCircleOutlined,
  DownloadOutlined,
  FolderOpenOutlined,
  SaveOutlined,
  SettingOutlined,
  DeleteOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { type DownloadConfig, type PlanPreview, MediaKind } from '@/shared/contracts';
import { chooseOutputDirectory } from '@/shared/bridge';
import { formatBytes } from '@/features/notes/labels';
import { DownloadOptions, type MediaHints } from './DownloadOptions';
import { AdvancedOptions } from './AdvancedOptions';
import { initialDownloadConfig, isContentFile } from './selection';
import {
  getDownloadDefaults,
  previewDownloadPlans,
  getMediaCandidates,
  createDownloadTask,
  createDownloadBatch,
  listDownloadPresets,
  saveDownloadPreset,
  deleteDownloadPreset,
} from './api';
import { mediaLabels } from './labels';

type Props = {
  snapshotIDs: string[];
  initialConfig?: DownloadConfig;
  force?: boolean;
  hints?: MediaHints;
  title?: string;
};
type Settled = { key: string; ids: string[]; config: DownloadConfig };
export function DownloadPanel(props: Props) {
  const defaults = useQuery({
    queryKey: ['download-defaults'],
    queryFn: ({ signal }) => getDownloadDefaults(signal),
    staleTime: 30000,
  });
  if (defaults.isPending)
    return (
      <section className="parse-download-panel">
        <Skeleton active paragraph={{ rows: 5 }} />
      </section>
    );
  if (defaults.isError)
    return (
      <Alert
        type="error"
        title="下载选项加载失败"
        description={defaults.error.message}
        action={<Button onClick={() => void defaults.refetch()}>重试</Button>}
      />
    );
  return <PanelContent {...props} defaults={defaults.data} />;
}
function PanelContent({
  snapshotIDs,
  defaults,
  initialConfig,
  force,
  hints,
  title,
}: Props & { defaults: DownloadConfig }) {
  const { message, modal } = App.useApp();
  const client = useQueryClient();
  const navigate = useNavigate();
  const [config, setConfig] = useState(() => initialDownloadConfig(defaults, initialConfig, force));
  const [settled, setSettled] = useState<Settled | null>(null);
  const [advanced, setAdvanced] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [name, setName] = useState('');
  const [withDirectory, setWithDirectory] = useState(false);
  const [presetID, setPresetID] = useState<string>();
  const [submitted, setSubmitted] = useState('');
  const [exclusions, setExclusions] = useState({ key: '', ids: [] as string[] });
  const request = useRef({ key: '', id: '' });
  const ids = [...new Set(snapshotIDs.filter(Boolean))];
  const groupKey = JSON.stringify(ids);
  const excluded = exclusions.key === groupKey ? exclusions.ids : [];
  const targets = ids.filter((id) => !excluded.includes(id));
  const liveKey = JSON.stringify({ ids: targets, config });
  useEffect(() => {
    const parsed = JSON.parse(liveKey) as { ids: string[]; config: DownloadConfig };
    const timer = setTimeout(() => setSettled({ key: liveKey, ...parsed }), 250);
    return () => clearTimeout(timer);
  }, [liveKey]);
  const preview = useQuery({
    queryKey: ['download-preview', settled?.key],
    enabled: !!settled && settled.ids.length > 0 && settled.ids.length <= 200,
    queryFn: ({ signal }) => previewDownloadPlans(settled!.ids, settled!.config, signal),
    staleTime: Infinity,
    gcTime: 60000,
    retry: false,
  });
  const single = targets.length === 1;
  const catalog = useQuery({
    queryKey: ['media-candidates', single ? targets[0] : ''],
    enabled: single,
    queryFn: ({ signal }) => getMediaCandidates(targets[0], signal),
    staleTime: Infinity,
  });
  const presets = useQuery({
    queryKey: ['download-presets'],
    queryFn: ({ signal }) => listDownloadPresets(signal),
    staleTime: 30000,
  });
  const ready =
    settled?.key === liveKey && preview.isSuccess && !preview.isFetching && targets.length > 0;
  const plans = ready ? preview.data || [] : [];
  const unavailable = plans.filter((plan) => !plan.files?.some(isContentFile));
  const tooMany = targets.length > 200;
  const canCreate =
    ready && plans.length > 0 && unavailable.length === 0 && !tooMany && submitted !== liveKey;
  const create = useMutation({
    mutationFn: async (input: Settled & { requestID: string }) => {
      if (input.ids.length === 1)
        return createDownloadTask({
          request_id: input.requestID,
          snapshot_id: input.ids[0],
          config: input.config,
        });
      return createDownloadBatch({
        request_id: input.requestID,
        snapshot_ids: input.ids,
        config: input.config,
      });
    },
    onSuccess: (_result, input) => {
      setSubmitted(input.key);
      void client.invalidateQueries({ queryKey: ['downloads'] });
    },
    onError: (error: Error) => {
      void message.error(error.message);
    },
  });
  const choose = useMutation({
    mutationFn: chooseOutputDirectory,
    onSuccess: (directory) => {
      if (directory) change({ ...config, output: { ...config.output, directory } });
    },
    onError: (error: Error) => {
      void message.error(error.message);
    },
  });
  const save = useMutation({
    mutationFn: () => {
      const next = structuredClone(config);
      if (!withDirectory) next.output.directory = '';
      return saveDownloadPreset({ id: '', name: name.trim(), config: next });
    },
    onSuccess: (preset) => {
      void client.invalidateQueries({ queryKey: ['download-presets'] });
      setPresetID(preset.id);
      setSaveOpen(false);
      setName('');
      void message.success('预设已保存');
    },
    onError: (error: Error) => {
      void message.error(error.message);
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => deleteDownloadPreset(id),
    onSuccess: () => {
      setPresetID(undefined);
      void client.invalidateQueries({ queryKey: ['download-presets'] });
    },
    onError: (error: Error) => {
      void message.error(error.message);
    },
  });
  function change(next: DownloadConfig) {
    setConfig(next);
    setPresetID(undefined);
  }
  const files = plans.flatMap((plan) => plan.files || []);
  const count = (kind: MediaKind) => files.filter((file) => file.kind === kind).length;
  const summary = [
    [count(MediaKind.MediaVideo), '个视频'],
    [count(MediaKind.MediaImage), '张图片'],
    [count(MediaKind.MediaMotion), '段实况'],
    [count(MediaKind.MediaText), '份正文'],
  ]
    .filter(([amount]) => Number(amount) > 0)
    .map(([amount, label]) => amount + ' ' + label)
    .join(' · ');
  const warnings = [...new Set(plans.flatMap((plan) => plan.warnings || []))];
  const knownBytes = plans.reduce((sum, plan) => sum + plan.known_bytes, 0);
  const unknown = plans.reduce((sum, plan) => sum + plan.unknown_sizes, 0);
  return (
    <section className="parse-download-panel" aria-label="下载选项" aria-busy={create.isPending}>
      <div className="download-panel-heading">
        <h2>{title || '下载选项'}</h2>
        {targets.length > 1 && <span>{targets.length} 条笔记</span>}
      </div>
      {!!presets.data?.length && (
        <div className="download-preset-row">
          <Select
            aria-label="下载预设"
            placeholder="使用下载预设"
            allowClear
            value={presetID}
            disabled={create.isPending}
            options={presets.data.map((preset) => ({ value: preset.id, label: preset.name }))}
            onChange={(id) => {
              const preset = presets.data?.find((preset) => preset.id === id);
              if (!preset) {
                setPresetID(undefined);
                return;
              }
              const next = initialDownloadConfig(defaults, preset.config, force);
              if (!next.output.directory) next.output.directory = defaults.output.directory;
              setConfig(next);
              setPresetID(id);
            }}
          />
          <Tooltip title="删除当前预设">
            <Button
              type="text"
              icon={<DeleteOutlined />}
              disabled={!presetID || create.isPending || remove.isPending}
              aria-label="删除当前下载预设"
              onClick={() =>
                modal.confirm({
                  title: '删除这个下载预设？',
                  okText: '删除',
                  cancelText: '取消',
                  okButtonProps: { danger: true },
                  onOk: () => (presetID ? remove.mutateAsync(presetID) : undefined),
                })
              }
            />
          </Tooltip>
        </div>
      )}
      {catalog.isError && single && (
        <Alert
          type="warning"
          title="无法读取媒体规格"
          description={catalog.error.message}
          action={
            <Button size="small" onClick={() => void catalog.refetch()}>
              重试
            </Button>
          }
        />
      )}
      {single && catalog.isPending ? (
        <Skeleton active paragraph={{ rows: 3 }} />
      ) : (
        <DownloadOptions
          config={config}
          onChange={change}
          catalog={catalog.data}
          batch={!single}
          hints={single && catalog.data ? undefined : hints}
          disabled={create.isPending}
        />
      )}
      <label className="download-directory-label">
        保存到
        <div className="download-directory-field">
          <Input
            aria-label="下载目录"
            value={config.output.directory}
            disabled={create.isPending}
            onChange={(event) =>
              change({ ...config, output: { ...config.output, directory: event.target.value } })
            }
          />
          <Tooltip title="选择文件夹">
            <Button
              icon={<FolderOpenOutlined />}
              aria-label="选择下载文件夹"
              loading={choose.isPending}
              disabled={create.isPending}
              onClick={() => choose.mutate()}
            />
          </Tooltip>
        </div>
      </label>
      <div className="download-panel-tools">
        <Button
          type="text"
          icon={<SettingOutlined />}
          disabled={create.isPending}
          onClick={() => setAdvanced(true)}
        >
          更多选项
        </Button>
        <Button
          type="text"
          icon={<SaveOutlined />}
          disabled={create.isPending}
          onClick={() => setSaveOpen(true)}
        >
          保存预设
        </Button>
      </div>
      {tooMany && <Alert type="warning" title="单次最多下载 200 条笔记，请减少选择。" />}
      {!ready && targets.length > 0 && !tooMany && !preview.isError && (
        <div className="download-plan-summary workspace-muted">正在准备下载计划…</div>
      )}
      {targets.length === 0 && (
        <p className="workspace-muted">当前没有选中可下载的笔记，可恢复已跳过的结果。</p>
      )}
      {preview.isError && settled?.key === liveKey && (
        <Alert
          type="error"
          title="下载计划无法生成"
          description={preview.error.message}
          action={
            <Button size="small" onClick={() => void preview.refetch()}>
              重试
            </Button>
          }
        />
      )}
      {ready && (
        <div className="download-plan-summary">
          <strong>
            {summary ||
              (files.length > 0 ? '附加文件 ' + files.length + ' 份' : '没有选中可保存的内容')}
          </strong>
          {!!files.length && (
            <span>
              {unknown ? '已知大小 ' : '合计 '}
              {formatBytes(knownBytes)}
              {unknown > 0 && ' · ' + unknown + ' 项大小未知'}
            </span>
          )}
          {warnings.length > 0 && (
            <span className="download-plan-warning">{warnings.join('；')}</span>
          )}
        </div>
      )}
      {unavailable.length > 0 && (
        <Alert
          type="warning"
          title={unavailable.length + ' 条笔记没有符合选项的内容'}
          description="调整清晰度、编码或保存内容后再下载。"
          action={
            targets.length > 1 ? (
              <Button
                size="small"
                onClick={() =>
                  setExclusions({
                    key: groupKey,
                    ids: [...excluded, ...unavailable.map((plan) => plan.snapshot_id)],
                  })
                }
              >
                跳过这些笔记
              </Button>
            ) : undefined
          }
        />
      )}
      {!!excluded.length && (
        <div className="download-exclusions">
          已跳过 {excluded.length} 条
          <Button
            type="link"
            size="small"
            onClick={() => setExclusions({ key: groupKey, ids: [] })}
          >
            恢复
          </Button>
        </div>
      )}
      {submitted === liveKey ? (
        <div className="download-submitted" role="status" aria-live="polite">
          <CheckCircleOutlined />
          已加入下载队列
          <Button type="link" onClick={() => void navigate('/downloads')}>
            查看任务
          </Button>
        </div>
      ) : (
        <Button
          className="download-submit"
          type="primary"
          block
          size="large"
          icon={<DownloadOutlined />}
          disabled={!canCreate || create.isPending}
          loading={create.isPending}
          onClick={() => {
            if (!canCreate || !settled) return;
            if (request.current.key !== settled.key)
              request.current = { key: settled.key, id: crypto.randomUUID() };
            create.mutate({ ...settled, requestID: request.current.id });
          }}
        >
          {targets.length > 1 ? '下载所选笔记' : '下载笔记'}
        </Button>
      )}
      {ready && files.length > 0 && (
        <Collapse
          ghost
          className="download-file-details"
          items={[
            {
              key: 'files',
              label: '查看保存明细',
              children: plans.map((plan) => <PlanFiles plan={plan} key={plan.snapshot_id} />),
            },
          ]}
        />
      )}
      <AdvancedOptions
        open={advanced}
        onClose={() => setAdvanced(false)}
        config={config}
        snapshotID={single ? targets[0] : ''}
        batch={!single}
        onApply={change}
      />
      <Modal
        title="保存下载预设"
        open={saveOpen}
        confirmLoading={save.isPending}
        okText="保存"
        cancelText="取消"
        onCancel={() => setSaveOpen(false)}
        onOk={() => {
          if (!name.trim()) {
            void message.warning('请填写预设名称');
            return;
          }
          save.mutate();
        }}
      >
        <Input
          aria-label="下载预设名称"
          placeholder="例如：1080p 视频与实况"
          value={name}
          maxLength={128}
          onChange={(event) => setName(event.target.value)}
        />
        <Space style={{ marginTop: 16 }}>
          <input
            type="checkbox"
            id="preset-directory"
            checked={withDirectory}
            onChange={(event) => setWithDirectory(event.target.checked)}
          />
          <label htmlFor="preset-directory">同时保存下载位置</label>
        </Space>
      </Modal>
    </section>
  );
}
function PlanFiles({ plan }: { plan: PlanPreview }) {
  return (
    <div className="download-plan-files">
      <strong>{plan.title || '无标题笔记'}</strong>
      <small title={plan.directory}>{plan.directory}</small>
      {(plan.files || []).slice(0, 100).map((file) => (
        <div key={file.sequence}>
          <span>
            {mediaLabels[file.kind]}
            {file.representation.width && file.representation.height
              ? ' · ' + file.representation.width + '×' + file.representation.height
              : ''}
          </span>
          <span>{formatBytes(file.bytes)}</span>
        </div>
      ))}
      {(plan.files?.length || 0) > 100 && (
        <small>共 {plan.files?.length} 个文件，当前显示前 100 个。</small>
      )}
    </div>
  );
}
