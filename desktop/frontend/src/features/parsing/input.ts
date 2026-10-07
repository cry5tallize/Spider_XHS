import { CollectionMode } from '@/shared/contracts';

export function inspectInput(text: string, mode: CollectionMode) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const urls = text.match(/https?:\/\/[^\s<>“”「」()（）]+/g) || [];
  const ids = lines.filter((line) => /^[a-f\d]{24}$/i.test(line));
  const values = urls.length
    ? [...urls.map((url) => url.replace(/[，。；;!！,.]+$/, '')), ...ids]
    : lines;
  let profiles = 0,
    notes = 0,
    invalid = 0;
  for (const value of values) {
    if (/^[a-f\d]{24}$/i.test(value)) continue;
    try {
      const url = new URL(value);
      if (
        url.username ||
        url.password ||
        !['http:', 'https:'].includes(url.protocol) ||
        !(
          url.hostname === 'xiaohongshu.com' ||
          url.hostname.endsWith('.xiaohongshu.com') ||
          ['xhslink.com', 'xhslink.cn'].includes(url.hostname)
        )
      ) {
        invalid++;
        continue;
      }
      if (url.pathname.includes('/user/profile/')) profiles++;
      else if (url.pathname.includes('/explore/') || url.pathname.includes('/discovery/item/'))
        notes++;
    } catch {
      invalid++;
    }
  }
  const mismatch =
    (profiles > 0 && mode === CollectionMode.ModeNotes) ||
    (notes > 0 && mode === CollectionMode.ModeUsers);
  return {
    values,
    count: values.length,
    invalid,
    mismatch,
    mixed: profiles > 0 && notes > 0,
    tooMany: values.length > 1000,
    canonical: values.join('\n'),
  };
}
