import { Checkbox, Select } from 'antd';
import {
  LiveMode,
  MediaKind,
  VideoMode,
  type DownloadConfig,
  type CandidateCatalog,
} from '@/shared/contracts';
import { changeLive, changeVideo, candidateCodec, codecLabel, resolutionLabel } from './selection';

export type MediaHints = { images: boolean; videos: boolean; covers: boolean; live: boolean };
export function DownloadOptions({
  config,
  onChange,
  catalog,
  batch,
  hints,
  disabled,
}: {
  config: DownloadConfig;
  onChange: (config: DownloadConfig) => void;
  catalog?: CandidateCatalog;
  batch: boolean;
  hints?: MediaHints;
  disabled?: boolean;
}) {
  const main = (catalog?.candidates || []).filter((c) => c.kind === MediaKind.MediaVideo);
  const images = (catalog?.candidates || []).filter(
    (c) => c.kind === MediaKind.MediaImage && !c.live_photo,
  );
  const presence =
    hints ||
    (batch
      ? { images: true, videos: true, live: true, covers: true }
      : {
          videos: main.length > 0,
          images: catalog?.note_type !== 'video' && images.length > 0,
          covers: catalog?.note_type === 'video' && images.length > 0,
          live: (catalog?.candidates || []).some((c) => c.live_photo),
        });
  const video = config.selection.video;
  const codecs = batch
    ? ['h264', 'h265', 'av1', 'vp9']
    : [...new Set(main.map(candidateCodec).filter(Boolean))];
  const selectedCodec =
    video.codec_groups?.length === 1
      ? video.codec_groups[0]
      : video.codec_groups?.length
        ? 'advanced'
        : '';
  const resolutions = new Map<string, { width: number; height: number; disabled: boolean }>();
  for (const candidate of main) {
    const { width, height } = candidate.representation;
    if (!width || !height) continue;
    const key = width + ':' + height;
    const matches =
      !selectedCodec ||
      candidateCodec(candidate) === selectedCodec ||
      candidate.representation.codec_group === selectedCodec;
    const old = resolutions.get(key);
    resolutions.set(key, { width, height, disabled: old ? old.disabled && !matches : !matches });
  }
  const quality =
    video.mode !== VideoMode.VideoBest && video.mode !== VideoMode.VideoDefault
      ? 'advanced'
      : video.width && video.height
        ? video.width + ':' + video.height
        : video.max_short_edge
          ? 'cap:' + video.max_short_edge
          : '';
  const qualityOptions = [
    { value: '', label: '自动最佳' },
    ...(batch
      ? [2160, 1080, 720, 480].map((edge) => ({
          value: 'cap:' + edge,
          label: '不超过 ' + edge + 'p',
        }))
      : [...resolutions].map(([value, r]) => ({
          value,
          label: resolutionLabel(r.width, r.height),
          disabled: r.disabled,
        }))),
    ...(!batch && quality.startsWith('cap:')
      ? [{ value: quality, label: '不超过 ' + video.max_short_edge + 'p' }]
      : []),
    ...(quality === 'advanced'
      ? [{ value: 'advanced', label: '自定义规格（高级）', disabled: true }]
      : []),
  ];
  const updateMedia = (key: keyof DownloadConfig['media'], checked: boolean) =>
    onChange({ ...config, media: { ...config.media, [key]: checked } });
  return (
    <div className="download-simple-options">
      <div className="download-option-label">保存内容</div>
      <div className="download-content-checks">
        {presence.images && (
          <Checkbox
            disabled={disabled}
            checked={config.media.images}
            onChange={(e) => updateMedia('images', e.target.checked)}
          >
            普通图片
          </Checkbox>
        )}
        {presence.videos && (
          <Checkbox
            disabled={disabled}
            checked={config.media.video}
            onChange={(e) => updateMedia('video', e.target.checked)}
          >
            视频
          </Checkbox>
        )}
        {presence.covers && (
          <Checkbox
            disabled={disabled}
            checked={config.media.video_cover}
            onChange={(e) => updateMedia('video_cover', e.target.checked)}
          >
            视频封面
          </Checkbox>
        )}
        <Checkbox
          disabled={disabled}
          checked={config.media.text}
          onChange={(e) => updateMedia('text', e.target.checked)}
        >
          笔记正文
        </Checkbox>
      </div>
      {presence.videos && config.media.video && (
        <div className="download-simple-fields">
          <label>
            视频清晰度
            <Select
              aria-label="视频清晰度"
              value={quality}
              disabled={disabled}
              options={qualityOptions}
              onChange={(value) => {
                const [width, height] =
                  value.includes(':') && !value.startsWith('cap:')
                    ? value.split(':').map(Number)
                    : [0, 0];
                onChange(
                  changeVideo(config, {
                    mode: VideoMode.VideoBest,
                    candidate_ids: [],
                    width,
                    height,
                    max_short_edge: value.startsWith('cap:') ? Number(value.slice(4)) : 0,
                    min_long_edge: 0,
                    max_long_edge: 0,
                    allow_unknown: !value,
                  }),
                );
              }}
            />
          </label>
          <label>
            视频编码
            <Select
              aria-label="视频编码"
              value={selectedCodec}
              disabled={disabled}
              options={[
                { value: '', label: '自动推荐' },
                ...codecs.map((value) => ({
                  value,
                  label: codecLabel(value),
                  disabled:
                    !batch &&
                    !!video.width &&
                    !main.some(
                      (c) =>
                        candidateCodec(c) === value &&
                        c.representation.width === video.width &&
                        c.representation.height === video.height,
                    ),
                })),
                ...(selectedCodec === 'advanced'
                  ? [{ value: 'advanced', label: '多编码（高级）', disabled: true }]
                  : []),
              ]}
              onChange={(value) =>
                onChange(
                  changeVideo(config, {
                    mode: VideoMode.VideoBest,
                    candidate_ids: [],
                    codec_groups: value ? [value] : [],
                  }),
                )
              }
            />
          </label>
        </div>
      )}
      {presence.live && (
        <label className="download-live-field">
          LivePhoto
          <Select
            aria-label="LivePhoto 保存方式"
            disabled={disabled}
            value={config.selection.live_photo || LiveMode.LiveBoth}
            onChange={(value) => onChange(changeLive(config, value))}
            options={[
              { value: LiveMode.LiveBoth, label: '照片＋动态视频' },
              { value: LiveMode.LiveStatic, label: '只保存照片' },
              { value: LiveMode.LiveExclude, label: '跳过实况内容' },
              ...(config.selection.live_photo === LiveMode.LiveMotion
                ? [{ value: LiveMode.LiveMotion, label: '仅动态视频（高级）' }]
                : []),
            ]}
          />
          <small>照片与动态视频分别保存；实况规格独立于主视频。</small>
        </label>
      )}
      {!presence.images && !presence.videos && !presence.live && !batch && (
        <p className="workspace-muted">没有可用媒体，可保存正文或在更多选项中选择附加文件。</p>
      )}
    </div>
  );
}
