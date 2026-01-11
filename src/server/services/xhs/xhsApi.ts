/**
 * 直接调用小红书 API 获取笔记详情
 * 基于 xhs-mcp Python 版本的实现
 */
import fs from 'fs';
import path from 'path';
import vm from 'vm';

const XHS_API_BASE = 'https://edith.xiaohongshu.com';
const COOKIES_FILE = path.join(process.env.HOME || '', '.xhs-mcp', 'cookies.json');
// 使用 process.cwd() 获取项目根目录，避免 webpack 打包后 __dirname 路径问题
const XHSVM_FILE = path.join(process.cwd(), 'src/server/services/xhs/xhsvm.js');

let xhsvmContext: vm.Context | null = null;

function loadCookieString(): string {
  try {
    if (!fs.existsSync(COOKIES_FILE)) {
      throw new Error('Cookie file not found: ' + COOKIES_FILE);
    }
    const cookies = JSON.parse(fs.readFileSync(COOKIES_FILE, 'utf-8'));
    return cookies.map((c: any) => `${c.name}=${c.value}`).join('; ');
  } catch (e) {
    console.error('[xhsApi] Failed to load cookies:', e);
    throw e;
  }
}

function getXhsvmContext(): vm.Context {
  if (xhsvmContext) return xhsvmContext;

  const code = fs.readFileSync(XHSVM_FILE, 'utf-8');

  // 创建完整的浏览器环境模拟
  const sandbox: any = {
    global: {} as any,
    console,
    JSON,
    parseInt,
    parseFloat,
    isNaN,
    isFinite,
    Math,
    Date,
    String,
    Number,
    Boolean,
    Array,
    Object,
    RegExp,
    Error,
    TypeError,
    RangeError,
    SyntaxError,
    URIError,
    EvalError,
    ReferenceError,
    encodeURIComponent,
    decodeURIComponent,
    encodeURI,
    decodeURI,
    escape,
    unescape,
    setTimeout: () => 0,
    setInterval: () => 0,
    clearTimeout: () => {},
    clearInterval: () => {},
    Reflect,
    Proxy,
    Symbol,
    Map,
    Set,
    WeakMap,
    WeakSet,
    Promise,
    Uint8Array,
    Int8Array,
    Uint16Array,
    Int16Array,
    Uint32Array,
    Int32Array,
    Float32Array,
    Float64Array,
    ArrayBuffer,
    DataView,
    TextEncoder,
    TextDecoder,
    atob: (str: string) => Buffer.from(str, 'base64').toString('binary'),
    btoa: (str: string) => Buffer.from(str, 'binary').toString('base64'),
  };

  // 设置 global 引用自身
  sandbox.global = sandbox;

  xhsvmContext = vm.createContext(sandbox);

  // 先设置 eval 函数
  (xhsvmContext as any).eval = (code: string) => vm.runInContext(code, xhsvmContext!);

  vm.runInContext(code, xhsvmContext);
  return xhsvmContext;
}

function getXsXt(uri: string, data: any, cookie: string): { 'X-s': string; 'X-t': number } {
  const ctx = getXhsvmContext();
  const result = vm.runInContext(`GetXsXt(${JSON.stringify(uri)}, ${JSON.stringify(data)}, ${JSON.stringify(cookie)})`, ctx);
  return JSON.parse(result);
}

export interface NoteDetail {
  id: string;
  title: string;
  desc: string;
  type: string;
  likeCount: number;
  collectCount: number;
  commentCount: number;
  shareCount: number;
  time: number;
  user: {
    userId: string;
    nickname: string;
    avatar: string;
  };
  imageList: string[];
  raw: any;
}

export async function fetchNoteContentDirect(noteId: string, xsecToken: string): Promise<NoteDetail | null> {
  const cookie = loadCookieString();
  const uri = '/api/sns/web/v1/feed';
  const data = {
    source_note_id: noteId,
    image_formats: ['jpg', 'webp', 'avif'],
    extra: { need_body_topic: '1' },
    xsec_source: 'pc_feed',
    xsec_token: xsecToken,
  };

  const xsxt = getXsXt(uri, data, cookie);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json;charset=UTF-8',
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36',
    'Cookie': cookie,
    'X-s': xsxt['X-s'],
    'X-t': String(xsxt['X-t']),
    'X-s-common': '2UQAPsHCPUIjqArjwjHjNsQhPsHCH0rjNsQhPaHCH0c1PahIHjIj2eHjwjQ+GnPW/MPjNsQhPUHCHdYiqUMIGUM78nHjNsQh+sHCH0c1+0H1PUHVHdWMH0ijP/DAP9L9P/DhPerUJoL72nIM+9Qf8fpC2fHA8n4Fy0m1Gnpd4n+I+BHAPeZIPerMw/GhPjHVHdW9H0il',
  };

  try {
    const response = await fetch(`${XHS_API_BASE}${uri}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      console.error(`[xhsApi] API request failed: ${response.status}`);
      return null;
    }

    const result = await response.json();

    if (result?.data?.items?.[0]?.note_card) {
      const noteCard = result.data.items[0].note_card;
      const interact = noteCard.interact_info || {};
      const user = noteCard.user || {};

      return {
        id: noteId,
        title: noteCard.title || '',
        desc: noteCard.desc || '',
        type: noteCard.type || 'normal',
        likeCount: parseInt(interact.liked_count || '0', 10),
        collectCount: parseInt(interact.collected_count || '0', 10),
        commentCount: parseInt(interact.comment_count || '0', 10),
        shareCount: parseInt(interact.share_count || '0', 10),
        time: noteCard.time || 0,
        user: {
          userId: user.user_id || '',
          nickname: user.nickname || '',
          avatar: user.avatar || '',
        },
        imageList: (noteCard.image_list || []).map((img: any) => img.url_pre || img.url || ''),
        raw: result,
      };
    }

    console.warn('[xhsApi] Unexpected response structure:', JSON.stringify(result).slice(0, 200));
    return null;
  } catch (e) {
    console.error('[xhsApi] Request error:', e);
    return null;
  }
}
