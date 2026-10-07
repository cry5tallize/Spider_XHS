import {
  HDRMode,
  ImageMode,
  LiveMode,
  VideoMode,
  type DownloadConfig,
  type MediaCandidate,
  type PlanPreview,
  MediaKind,
} from '@/shared/contracts';

export function automaticVideo(): DownloadConfig['selection']['video'] {
  return {
    mode: VideoMode.VideoBest,
    candidate_ids: [],
    codec_groups: [],
    containers: [],
    min_long_edge: 0,
    max_long_edge: 0,
    max_short_edge: 0,
    width: 0,
    height: 0,
    min_fps: 0,
    max_fps: 0,
    hdr: HDRMode.HDRAny,
    allow_unknown: true,
  };
}
export function initialDownloadConfig(
  defaults: DownloadConfig,
  supplied?: DownloadConfig,
  force = false,
) {
  const next = structuredClone(supplied || defaults);
  next.selection.video = { ...automaticVideo(), ...next.selection.video };
  next.selection.images.mode ||= ImageMode.ImageBest;
  next.selection.live_photo ||= LiveMode.LiveBoth;
  if (!supplied) {
    next.media.pretty = false;
    next.selection.motion = automaticVideo();
    next.media.live_photo_static = true;
  }
  if (force) next.dedup.force = true;
  return next;
}
export function changeVideo(
  config: DownloadConfig,
  patch: Partial<DownloadConfig['selection']['video']>,
) {
  return {
    ...config,
    selection: {
      ...config.selection,
      motion: config.selection.motion || automaticVideo(),
      video: { ...config.selection.video, ...patch },
    },
  };
}
export function changeLive(config: DownloadConfig, value: LiveMode) {
  return {
    ...config,
    media: {
      ...config.media,
      live_photo_static: value === LiveMode.LiveBoth || value === LiveMode.LiveStatic,
      live_photo_motion: value === LiveMode.LiveBoth || value === LiveMode.LiveMotion,
    },
    selection: {
      ...config.selection,
      live_photo: value,
      motion: config.selection.motion || automaticVideo(),
    },
  };
}
export function candidateCodec(candidate: MediaCandidate) {
  return candidate.representation.codec || candidate.representation.codec_group || '';
}
export function codecLabel(codec: string) {
  return (
    ({ h264: 'H.264', h265: 'H.265 / HEVC', av1: 'AV1', vp9: 'VP9' } as Record<string, string>)[
      codec.toLowerCase()
    ] || codec
  );
}
export function resolutionLabel(width: number, height: number) {
  const edge = Math.min(width, height);
  return (
    ([360, 480, 720, 1080, 1440, 2160].includes(edge) ? edge + 'p · ' : '') + width + ' × ' + height
  );
}
export function isContentFile(file: NonNullable<PlanPreview['files']>[number]) {
  return file.kind !== MediaKind.MediaManifest;
}
