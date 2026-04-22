type AnyRecord = Record<string, any>

export type StandardArchive<T> = {
  source: string
  success: boolean
  msg: string
  fetchedAt: string
  rawText: string
  rawJson: Record<string, unknown> | null
  normalized: T | null
}

export type StandardUser = {
  userId: string
  homeUrl: string
  nickname: string
  avatar: string
  redId: string
  gender: string
  ipLocation: string
  desc: string
  follows: number
  fans: number
  interaction: number
  tags: string[]
}

export type StandardNote = {
  noteId: string
  noteUrl: string
  noteType: '图集' | '视频' | '未知'
  userId: string
  homeUrl: string
  nickname: string
  avatar: string
  title: string
  desc: string
  likedCount: number
  collectedCount: number
  commentCount: number
  shareCount: number
  videoCover: string | null
  videoAddr: string | null
  videoStreams: StandardVideoStream[]
  imageList: string[]
  tags: string[]
  uploadTime: string
  ipLocation: string
}

export type StandardVideoStream = {
  codec: string
  streamType: number
  streamDesc: string
  qualityType: string
  format: string
  videoCodec: string
  audioCodec: string
  width: number
  height: number
  fps: number
  size: number
  videoBitrate: number
  audioBitrate: number
  avgBitrate: number
  duration: number
  videoDuration: number
  audioDuration: number
  defaultStream: boolean
  hdrType: number
  rotate: number
  weight: number
  masterUrl: string
  backupUrls: string[]
}

export type StandardComment = {
  noteId: string
  noteUrl: string
  commentId: string
  userId: string
  homeUrl: string
  nickname: string
  avatar: string
  content: string
  showTags: unknown[]
  likeCount: number
  uploadTime: string
  ipLocation: string
  pictures: string[]
  subComments: unknown[]
}

export type StandardSearchNotes = {
  noteList: StandardNote[]
  pageResponses: StandardArchive<unknown>[]
}

export type StandardSearchUsers = {
  userList: StandardUser[]
  pageResponses: StandardArchive<unknown>[]
}

function isObject(value: unknown): value is AnyRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function asRecord(value: unknown): AnyRecord {
  return isObject(value) ? value : {}
}

function toStringValue(value: unknown, fallback = '') {
  if (value === null || value === undefined) {
    return fallback
  }
  return String(value)
}

function toNumberValue(value: unknown, fallback = 0) {
  const num = Number(value)
  return Number.isFinite(num) ? num : fallback
}

function toStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map((item) => toStringValue(item, ''))
    .filter((item) => item !== '')
}

function timestampToString(timestamp: unknown) {
  const raw = toNumberValue(timestamp, 0)
  if (!raw) {
    return ''
  }

  const normalized = raw < 1e12 ? raw * 1000 : raw
  return new Date(normalized).toLocaleString('zh-CN', { hour12: false })
}

function extractImageUrl(image: AnyRecord) {
  const infoList = Array.isArray(image.info_list) ? image.info_list : []
  const target = infoList[1] ?? infoList[0] ?? {}
  return toStringValue(target.url, '')
}

function extractVideoAddr(video: AnyRecord) {
  const streams = extractVideoStreams(video)
  if (streams.length > 0) {
    return streams[0].masterUrl || null
  }

  const originKey = video?.consumer?.origin_video_key
  if (originKey) {
    return `https://sns-video-bd.xhscdn.com/${originKey}`
  }

  return null
}

function extractVideoStreams(video: AnyRecord) {
  const streamGroups = asRecord(video?.media?.stream)
  const entries = Object.entries(streamGroups)
  const streams = entries.flatMap(([codec, value]) => {
    if (!Array.isArray(value)) {
      return []
    }

    return value.map((item) => {
      const stream = asRecord(item)
      return {
        codec,
        streamType: toNumberValue(stream.stream_type, 0),
        streamDesc: toStringValue(stream.stream_desc, ''),
        qualityType: toStringValue(stream.quality_type, ''),
        format: toStringValue(stream.format, ''),
        videoCodec: toStringValue(stream.video_codec, codec),
        audioCodec: toStringValue(stream.audio_codec, ''),
        width: toNumberValue(stream.width, 0),
        height: toNumberValue(stream.height, 0),
        fps: toNumberValue(stream.fps, 0),
        size: toNumberValue(stream.size, 0),
        videoBitrate: toNumberValue(stream.video_bitrate, 0),
        audioBitrate: toNumberValue(stream.audio_bitrate, 0),
        avgBitrate: toNumberValue(stream.avg_bitrate, 0),
        duration: toNumberValue(stream.duration, 0),
        videoDuration: toNumberValue(stream.video_duration, 0),
        audioDuration: toNumberValue(stream.audio_duration, 0),
        defaultStream: Boolean(stream.default_stream),
        hdrType: toNumberValue(stream.hdr_type, 0),
        rotate: toNumberValue(stream.rotate, 0),
        weight: toNumberValue(stream.weight, 0),
        masterUrl: toStringValue(stream.master_url || stream.url, ''),
        backupUrls: Array.isArray(stream.backup_urls) ? stream.backup_urls.map((url) => toStringValue(url, '')).filter(Boolean) : [],
      }
    })
  }) as StandardVideoStream[]

  return streams
    .filter((stream) => stream.masterUrl)
    .sort((left, right) => {
      if (left.defaultStream !== right.defaultStream) return left.defaultStream ? -1 : 1
      if (right.height !== left.height) return right.height - left.height
      if (right.width !== left.width) return right.width - left.width
      return right.avgBitrate - left.avgBitrate
    })
}

export function standardizeUser(raw: unknown, userId = ''): StandardArchive<StandardUser> {
  const data = asRecord(raw)
  const basicInfo = asRecord(data.basic_info ?? data.basicInfo ?? data.user_info ?? data.userInfo)
  const interactions = Array.isArray(data.interactions) ? data.interactions : []
  const tags = Array.isArray(data.tags) ? data.tags.map((tag) => toStringValue(asRecord(tag).name, '')).filter(Boolean) : []

  const normalized: StandardUser = {
    userId: toStringValue(userId || basicInfo.user_id || data.user_id, ''),
    homeUrl: `https://www.xiaohongshu.com/user/profile/${toStringValue(userId || basicInfo.user_id || data.user_id, '')}`,
    nickname: toStringValue(basicInfo.nickname, ''),
    avatar: toStringValue(basicInfo.imageb || basicInfo.image || '', ''),
    redId: toStringValue(basicInfo.red_id, ''),
    gender: (() => {
      const gender = toNumberValue(basicInfo.gender, -1)
      if (gender === 0) return '男'
      if (gender === 1) return '女'
      return '未知'
    })(),
    ipLocation: toStringValue(basicInfo.ip_location, '未知'),
    desc: toStringValue(basicInfo.desc, ''),
    follows: toNumberValue(asRecord(interactions[0]).count, 0),
    fans: toNumberValue(asRecord(interactions[1]).count, 0),
    interaction: toNumberValue(asRecord(interactions[2]).count, 0),
    tags,
  }

  return {
    source: 'user',
    success: true,
    msg: 'success',
    fetchedAt: new Date().toISOString(),
    rawText: JSON.stringify(raw),
    rawJson: isObject(raw) ? (raw as Record<string, unknown>) : null,
    normalized,
  }
}

export function standardizeNote(raw: unknown): StandardArchive<StandardNote> {
  const data = asRecord(raw)
  const noteCard = asRecord(data.note_card ?? data.noteCard ?? (Array.isArray(data.items) ? asRecord(data.items[0]).note_card : {}))
  const user = asRecord(noteCard.user)
  const imageList = Array.isArray(noteCard.image_list) ? noteCard.image_list.map((image) => extractImageUrl(asRecord(image))).filter(Boolean) : []
  const tags = Array.isArray(noteCard.tag_list) ? noteCard.tag_list.map((tag) => toStringValue(asRecord(tag).name, '')).filter(Boolean) : []
  const noteType = noteCard.type === 'normal' ? '图集' : noteCard.type === 'video' ? '视频' : '未知'
  const video = asRecord(noteCard.video)
  const videoStreams = noteType === '视频' ? extractVideoStreams(video) : []
  const normalized: StandardNote = {
    noteId: toStringValue(data.id || noteCard.note_id || noteCard.id, ''),
    noteUrl: toStringValue(data.url || noteCard.url || '', ''),
    noteType,
    userId: toStringValue(user.user_id, ''),
    homeUrl: `https://www.xiaohongshu.com/user/profile/${toStringValue(user.user_id, '')}`,
    nickname: toStringValue(user.nickname, ''),
    avatar: toStringValue(user.avatar, ''),
    title: (() => {
      const title = toStringValue(noteCard.title, '').trim()
      return title || '无标题'
    })(),
    desc: toStringValue(noteCard.desc, ''),
    likedCount: toNumberValue(asRecord(noteCard.interact_info).liked_count, 0),
    collectedCount: toNumberValue(asRecord(noteCard.interact_info).collected_count, 0),
    commentCount: toNumberValue(asRecord(noteCard.interact_info).comment_count, 0),
    shareCount: toNumberValue(asRecord(noteCard.interact_info).share_count, 0),
    videoCover: noteType === '视频' ? (imageList[0] ?? null) : null,
    videoAddr: noteType === '视频' ? (videoStreams[0]?.masterUrl ?? extractVideoAddr(video)) : null,
    videoStreams,
    imageList,
    tags,
    uploadTime: timestampToString(noteCard.time),
    ipLocation: toStringValue(noteCard.ip_location, '未知'),
  }

  return {
    source: 'note',
    success: true,
    msg: 'success',
    fetchedAt: new Date().toISOString(),
    rawText: JSON.stringify(raw),
    rawJson: isObject(raw) ? (raw as Record<string, unknown>) : null,
    normalized,
  }
}

export function standardizeComment(raw: unknown): StandardArchive<StandardComment> {
  const data = asRecord(raw)
  const userInfo = asRecord(data.user_info ?? data.userInfo)
  const pictures = Array.isArray(data.pictures) ? data.pictures.map((picture) => extractImageUrl(asRecord(picture))).filter(Boolean) : []
  const normalized: StandardComment = {
    noteId: toStringValue(data.note_id, ''),
    noteUrl: toStringValue(data.note_url, ''),
    commentId: toStringValue(data.id, ''),
    userId: toStringValue(userInfo.user_id, ''),
    homeUrl: `https://www.xiaohongshu.com/user/profile/${toStringValue(userInfo.user_id, '')}`,
    nickname: toStringValue(userInfo.nickname, ''),
    avatar: toStringValue(userInfo.image, ''),
    content: toStringValue(data.content, ''),
    showTags: Array.isArray(data.show_tags) ? data.show_tags : [],
    likeCount: toNumberValue(data.like_count, 0),
    uploadTime: timestampToString(data.create_time),
    ipLocation: toStringValue(data.ip_location, '未知'),
    pictures,
    subComments: Array.isArray(data.sub_comments) ? data.sub_comments : [],
  }

  return {
    source: 'comment',
    success: true,
    msg: 'success',
    fetchedAt: new Date().toISOString(),
    rawText: JSON.stringify(raw),
    rawJson: isObject(raw) ? (raw as Record<string, unknown>) : null,
    normalized,
  }
}

export function standardizeSearchNotes(items: unknown[]): StandardArchive<StandardSearchNotes> {
  const noteList = items.map((item) => standardizeNote(item).normalized).filter(Boolean) as StandardNote[]
  const normalized: StandardSearchNotes = {
    noteList,
    pageResponses: [],
  }

  return {
    source: 'search-notes',
    success: true,
    msg: 'success',
    fetchedAt: new Date().toISOString(),
    rawText: JSON.stringify(items),
    rawJson: null,
    normalized,
  }
}

export function standardizeSearchUsers(items: unknown[]): StandardArchive<StandardSearchUsers> {
  const userList = items.map((item) => standardizeUser(item).normalized).filter(Boolean) as StandardUser[]
  const normalized: StandardSearchUsers = {
    userList,
    pageResponses: [],
  }

  return {
    source: 'search-users',
    success: true,
    msg: 'success',
    fetchedAt: new Date().toISOString(),
    rawText: JSON.stringify(items),
    rawJson: null,
    normalized,
  }
}

export function buildFallbackArchive<T>(source: string, msg: string, raw: unknown): StandardArchive<T> {
  return {
    source,
    success: false,
    msg,
    fetchedAt: new Date().toISOString(),
    rawText: typeof raw === 'string' ? raw : JSON.stringify(raw),
    rawJson: isObject(raw) ? (raw as Record<string, unknown>) : null,
    normalized: null,
  }
}
