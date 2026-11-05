/**
 * Host half of the balance display plugin.
 *
 * Serves GET /api/balance-display.details for the Client half. The route reads
 * this month's spending and the recharge history from DeepSeek Platform with
 * the signed-in account's grant, so the token never leaves the Host process.
 *
 * The Platform endpoints used here are the ones the Platform web app calls.
 * They are undocumented and may change; every section reports its own failure.
 */
export const inject = ['connection', 'deepseekAccount'];

export const DETAILS_PATH = '/api/balance-display.details';

const REQUEST_TIMEOUT_MS = 15000;
const MAX_BODY_BYTES = 1024 * 1024;
const RECENT_LIMIT = 8;

class PlatformError extends Error {
  constructor(code, detail) {
    super(detail ? `${code}: ${detail}` : code);
    this.code = code;
  }
}

/** Fetch one Platform endpoint and unwrap its `{ code, data: { biz_code, biz_data } }` envelope. */
async function platformGet(session, path, query, signal) {
  const url = new URL(path, session.origin);
  for (const [key, value] of Object.entries(query ?? {})) url.searchParams.set(key, String(value));
  let response;
  try {
    response = await fetch(url, {
      method: 'GET',
      redirect: 'error',
      headers: {
        ...session.requestHeaders,
        'x-dsh-auth-token': session.token,
        accept: 'application/json',
        // Client identity headers the Platform web app sends with every call.
        'x-client-platform': 'web',
        'x-client-version': '1.0.1',
        'x-client-locale': 'zh_CN',
        'x-client-timezone-offset': String(session.tzSec ?? 0),
      },
      signal: AbortSignal.any([signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)]),
    });
  } catch (error) {
    throw new PlatformError('network', error?.name);
  }
  if (response.status === 401 || response.status === 403) throw new PlatformError('unauthorized', String(response.status));
  if (!response.ok) throw new PlatformError('http', String(response.status));
  const text = await response.text();
  if (text.length > MAX_BODY_BYTES) throw new PlatformError('too-large');
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new PlatformError('protocol', 'json');
  }
  if (payload?.code === 40003) throw new PlatformError('unauthorized', '40003');
  if (payload?.code !== 0) throw new PlatformError('protocol', `code ${payload?.code} ${typeof payload?.msg === 'string' ? payload.msg.slice(0, 80) : ''}`.trim());
  if (payload.data?.biz_code !== 0) throw new PlatformError('protocol', `biz_code ${payload.data?.biz_code} ${typeof payload.data?.biz_msg === 'string' ? payload.data.biz_msg.slice(0, 80) : ''}`.trim());
  return payload.data.biz_data;
}

const isAmount = (value) => (typeof value === 'string' || typeof value === 'number') && /^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(String(value).trim());

/** Exact decimal addition on strings (amounts have at most a few dozen digits). */
function addDecimal(a, b) {
  const parse = (v) => {
    const s = String(v).trim();
    const m = /^([+-]?)(\d*)(?:\.(\d*))?(?:e([+-]?\d+))?$/i.exec(s);
    let digits = (m[2] || '') + (m[3] || '');
    let scale = (m[3] || '').length - Number(m[4] || 0);
    if (scale < 0) { digits += '0'.repeat(-scale); scale = 0; }
    return { value: BigInt((m[1] === '-' ? '-' : '') + (digits || '0')), scale };
  };
  const x = parse(a);
  const y = parse(b);
  const scale = Math.max(x.scale, y.scale);
  const sum = x.value * 10n ** BigInt(scale - x.scale) + y.value * 10n ** BigInt(scale - y.scale);
  const negative = sum < 0n;
  let digits = (negative ? -sum : sum).toString().padStart(scale + 1, '0');
  const result = scale === 0 ? digits : `${digits.slice(0, -scale)}.${digits.slice(-scale)}`;
  return (negative ? '-' : '') + result;
}

/** Start of the current calendar month in the caller's UTC offset, as Unix seconds. */
function monthStart(nowMs, tzSec) {
  const local = new Date(nowMs + tzSec * 1000);
  return Math.floor(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1) / 1000) - tzSec;
}

/** Sum the month's per-model and per-tool costs for each currency. */
async function readSpending(session, tzSec, signal) {
  // Same range as Platform's "this month" preset: day boundaries in the caller's zone,
  // from the 1st through the end of today (end is the next local midnight).
  const now = Date.now();
  const start = monthStart(now, tzSec);
  const local = new Date(now + tzSec * 1000);
  const end = Math.floor(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + 1) / 1000) - tzSec;
  // Platform expects a whole-hour tz and folds any remainder into start/end (see its web app).
  const hourTz = 3600 * Math.floor(tzSec / 3600);
  const rest = tzSec - hourTz;
  const data = await platformGet(session, '/api/v0/usage/by_api_key/cost', { start: start + rest, end: end + rest, tz: hourTz }, signal);
  const currencies = [];
  for (const entry of Array.isArray(data?.data) ? data.data : []) {
    const byLabel = new Map();
    let total = '0';
    const fold = (series, kind) => {
      for (const item of Array.isArray(series) ? series : []) {
        const label = typeof item?.model === 'string' && item.model ? item.model : kind;
        for (const bucket of Array.isArray(item?.buckets) ? item.buckets : []) {
          if (!isAmount(bucket?.cost)) continue;
          byLabel.set(label, addDecimal(byLabel.get(label) ?? '0', bucket.cost));
          total = addDecimal(total, bucket.cost);
        }
      }
    };
    fold(entry?.series, 'model');
    fold(entry?.function_series, 'tools');
    const items = [...byLabel].map(([label, amount]) => ({ label, amount }))
      .filter((item) => Number(item.amount) !== 0)
      .sort((a, b) => Number(b.amount) - Number(a.amount));
    currencies.push({ currency: entry?.currency === 'USD' ? 'USD' : 'CNY', total, items });
  }
  return { start, end, currencies: currencies.filter((c) => Number(c.total) !== 0 || c.items.length > 0) };
}

/** Recent paid top-ups and granted bonuses, newest first. */
async function readRecharges(session, signal) {
  const data = await platformGet(session, '/auth-api/v0/users/get_all_invoice', undefined, signal);
  const time = (value) => {
    const ms = typeof value === 'number' ? (value < 1e12 ? value * 1000 : value) : Date.parse(value);
    return Number.isFinite(ms) ? ms : null;
  };
  const payments = (Array.isArray(data?.invoices?.payment_orders) ? data.invoices.payment_orders : [])
    .filter((order) => isAmount(order?.amount))
    .map((order) => ({
      amount: String(order.amount),
      currency: order.currency === 'USD' ? 'USD' : 'CNY',
      channel: typeof order.payment_channel === 'string' ? order.payment_channel : null,
      status: typeof order.payment_order_status === 'string' ? order.payment_order_status : null,
      time: time(order.paid_at) ?? time(order.inserted_at),
    }))
    .sort((a, b) => (b.time ?? 0) - (a.time ?? 0));
  const bonuses = (Array.isArray(data?.invoices?.bonus_orders) ? data.invoices.bonus_orders : [])
    .filter((order) => isAmount(order?.amount))
    .map((order) => ({
      amount: String(order.amount),
      currency: order.currency === 'USD' ? 'USD' : 'CNY',
      status: typeof order.bonus_order_status === 'string' ? order.bonus_order_status : null,
      note: order.note && typeof order.note === 'object'
        ? { zh: typeof order.note.zh === 'string' ? order.note.zh : null, en: typeof order.note.en === 'string' ? order.note.en : null }
        : null,
      time: time(order.inserted_at),
      expiresAt: time(order.expires_at),
    }))
    .sort((a, b) => (b.time ?? 0) - (a.time ?? 0));
  return {
    paymentCount: payments.length,
    payments: payments.slice(0, RECENT_LIMIT),
    bonusCount: bonuses.length,
    bonuses: bonuses.slice(0, RECENT_LIMIT),
  };
}

async function section(read) {
  try {
    return { status: 'ready', value: await read() };
  } catch (error) {
    const code = error instanceof PlatformError ? error.code : 'error';
    console.error('[balance-display] platform read failed', { code, message: error?.message });
    return { status: 'failed', code, detail: error instanceof PlatformError ? error.message : undefined };
  }
}

const json = (body, status = 200) => Response.json(body, { status, headers: { 'cache-control': 'no-store' } });

export function apply(ctx) {
  ctx.effect(() => ctx.connection.fetch.register({
    path: DETAILS_PATH,
    methods: ['GET'],
    requestBody: 'buffered',
    fetch: async (request) => {
      const tzParam = Number(new URL(request.url, 'http://localhost').searchParams.get('tz'));
      const tzSec = Number.isInteger(tzParam) && tzParam >= -14 * 3600 && tzParam <= 14 * 3600 ? tzParam : 0;
      let session;
      try {
        session = await ctx.deepseekAccount.getPlatformSession();
      } catch (error) {
        console.error('[balance-display] platform session unavailable', error?.message);
        return json({ status: 'failed' }, 502);
      }
      if (session === null) return json({ status: 'signed-out' });
      session = { ...session, tzSec };
      const [spending, recharges] = await Promise.all([
        section(() => readSpending(session, tzSec, request.signal)),
        section(() => readRecharges(session, request.signal)),
      ]);
      return json({ status: 'ready', spending, recharges });
    },
  }), 'balance-display: details route');
}
