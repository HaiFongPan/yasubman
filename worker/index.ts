import { handleDemoApi } from './demo-api';

/**
 * Cloudflare Workers demo 入口。
 *
 * wrangler.jsonc 里用 run_worker_first 只把 /api/* 交给 Worker，其余请求直接由
 * Static Assets 处理（静态请求不消耗 Worker 调用额度）。
 */

interface Env {
  ASSETS: { fetch: (request: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
      const path = url.pathname.slice('/api'.length) || '/';
      return handleDemoApi(request, path);
    }

    return env.ASSETS.fetch(request);
  },
};
