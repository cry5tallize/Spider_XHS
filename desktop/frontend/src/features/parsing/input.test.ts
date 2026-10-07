import { describe, expect, it } from 'vitest';
import { CollectionMode } from '@/shared/contracts';
import { inspectInput } from './input';

describe('shared input inspection', () => {
  it('extracts links from shared text and preserves signing parameters', () => {
    const input = inspectInput(
      '分享标题\nhttps://www.xiaohongshu.com/explore/aaaaaaaaaaaaaaaaaaaaaaaa?xsec_token=a%2Bb&xsec_source=pc_user。\n复制打开',
      CollectionMode.ModeNotes,
    );
    expect(input.canonical).toBe(
      'https://www.xiaohongshu.com/explore/aaaaaaaaaaaaaaaaaaaaaaaa?xsec_token=a%2Bb&xsec_source=pc_user',
    );
    expect(input.invalid).toBe(0);
  });
  it('reports mixed profiles and notes before submitting', () => {
    const input = inspectInput(
      'https://www.xiaohongshu.com/user/profile/bbbbbbbbbbbbbbbbbbbbbbbb\nhttps://www.xiaohongshu.com/explore/aaaaaaaaaaaaaaaaaaaaaaaa',
      CollectionMode.ModeNotes,
    );
    expect(input.mixed).toBe(true);
    expect(input.mismatch).toBe(true);
  });
  it('rejects foreign and credential-bearing URLs while allowing supported short links', () => {
    expect(inspectInput('https://evil.example/explore/123', CollectionMode.ModeNotes).invalid).toBe(
      1,
    );
    expect(
      inspectInput('https://password@www.xiaohongshu.com/explore/123', CollectionMode.ModeNotes)
        .invalid,
    ).toBe(1);
    expect(inspectInput('https://xhslink.com/a/test', CollectionMode.ModeNotes).invalid).toBe(0);
  });
});
