import { useState } from 'react';
import { Alert, App, Button, Collapse, Image, Skeleton, Tag, Typography } from 'antd';
import { ArrowLeftOutlined, ExportOutlined, PlayCircleOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { getSnapshot } from '@/features/notes/api';
import { UserAvatar } from '@/shared/components/UserAvatar';
import { openAuthorProfile } from '@/shared/bridge';
import { formatTime } from '@/features/notes/labels';

export function NotePreview({ snapshotID, onBack }: { snapshotID: string; onBack?: () => void }) {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const [playing, setPlaying] = useState(false);
  const [playingMotion, setPlayingMotion] = useState<number>();
  const query = useQuery({
    queryKey: ['parse-preview', snapshotID],
    queryFn: ({ signal }) => getSnapshot(snapshotID, signal),
    staleTime: Infinity,
  });
  if (query.isPending)
    return (
      <section className="parse-note-preview">
        <Skeleton active paragraph={{ rows: 6 }} />
      </section>
    );
  if (query.isError)
    return (
      <Alert
        type="error"
        title="笔记预览加载失败"
        description={query.error.message}
        action={<Button onClick={() => void query.refetch()}>重试</Button>}
      />
    );
  const { note, snapshot } = query.data;
  const images = (note.images || []).filter((image) =>
    image.variants?.some((variant) => variant.url),
  );
  const video = note.video?.streams?.find((stream) => stream.url || stream.master_url);
  const cover = images[0]?.variants?.find((variant) => variant.url)?.url;
  const hasProfile = /^[a-f\d]{24}$/i.test(note.user.id);
  const showAuthor = () => {
    void openAuthorProfile(note.user.id).catch((error) => message.error(error.message));
  };
  return (
    <article className="parse-note-preview">
      <div className="parse-preview-top">
        {onBack && (
          <Button type="text" icon={<ArrowLeftOutlined />} onClick={onBack}>
            返回结果
          </Button>
        )}
        <Button
          type="text"
          size="small"
          onClick={() => void navigate('/notes/' + note.id + '?snapshot=' + snapshot.id)}
        >
          完整详情 <ExportOutlined />
        </Button>
      </div>
      <h2>{note.title || '无标题笔记'}</h2>
      <div className="parse-author">
        <button
          type="button"
          className="author-avatar-link"
          aria-label="打开作者主页"
          disabled={!hasProfile}
          onClick={showAuthor}
        >
          <UserAvatar
            url={note.user.avatar_url}
            name={note.user.nickname || '未知作者'}
            size={42}
          />
        </button>
        <div>
          <button
            type="button"
            className="author-name-link"
            disabled={!hasProfile}
            onClick={showAuthor}
          >
            {note.user.nickname || '未知作者'}
          </button>
          {note.user.id && (
            <Typography.Text
              className="parse-author-id"
              type="secondary"
              copyable={{ text: note.user.id }}
            >
              用户 ID · {note.user.id}
            </Typography.Text>
          )}
        </div>
        {/^[a-f\d]{24}$/i.test(note.user.id) && (
          <Button type="text" size="small" icon={<ExportOutlined />} onClick={showAuthor}>
            作者主页
          </Button>
        )}
      </div>
      <div className="parse-note-meta">
        <span>{formatTime(note.created_at_ms)}</span>
        {note.has_live_photo && <Tag>LivePhoto</Tag>}
      </div>
      {note.description && (
        <Typography.Paragraph
          className="parse-note-description"
          ellipsis={{
            rows: 3,
            expandable: 'collapsible',
            symbol: (expanded) => (expanded ? '收起' : '展开正文'),
          }}
        >
          {note.description}
        </Typography.Paragraph>
      )}
      {video && (
        <div className="parse-video-preview">
          {playing ? (
            <video
              controls
              autoPlay
              preload="metadata"
              poster={cover}
              src={video.url || video.master_url}
              onError={() => {
                setPlaying(false);
                void message.warning('此视频无法在内置播放器播放，可下载后查看');
              }}
            />
          ) : (
            <button type="button" onClick={() => setPlaying(true)} aria-label="播放笔记视频">
              {cover && (
                <img src={cover} alt="视频封面" loading="lazy" referrerPolicy="no-referrer" />
              )}
              <span>
                <PlayCircleOutlined />
                播放视频
              </span>
            </button>
          )}
        </div>
      )}
      {!!images.length && (
        <Image.PreviewGroup>
          <div className="parse-image-gallery">
            {images.map((image) => {
              const variant = image.variants?.find((variant) => variant.url);
              const motion = image.motion_streams?.find(
                (stream) => stream.url || stream.master_url,
              );
              return (
                <div className="parse-gallery-image" key={image.index}>
                  <Image
                    src={variant?.url}
                    alt={'笔记图片 ' + (image.index + 1)}
                    loading="lazy"
                    referrerPolicy="no-referrer"
                  />
                  {motion && (
                    <Button
                      className="parse-motion-button"
                      size="small"
                      icon={<PlayCircleOutlined />}
                      onClick={() =>
                        setPlayingMotion(playingMotion === image.index ? undefined : image.index)
                      }
                    >
                      实况
                    </Button>
                  )}
                  {motion && playingMotion === image.index && (
                    <video
                      controls
                      autoPlay
                      preload="metadata"
                      src={motion.url || motion.master_url}
                      onError={() => {
                        setPlayingMotion(undefined);
                        void message.warning('此实况无法在内置播放器播放，可下载后查看');
                      }}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </Image.PreviewGroup>
      )}
      {!!snapshot.warnings?.length && (
        <Collapse
          ghost
          items={[
            {
              key: 'warnings',
              label: '解析信息（' + snapshot.warnings.length + '）',
              children: (
                <div className="workspace-muted">
                  {snapshot.warnings.map((warning, index) => (
                    <p key={index}>{warning}</p>
                  ))}
                </div>
              ),
            },
          ]}
        />
      )}
    </article>
  );
}
