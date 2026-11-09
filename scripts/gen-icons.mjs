// 生成内置服务目录：从 simple-icons 取品牌图形，缺失的品牌用字母标记。
import { writeFileSync } from 'node:fs';
import * as si from 'simple-icons';

const icon = (key) => si['si' + key];
const pick = (key) => {
  const i = icon(key);
  if (!i) throw new Error(`missing icon: ${key}`);
  return i.path;
};

const entries = [
  // ── AI ──────────────────────────────────────────────
  { name: 'OpenAI', slug: 'openai', category: 'ai', color: '#10A37F', website: 'https://openai.com', brand: 'Openai' },
  { name: 'Anthropic', slug: 'anthropic', category: 'ai', color: '#C96442', website: 'https://anthropic.com', brand: 'Anthropic' },
  { name: 'Google Gemini', slug: 'google-gemini', category: 'ai', color: '#4E7BF7', website: 'https://gemini.google.com', brand: 'Googlegemini' },
  { name: 'Mistral AI', slug: 'mistral-ai', category: 'ai', color: '#FA520F', website: 'https://mistral.ai', brand: 'Mistralai' },
  { name: 'Perplexity', slug: 'perplexity', category: 'ai', color: '#1FB8CD', website: 'https://perplexity.ai', brand: 'Perplexity' },
  { name: 'Hugging Face', slug: 'hugging-face', category: 'ai', color: '#E0A100', website: 'https://huggingface.co', brand: 'Huggingface' },
  { name: 'Cursor', slug: 'cursor', category: 'ai', color: '#5B6CFF', website: 'https://cursor.com', brand: 'Cursor' },
  { name: 'GitHub Copilot', slug: 'github-copilot', category: 'ai', color: '#6B7280', website: 'https://github.com/features/copilot', brand: 'Githubcopilot' },
  { name: 'OpenRouter', slug: 'openrouter', category: 'ai', color: '#64748B', website: 'https://openrouter.ai', brand: 'Openrouter' },
  { name: 'LangChain', slug: 'langchain', category: 'ai', color: '#2F6B57', website: 'https://langchain.com', brand: 'Langchain' },
  { name: 'Replicate', slug: 'replicate', category: 'ai', color: '#6B7280', website: 'https://replicate.com', brand: 'Replicate' },
  { name: 'Suno', slug: 'suno', category: 'ai', color: '#6B7280', website: 'https://suno.com', brand: 'Suno' },
  { name: 'ElevenLabs', slug: 'elevenlabs', category: 'ai', color: '#6B7280', website: 'https://elevenlabs.com', brand: 'Elevenlabs' },
  { name: 'Ollama', slug: 'ollama', category: 'ai', color: '#6B7280', website: 'https://ollama.com', brand: 'Ollama' },
  { name: 'DeepSeek', slug: 'deepseek', category: 'ai', color: '#4D6BFE', website: 'https://deepseek.com', initials: 'DS' },
  { name: 'Groq', slug: 'groq', category: 'ai', color: '#F55036', website: 'https://groq.com', initials: 'Gq' },
  { name: 'Midjourney', slug: 'midjourney', category: 'ai', color: '#6B7280', website: 'https://midjourney.com', initials: 'MJ' },
  { name: 'xAI', slug: 'xai', category: 'ai', color: '#6B7280', website: 'https://x.ai', initials: 'xAI' },

  // ── 云与基础设施 ────────────────────────────────────
  { name: 'Amazon Web Services', slug: 'aws', category: 'cloud', color: '#FF9900', website: 'https://aws.amazon.com', initials: 'aws' },
  { name: 'Microsoft Azure', slug: 'azure', category: 'cloud', color: '#0078D4', website: 'https://azure.microsoft.com', initials: 'Az' },
  { name: 'Google Cloud', slug: 'google-cloud', category: 'cloud', color: '#4285F4', website: 'https://cloud.google.com', brand: 'Googlecloud' },
  { name: 'Cloudflare', slug: 'cloudflare', category: 'cloud', color: '#F38020', website: 'https://cloudflare.com', brand: 'Cloudflare' },
  { name: 'Vercel', slug: 'vercel', category: 'cloud', color: '#6B7280', website: 'https://vercel.com', brand: 'Vercel' },
  { name: 'Netlify', slug: 'netlify', category: 'cloud', color: '#00C7B7', website: 'https://netlify.com', brand: 'Netlify' },
  { name: 'DigitalOcean', slug: 'digitalocean', category: 'cloud', color: '#0080FF', website: 'https://digitalocean.com', brand: 'Digitalocean' },
  { name: 'Hetzner', slug: 'hetzner', category: 'cloud', color: '#D50C2D', website: 'https://hetzner.com', brand: 'Hetzner' },
  { name: 'Railway', slug: 'railway', category: 'cloud', color: '#6B7280', website: 'https://railway.app', brand: 'Railway' },
  { name: 'Render', slug: 'render', category: 'cloud', color: '#46E3B7', website: 'https://render.com', brand: 'Render' },
  { name: 'Fly.io', slug: 'fly-io', category: 'cloud', color: '#6D4AFF', website: 'https://fly.io', brand: 'Flydotio' },
  { name: 'Supabase', slug: 'supabase', category: 'cloud', color: '#3FCF8E', website: 'https://supabase.com', brand: 'Supabase' },
  { name: 'MongoDB Atlas', slug: 'mongodb', category: 'cloud', color: '#47A248', website: 'https://mongodb.com', brand: 'Mongodb' },
  { name: 'PlanetScale', slug: 'planetscale', category: 'cloud', color: '#6B7280', website: 'https://planetscale.com', brand: 'Planetscale' },
  { name: 'Neon', slug: 'neon', category: 'cloud', color: '#00B37E', website: 'https://neon.tech', initials: 'Nn' },
  { name: 'Turso', slug: 'turso', category: 'cloud', color: '#14B8A6', website: 'https://turso.tech', brand: 'Turso' },
  { name: 'Upstash', slug: 'upstash', category: 'cloud', color: '#10B981', website: 'https://upstash.com', brand: 'Upstash' },
  { name: 'Grafana Cloud', slug: 'grafana', category: 'cloud', color: '#F46800', website: 'https://grafana.com', brand: 'Grafana' },
  { name: 'Datadog', slug: 'datadog', category: 'cloud', color: '#632CA6', website: 'https://datadoghq.com', brand: 'Datadog' },
  { name: 'Sentry', slug: 'sentry', category: 'cloud', color: '#4B3A6E', website: 'https://sentry.io', brand: 'Sentry' },
  { name: '阿里云', slug: 'aliyun', category: 'cloud', color: '#FF6A00', website: 'https://aliyun.com', brand: 'Alibabacloud' },
  { name: '腾讯云', slug: 'tencent-cloud', category: 'cloud', color: '#006EFF', website: 'https://cloud.tencent.com', initials: 'TC' },
  { name: '华为云', slug: 'huawei-cloud', category: 'cloud', color: '#CF0A2C', website: 'https://huaweicloud.com', initials: 'HW' },
  { name: 'RackNerd', slug: 'racknerd', category: 'cloud', color: '#FF4D00', website: 'https://racknerd.com', initials: 'RN' },
  { name: 'Namecheap', slug: 'namecheap', category: 'cloud', color: '#DE3723', website: 'https://namecheap.com', brand: 'Namecheap' },

  // ── 影音娱乐 ────────────────────────────────────────
  { name: 'Netflix', slug: 'netflix', category: 'media', color: '#E50914', website: 'https://netflix.com', brand: 'Netflix' },
  { name: 'Spotify', slug: 'spotify', category: 'media', color: '#1DB954', website: 'https://spotify.com', brand: 'Spotify' },
  { name: 'YouTube Premium', slug: 'youtube-premium', category: 'media', color: '#FF0000', website: 'https://youtube.com/premium', brand: 'Youtube' },
  { name: 'Apple Music', slug: 'apple-music', category: 'media', color: '#FA243C', website: 'https://music.apple.com', brand: 'Applemusic' },
  { name: 'Apple TV+', slug: 'apple-tv', category: 'media', color: '#6B7280', website: 'https://tv.apple.com', brand: 'Appletv' },
  { name: 'Disney+', slug: 'disney-plus', category: 'media', color: '#113CCF', website: 'https://disneyplus.com', initials: 'D+' },
  { name: 'Prime Video', slug: 'prime-video', category: 'media', color: '#00A8E1', website: 'https://primevideo.com', initials: 'PV' },
  { name: 'Max', slug: 'max', category: 'media', color: '#525252', website: 'https://max.com', brand: 'Max' },
  { name: '哔哩哔哩', slug: 'bilibili', category: 'media', color: '#00A1D6', website: 'https://bilibili.com', brand: 'Bilibili' },
  { name: '爱奇艺', slug: 'iqiyi', category: 'media', color: '#00BE06', website: 'https://iqiyi.com', initials: 'iQ' },
  { name: '网易云音乐', slug: 'netease-music', category: 'media', color: '#D43C33', website: 'https://music.163.com', brand: 'Neteasecloudmusic' },
  { name: 'Audible', slug: 'audible', category: 'media', color: '#F8991C', website: 'https://audible.com', brand: 'Audible' },
  { name: 'Substack', slug: 'substack', category: 'media', color: '#FF6719', website: 'https://substack.com', brand: 'Substack' },
  { name: 'Medium', slug: 'medium', category: 'media', color: '#6B7280', website: 'https://medium.com', brand: 'Medium' },

  // ── 效率工具 ────────────────────────────────────────
  { name: 'Notion', slug: 'notion', category: 'productivity', color: '#6B7280', website: 'https://notion.so', brand: 'Notion' },
  { name: 'Figma', slug: 'figma', category: 'productivity', color: '#F24E1E', website: 'https://figma.com', brand: 'Figma' },
  { name: 'Slack', slug: 'slack', category: 'productivity', color: '#4A154B', website: 'https://slack.com', brand: 'Slack' },
  { name: 'Linear', slug: 'linear', category: 'productivity', color: '#5E6AD2', website: 'https://linear.app', brand: 'Linear' },
  { name: '1Password', slug: '1password', category: 'productivity', color: '#3B66BC', website: 'https://1password.com', brand: '1password' },
  { name: 'Dropbox', slug: 'dropbox', category: 'productivity', color: '#0061FF', website: 'https://dropbox.com', brand: 'Dropbox' },
  { name: 'Setapp', slug: 'setapp', category: 'productivity', color: '#C9A227', website: 'https://setapp.com', brand: 'Setapp' },
  { name: 'Obsidian', slug: 'obsidian', category: 'productivity', color: '#7C3AED', website: 'https://obsidian.md', brand: 'Obsidian' },
  { name: 'Todoist', slug: 'todoist', category: 'productivity', color: '#E44332', website: 'https://todoist.com', brand: 'Todoist' },
  { name: 'Evernote', slug: 'evernote', category: 'productivity', color: '#00A82D', website: 'https://evernote.com', brand: 'Evernote' },
  { name: 'Raycast', slug: 'raycast', category: 'productivity', color: '#FF6363', website: 'https://raycast.com', brand: 'Raycast' },
  { name: 'Adobe Creative Cloud', slug: 'adobe-cc', category: 'productivity', color: '#DA1F26', website: 'https://adobe.com', initials: 'Cc' },
  { name: 'Canva', slug: 'canva', category: 'productivity', color: '#00C4CC', website: 'https://canva.com', brand: 'Canva' },
  { name: 'Miro', slug: 'miro', category: 'productivity', color: '#4262FF', website: 'https://miro.com', brand: 'Miro' },
  { name: 'Airtable', slug: 'airtable', category: 'productivity', color: '#18BFFF', website: 'https://airtable.com', brand: 'Airtable' },
  { name: 'ClickUp', slug: 'clickup', category: 'productivity', color: '#7B68EE', website: 'https://clickup.com', brand: 'Clickup' },
  { name: 'Asana', slug: 'asana', category: 'productivity', color: '#F06A6A', website: 'https://asana.com', brand: 'Asana' },
  { name: 'Trello', slug: 'trello', category: 'productivity', color: '#0052CC', website: 'https://trello.com', brand: 'Trello' },
  { name: 'Loom', slug: 'loom', category: 'productivity', color: '#625DF5', website: 'https://loom.com', brand: 'Loom' },
  { name: 'Grammarly', slug: 'grammarly', category: 'productivity', color: '#027E6F', website: 'https://grammarly.com', brand: 'Grammarly' },
  { name: 'DeepL', slug: 'deepl', category: 'productivity', color: '#0F4C81', website: 'https://deepl.com', brand: 'Deepl' },
  { name: 'Framer', slug: 'framer', category: 'productivity', color: '#0055FF', website: 'https://framer.com', brand: 'Framer' },

  // ── 开发者工具 ──────────────────────────────────────
  { name: 'GitHub', slug: 'github', category: 'dev', color: '#6B7280', website: 'https://github.com', brand: 'Github' },
  { name: 'GitLab', slug: 'gitlab', category: 'dev', color: '#FC6D26', website: 'https://gitlab.com', brand: 'Gitlab' },
  { name: 'Docker', slug: 'docker', category: 'dev', color: '#2496ED', website: 'https://docker.com', brand: 'Docker' },
  { name: 'npm', slug: 'npm', category: 'dev', color: '#CB3837', website: 'https://npmjs.com', brand: 'Npm' },
  { name: 'JetBrains', slug: 'jetbrains', category: 'dev', color: '#E35E37', website: 'https://jetbrains.com', brand: 'Jetbrains' },
  { name: 'Postman', slug: 'postman', category: 'dev', color: '#FF6C37', website: 'https://postman.com', brand: 'Postman' },
  { name: 'Zed', slug: 'zed', category: 'dev', color: '#084CCF', website: 'https://zed.dev', brand: 'Zedindustries' },
  { name: 'Warp', slug: 'warp', category: 'dev', color: '#01A4FF', website: 'https://warp.dev', brand: 'Warp' },

  // ── 其他 ────────────────────────────────────────────
  { name: 'Apple iCloud+', slug: 'icloud', category: 'other', color: '#3693F3', website: 'https://icloud.com', brand: 'Icloud' },
  { name: 'Apple', slug: 'apple', category: 'other', color: '#6B7280', website: 'https://apple.com', brand: 'Apple' },
  { name: '微信', slug: 'wechat', category: 'other', color: '#07C160', website: 'https://weixin.qq.com', brand: 'Wechat' },
  { name: '百度网盘', slug: 'baidu-netdisk', category: 'other', color: '#2932E1', website: 'https://pan.baidu.com', brand: 'Baidu' },
];

const out = entries.map((e) => {
  const base = {
    name: e.name,
    slug: e.slug,
    category: e.category,
    color: e.color,
    website: e.website,
  };
  if (e.brand) {
    return { ...base, iconKind: 'brand', iconData: pick(e.brand) };
  }
  return { ...base, iconKind: 'initials', iconData: e.initials };
});

const file = `// 由 scripts/gen-icons.mjs 生成，请勿手改。品牌图形来自 simple-icons（CC0）。
import type { CategoryId, IconKind } from '../shared/types';

export interface CatalogSeed {
  name: string;
  slug: string;
  category: CategoryId;
  iconKind: IconKind;
  iconData: string;
  color: string;
  website: string;
}

export const CATALOG_SEED: CatalogSeed[] = ${JSON.stringify(out, null, 2)};
`;

writeFileSync(new URL('../server/catalog-seed.ts', import.meta.url), file);
console.log(`catalog seed written: ${out.length} entries`);
