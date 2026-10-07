import { Alert, Checkbox, Collapse, Form, Input, InputNumber, Select, Typography } from 'antd';
import { useQuery } from '@tanstack/react-query';
import {
  VideoMode,
  ImageMode,
  LiveMode,
  HDRMode,
  MediaKind,
  type DownloadConfig,
  type MediaCandidate,
} from '@/shared/contracts';
import { getMediaCandidates } from './api';
import { formatBytes } from '@/features/notes/labels';

function candidateLabel(c: MediaCandidate) {
  const r = c.representation;
  return [
    c.kind === MediaKind.MediaMotion
      ? `LivePhoto ${r.image_index}`
      : c.kind === MediaKind.MediaImage
        ? `图片 ${r.image_index}`
        : '主视频',
    r.codec_group || r.scene,
    r.width && r.height ? `${r.width}×${r.height}` : '尺寸未知',
    r.fps && `${r.fps} FPS`,
    r.format,
    c.expected_bytes && formatBytes(c.expected_bytes),
  ]
    .filter(Boolean)
    .join(' · ');
}
export function SelectionFields({
  snapshotID,
  batch = false,
}: {
  snapshotID: string;
  batch?: boolean;
}) {
  const form = Form.useFormInstance<DownloadConfig>();
  const videoMode = Form.useWatch(['selection', 'video', 'mode'], form);
  const imageMode = Form.useWatch(['selection', 'images', 'mode'], form);
  const motion = Form.useWatch(['selection', 'motion'], form);
  const motionMode = Form.useWatch(['selection', 'motion', 'mode'], form);
  const catalog = useQuery({
    queryKey: ['media-candidates', snapshotID],
    queryFn: ({ signal }) => getMediaCandidates(snapshotID, signal),
    enabled: !batch && !!snapshotID,
    staleTime: Infinity,
  });
  const candidates = catalog.data?.candidates ?? [];
  const videoModes = [
    { value: VideoMode.VideoBest, label: '最佳可用流' },
    { value: VideoMode.VideoPerCodec, label: '每种编码各取最佳' },
    { value: VideoMode.VideoAll, label: '全部流 / 全部清晰度' },
    ...(!batch ? [{ value: VideoMode.VideoCustom, label: '自选具体流' }] : []),
  ];
  const imageModes = [
    { value: ImageMode.ImageBest, label: '每图最佳（WebDft 优先）' },
    { value: ImageMode.ImageAll, label: '每图全部变体' },
    { value: ImageMode.ImageScenes, label: '按 Scene 选择' },
    ...(!batch ? [{ value: ImageMode.ImageCustom, label: '自选具体变体' }] : []),
  ];
  return (
    <Collapse
      style={{ marginBottom: 20 }}
      defaultActiveKey={['selection']}
      items={[
        {
          key: 'selection',
          label: '媒体规格与候选',
          children: (
            <>
              {catalog.isError && (
                <Alert type="error" title={catalog.error.message} style={{ marginBottom: 12 }} />
              )}
              <div className="download-config-grid">
                <Form.Item
                  name={['selection', 'video', 'mode']}
                  label={motion ? '主视频策略' : '视频 / LivePhoto 动态流'}
                >
                  <Select options={videoModes} />
                </Form.Item>
                <Form.Item name={['selection', 'images', 'mode']} label="图片变体">
                  <Select options={imageModes} />
                </Form.Item>
                <Form.Item name={['selection', 'live_photo']} label="LivePhoto 导出">
                  <Select
                    options={[
                      { value: LiveMode.LiveBoth, label: '静态图 + 动态视频' },
                      { value: LiveMode.LiveStatic, label: '仅静态图' },
                      { value: LiveMode.LiveMotion, label: '仅动态视频' },
                      { value: LiveMode.LiveExclude, label: '跳过实况内容' },
                    ]}
                  />
                </Form.Item>
              </div>
              {videoMode === VideoMode.VideoCustom && (
                <Form.Item name={['selection', 'video', 'candidate_ids']} label="选择视频流">
                  <Select
                    mode="multiple"
                    showSearch
                    optionFilterProp="label"
                    options={candidates
                      .filter(
                        (c) =>
                          c.kind === MediaKind.MediaVideo ||
                          (!motion && c.kind === MediaKind.MediaMotion),
                      )
                      .map((c) => ({ value: c.id, label: candidateLabel(c) }))}
                  />
                </Form.Item>
              )}
              {imageMode === ImageMode.ImageCustom && (
                <Form.Item name={['selection', 'images', 'candidate_ids']} label="选择图片变体">
                  <Select
                    mode="multiple"
                    showSearch
                    optionFilterProp="label"
                    options={candidates
                      .filter((c) => c.kind === MediaKind.MediaImage)
                      .map((c) => ({ value: c.id, label: candidateLabel(c) }))}
                  />
                </Form.Item>
              )}
              {imageMode === ImageMode.ImageScenes && (
                <Form.Item name={['selection', 'images', 'scenes']} label="图片 Scene">
                  <Select
                    mode="tags"
                    options={catalog.data?.scenes?.map((value) => ({ value, label: value }))}
                    placeholder="例如 WebDft，也支持接口返回的其他 Scene"
                  />
                </Form.Item>
              )}
              <Typography.Text type="secondary">
                同编码可以有多个流，全部模式保留各个候选；主地址和备用地址用于同一文件的传输。
              </Typography.Text>
            </>
          ),
        },
        ...(motion
          ? [
              {
                key: 'motion',
                label: '实况动态规格',
                children: (
                  <>
                    <Form.Item name={['selection', 'motion', 'mode']} label="实况动态策略">
                      <Select options={videoModes} />
                    </Form.Item>
                    <Form.Item name={['selection', 'motion', 'codec_groups']} label="实况编码">
                      <Select
                        mode="tags"
                        placeholder="自动选择可用编码"
                        options={catalog.data?.codec_groups?.map((value) => ({
                          value,
                          label: value,
                        }))}
                      />
                    </Form.Item>
                    {motionMode === VideoMode.VideoCustom && (
                      <Form.Item
                        name={['selection', 'motion', 'candidate_ids']}
                        label="实况视频候选"
                      >
                        <Select
                          mode="multiple"
                          options={candidates
                            .filter((candidate) => candidate.kind === MediaKind.MediaMotion)
                            .map((candidate) => ({
                              value: candidate.id,
                              label: candidateLabel(candidate),
                            }))}
                        />
                      </Form.Item>
                    )}
                  </>
                ),
              },
            ]
          : []),
        {
          key: 'filters',
          label: '编码、尺寸和帧率筛选',
          children: (
            <>
              <div className="download-config-grid">
                <Form.Item name={['selection', 'video', 'codec_groups']} label="视频编码组 / 编码">
                  <Select
                    mode="tags"
                    options={catalog.data?.codec_groups?.map((value) => ({ value, label: value }))}
                    placeholder="留空包含所有编码"
                  />
                </Form.Item>
                <Form.Item name={['selection', 'video', 'containers']} label="视频容器">
                  <Select mode="tags" placeholder="例如 mp4、webm；留空不限制" />
                </Form.Item>
                <Form.Item name={['selection', 'images', 'formats']} label="图片格式">
                  <Select
                    mode="tags"
                    options={catalog.data?.formats?.map((value) => ({ value, label: value }))}
                    placeholder="留空包含所有格式"
                  />
                </Form.Item>
                <Form.Item name={['selection', 'video', 'hdr']} label="HDR">
                  <Select
                    options={[
                      { value: HDRMode.HDRAny, label: '不限' },
                      { value: HDRMode.HDROnly, label: '仅 HDR' },
                      { value: HDRMode.HDRExclude, label: '排除 HDR' },
                    ]}
                  />
                </Form.Item>
                <Form.Item name={['selection', 'video', 'min_long_edge']} label="最小长边（像素）">
                  <InputNumber min={0} precision={0} style={{ width: '100%' }} />
                </Form.Item>
                <Form.Item
                  name={['selection', 'video', 'max_long_edge']}
                  label="最大长边（0 不限制）"
                >
                  <InputNumber min={0} precision={0} style={{ width: '100%' }} />
                </Form.Item>
                <Form.Item name={['selection', 'video', 'min_fps']} label="最低帧率">
                  <InputNumber min={0} style={{ width: '100%' }} />
                </Form.Item>
                <Form.Item name={['selection', 'video', 'max_fps']} label="最高帧率（0 不限制）">
                  <InputNumber min={0} style={{ width: '100%' }} />
                </Form.Item>
                <Form.Item
                  name={['selection', 'images', 'first_index']}
                  label="第一张图片（0 从头）"
                >
                  <InputNumber min={0} precision={0} style={{ width: '100%' }} />
                </Form.Item>
                <Form.Item
                  name={['selection', 'images', 'last_index']}
                  label="最后一张图片（0 到末尾）"
                >
                  <InputNumber min={0} precision={0} style={{ width: '100%' }} />
                </Form.Item>
              </div>
              <Form.Item
                name={['selection', 'video', 'allow_unknown']}
                valuePropName="checked"
                style={{ marginBottom: 0 }}
              >
                <Checkbox>保留规格信息缺失的视频流</Checkbox>
              </Form.Item>
            </>
          ),
        },
        {
          key: 'naming',
          label: '目录与文件命名',
          children: (
            <>
              <Form.Item
                name={['naming', 'directory_template']}
                label="目录模板"
                extra="需要包含 {note_id}；留空按作者/笔记分目录。"
              >
                <Input placeholder="{author_name}_{author_id}/{note_id}_{title}" />
              </Form.Item>
              <Form.Item
                name={['naming', 'file_template']}
                label="文件模板"
                extra="需要包含 {variant_key}，扩展名自动附加；留空使用默认命名。"
              >
                <Input placeholder="{media_kind}_{image_index}_{codec_group}_{dimensions}_{variant_key}" />
              </Form.Item>
              <Typography.Text type="secondary">
                变量：note_id、title、author_id、author_name、published_date、media_kind、image_index、codec、codec_group、dimensions、fps、variant_key。
              </Typography.Text>
            </>
          ),
        },
      ]}
    />
  );
}
