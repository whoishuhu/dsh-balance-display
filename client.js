window.__ModuleLoader__.load({
  id: '@local/dsh-balance-display',
  factory(require) {
    const React = require('react');
    const { createPortal } = require('react-dom');
    const { useSyncExternalStore, useState, useEffect, useLayoutEffect, useRef, useCallback } = React;
    const h = React.createElement;

    /** Client build version the account Remote methods expect (matches the shipped account plugin). */
    const CLIENT_VERSION = '0.2.2-rc.1';
    /** Balance refresh period while signed in; balances change as the agent spends tokens. */
    const REFRESH_MS = 60 * 1000;

    const STRINGS = {
      zh: {
        balance: '余额', bonus: '赠金', loading: '余额加载中', notSignedIn: '未登录', unavailable: '余额获取失败',
        openDetails: '查看消费和充值详情', detailsTitle: '账户余额', topUpBalance: '充值余额', bonusBalance: '赠金余额',
        unavailableShort: '获取失败', detailsLoading: '正在读取消费和充值记录…', detailsFailed: '读取消费和充值记录失败，可前往开放平台查看。',
        sectionFailed: '读取失败', spendingMonth: '本月消费', toolCalls: '工具调用', otherModels: '其他', noSpending: '本月暂无消费',
        recharges: '充值记录', bonuses: '赠金记录', noRecharges: '暂无充值记录', count: '共 {0} 笔', expires: '到期',
        refreshShort: '刷新', openUsage: '用量详情', topUp: '充值',
        'status_PENDING': '处理中', 'status_CREATED': '待支付', 'status_FAILED': '失败', 'status_REFUNDED': '已退款', 'status_CHARGEBACK': '已拒付', 'status_EXPIRED': '已过期',
      },
      en: {
        balance: 'Balance', bonus: 'granted', loading: 'Loading balance', notSignedIn: 'Not signed in', unavailable: 'Balance unavailable',
        openDetails: 'View spending and top-ups', detailsTitle: 'Account balance', topUpBalance: 'Topped-up balance', bonusBalance: 'Granted balance',
        unavailableShort: 'Unavailable', detailsLoading: 'Loading spending and top-ups…', detailsFailed: 'Could not load spending and top-ups. You can view them on Platform.',
        sectionFailed: 'Could not load', spendingMonth: 'Spent this month', toolCalls: 'Tool calls', otherModels: 'Other', noSpending: 'No spending this month',
        recharges: 'Top-ups', bonuses: 'Grants', noRecharges: 'No top-ups yet', count: '{0} total', expires: 'expires',
        refreshShort: 'Refresh', openUsage: 'Usage details', topUp: 'Top up',
        'status_PENDING': 'Pending', 'status_CREATED': 'Unpaid', 'status_FAILED': 'Failed', 'status_REFUNDED': 'Refunded', 'status_CHARGEBACK': 'Charged back', 'status_EXPIRED': 'Expired',
      },
      ja: {
        balance: '残高', bonus: '付与', loading: '残高を読込中', notSignedIn: '未ログイン', unavailable: '残高を取得できません',
        openDetails: '利用額とチャージ履歴を表示', detailsTitle: 'アカウント残高', topUpBalance: 'チャージ残高', bonusBalance: '付与残高',
        unavailableShort: '取得失敗', detailsLoading: '利用額とチャージ履歴を読込中…', detailsFailed: '利用額とチャージ履歴を取得できませんでした。Platform で確認できます。',
        sectionFailed: '取得失敗', spendingMonth: '今月の利用額', toolCalls: 'ツール呼び出し', otherModels: 'その他', noSpending: '今月の利用はありません',
        recharges: 'チャージ履歴', bonuses: '付与履歴', noRecharges: 'チャージ履歴はありません', count: '全 {0} 件', expires: '期限',
        refreshShort: '更新', openUsage: '利用状況', topUp: 'チャージ',
        'status_PENDING': '処理中', 'status_CREATED': '未払い', 'status_FAILED': '失敗', 'status_REFUNDED': '返金済み', 'status_CHARGEBACK': 'チャージバック', 'status_EXPIRED': '期限切れ',
      },
    };

    /**
     * Convert a decimal amount (string or number, optional exponent such as
     * `0E-20` or `1.5e3`, the forms big.js accepts) into sign, integer digits
     * and fraction digits without floating-point arithmetic.
     */
    function parseDecimal(amount) {
      const match = /^([+-]?)(\d*)(?:\.(\d*))?(?:e([+-]?\d+))?$/i.exec(String(amount).trim());
      if (!match || (match[2] === '' && (match[3] ?? '') === '')) return null;
      let digits = (match[2] || '') + (match[3] || '');
      let point = (match[2] || '').length + Number(match[4] || 0);
      if (point < 0) {
        digits = '0'.repeat(-point) + digits;
        point = 0;
      }
      if (point > digits.length) digits += '0'.repeat(point - digits.length);
      return {
        negative: match[1] === '-',
        integer: digits.slice(0, point).replace(/^0+/, '') || '0',
        fraction: digits.slice(point),
      };
    }

    function isZeroAmount(amount) {
      const value = parseDecimal(amount);
      return value !== null && value.integer === '0' && /^0*$/.test(value.fraction);
    }

    /**
     * Format a balance with the shipped account page's rules: two decimals
     * rounded down, `<¥0.01` below one cent, grouped digits.
     */
    function formatBalance(amount, symbol) {
      const value = parseDecimal(amount);
      if (value === null) return symbol + '—';
      const integer = value.integer.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
      const cents = (value.fraction + '00').slice(0, 2);
      if (value.integer === '0' && /^0*$/.test(value.fraction)) return symbol + '0.00';
      const belowCent = value.integer === '0' && cents === '00';
      if (value.negative) return '-' + symbol + (belowCent ? '0.01' : integer + '.' + cents);
      if (belowCent) return '<' + symbol + '0.01';
      return symbol + integer + '.' + cents;
    }

    function currencySymbol(currency) {
      return currency === 'CNY' ? '¥' : '$';
    }

    function WalletIcon() {
      return h('svg', { viewBox: '0 0 16 16', width: 14, height: 14, fill: 'none', 'aria-hidden': true },
        h('rect', { x: 1.75, y: 3.25, width: 12.5, height: 9.5, rx: 2, stroke: 'currentColor', strokeWidth: 1.3 }),
        h('path', { d: 'M10 7.25h4.25v2.5H10a1.25 1.25 0 0 1 0-2.5Z', stroke: 'currentColor', strokeWidth: 1.3, strokeLinejoin: 'round' }),
        h('path', { d: 'M3.5 3.25 10.5 1.5v1.75', stroke: 'currentColor', strokeWidth: 1.3, strokeLinejoin: 'round' })
      );
    }

    const PANEL_MARGIN = 12;
    const PANEL_GAP = 8;
    const DETAILS_ROUTE = 'api/balance-display.details';

    const CHANNELS = {
      zh: { ALIPAY: '支付宝', WECHAT: '微信支付', BANK_TRANSFER: '对公转账', CARD: '银行卡', PAYPAL: 'PayPal', GOOGLE_PAY: 'Google Pay', APPLE_PAY: 'Apple Pay' },
      en: { ALIPAY: 'Alipay', WECHAT: 'WeChat Pay', BANK_TRANSFER: 'Bank transfer', CARD: 'Card', PAYPAL: 'PayPal', GOOGLE_PAY: 'Google Pay', APPLE_PAY: 'Apple Pay' },
    };

    function langOf(locale) {
      const active = String(locale.getSnapshot()?.active ?? 'en');
      return active.startsWith('zh') ? 'zh' : active.startsWith('ja') ? 'ja' : 'en';
    }

    function formatDate(ms, withTime) {
      if (ms === null || ms === undefined) return '—';
      const d = new Date(ms);
      const p = (n) => String(n).padStart(2, '0');
      const date = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
      return withTime ? `${date} ${p(d.getHours())}:${p(d.getMinutes())}` : date;
    }

    function joinMoney(list) {
      return list.map((w) => formatBalance(w.balance, currencySymbol(w.currency))).join(' / ');
    }

    /** Place the fixed panel above its trigger, clamped into the viewport. */
    function usePanelPosition(open, anchorRef, panelRef) {
      const [pos, setPos] = useState(null);
      useLayoutEffect(() => {
        if (!open) { setPos(null); return undefined; }
        const place = () => {
          const anchor = anchorRef.current?.getBoundingClientRect();
          const panel = panelRef.current;
          if (!anchor || !panel) return;
          const width = panel.offsetWidth;
          const height = panel.offsetHeight;
          const left = Math.min(Math.max(PANEL_MARGIN, anchor.left + anchor.width / 2 - width / 2), window.innerWidth - width - PANEL_MARGIN);
          const top = Math.max(PANEL_MARGIN, anchor.top - PANEL_GAP - height);
          const maxHeight = anchor.top - PANEL_GAP - PANEL_MARGIN;
          setPos({ left, top, '--dshbal-max-height': maxHeight + 'px' });
        };
        place();
        const observer = new ResizeObserver(place);
        if (panelRef.current) observer.observe(panelRef.current);
        window.addEventListener('resize', place);
        return () => { observer.disconnect(); window.removeEventListener('resize', place); };
      }, [open]);
      return pos;
    }

    function Row({ label, value, sub }) {
      return h(React.Fragment, null,
        h('dt', null, label, sub ? h('span', { className: 'dshbal-sub' }, sub) : null),
        h('dd', null, value));
    }

    function SectionTitle({ children, aside }) {
      return h('div', { className: 'dshbal-section' }, h('span', null, children), aside ? h('span', { className: 'dshbal-aside' }, aside) : null);
    }

    function DetailsPanel({ state, details, t, lang, links, onRefresh }) {
      const balance = state.balance?.status === 'ready' ? state.balance : null;
      const bonus = balance ? balance.bonusWallets.filter((w) => !isZeroAmount(w.balance)) : [];
      const channelName = (c) => (CHANNELS[lang] ?? CHANNELS.en)[c] ?? c ?? '';
      const statusText = (s) => (s && s !== 'SUCCESS' ? t('status_' + s) : null);
      const body = [];

      body.push(h('dl', { key: 'bal', className: 'dshbal-details' },
        h(Row, { label: t('topUpBalance'), value: balance ? joinMoney(balance.wallets.length ? balance.wallets : [{ currency: 'CNY', balance: '0' }]) : t('unavailableShort') }),
        h(Row, { label: t('bonusBalance'), value: balance ? (bonus.length ? joinMoney(bonus) : formatBalance('0', '¥')) : t('unavailableShort') })));

      if (details.status === 'loading' || details.status === 'idle') {
        body.push(h('div', { key: 'loading', className: 'dshbal-note' }, t('detailsLoading')));
      } else if (details.status !== 'ready') {
        body.push(h('div', { key: 'err', className: 'dshbal-note' }, t('detailsFailed')));
      } else {
        const { spending, recharges } = details.value;
        // Spending this month
        if (spending.status === 'ready') {
          const s = spending.value;
          const totals = s.currencies.length ? s.currencies.map((c) => formatBalance(c.total, currencySymbol(c.currency))).join(' / ') : formatBalance('0', '¥');
          body.push(h(SectionTitle, { key: 'st', aside: totals }, t('spendingMonth')));
          const rows = [];
          for (const c of s.currencies) {
            for (const item of c.items.slice(0, 6)) {
              const label = item.label === 'tools' ? t('toolCalls') : item.label === 'model' ? t('otherModels') : item.label;
              rows.push(h(Row, { key: c.currency + item.label, label, value: formatBalance(item.amount, currencySymbol(c.currency)) }));
            }
          }
          if (rows.length) body.push(h('dl', { key: 'sd', className: 'dshbal-details' }, rows));
          else body.push(h('div', { key: 'sn', className: 'dshbal-note' }, t('noSpending')));
        } else {
          body.push(h(SectionTitle, { key: 'st' }, t('spendingMonth')));
          body.push(h('div', { key: 'sf', className: 'dshbal-note' }, t('sectionFailed')));
        }
        // Recharge history
        if (recharges.status === 'ready') {
          const r = recharges.value;
          body.push(h(SectionTitle, { key: 'rt', aside: r.paymentCount ? t('count', r.paymentCount) : null }, t('recharges')));
          if (r.payments.length) {
            body.push(h('dl', { key: 'rd', className: 'dshbal-details' }, r.payments.map((p, i) => h(Row, {
              key: 'p' + i,
              label: formatDate(p.time, true),
              sub: [channelName(p.channel), statusText(p.status)].filter(Boolean).join(' · ') || null,
              value: formatBalance(p.amount, currencySymbol(p.currency)),
            }))));
          } else body.push(h('div', { key: 'rn', className: 'dshbal-note' }, t('noRecharges')));
          if (r.bonuses.length) {
            body.push(h(SectionTitle, { key: 'bt', aside: t('count', r.bonusCount) }, t('bonuses')));
            body.push(h('dl', { key: 'bd', className: 'dshbal-details' }, r.bonuses.map((b, i) => h(Row, {
              key: 'b' + i,
              label: formatDate(b.time, false),
              sub: [b.note ? (lang === 'zh' ? b.note.zh ?? b.note.en : b.note.en ?? b.note.zh) : null, b.expiresAt ? t('expires') + ' ' + formatDate(b.expiresAt, false) : null].filter(Boolean).join(' · ') || null,
              value: formatBalance(b.amount, currencySymbol(b.currency)),
            }))));
          }
        } else {
          body.push(h(SectionTitle, { key: 'rt' }, t('recharges')));
          body.push(h('div', { key: 'rf', className: 'dshbal-note' }, t('sectionFailed')));
        }
      }

      body.push(h('div', { key: 'actions', className: 'dshbal-actions' },
        h('button', { type: 'button', className: 'dshbal-link', onClick: onRefresh, disabled: details.status === 'loading' }, t('refreshShort')),
        links ? h('a', { className: 'dshbal-link', href: links.usageUrl, target: '_blank', rel: 'noreferrer' }, t('openUsage')) : null,
        links ? h('a', { className: 'dshbal-link dshbal-primary', href: links.topUpUrl, target: '_blank', rel: 'noreferrer' }, t('topUp')) : null));
      return body;
    }

    /** Inline reading in the composer dock; clicking opens balance, spending and recharge details. */
    function BalancePill({ store, refresh, loadDetails, locale, translate }) {
      const state = useSyncExternalStore(store.subscribe, store.getSnapshot);
      useSyncExternalStore(locale.subscribe, locale.getSnapshot);
      const t = translate;
      const [open, setOpen] = useState(false);
      const [details, setDetails] = useState({ status: 'idle' });
      const rootRef = useRef(null);
      const panelRef = useRef(null);
      const pos = usePanelPosition(open, rootRef, panelRef);
      const signedIn = state.view?.status === 'credential-stored';

      const reload = useCallback(() => {
        setDetails({ status: 'loading' });
        refresh();
        loadDetails().then(setDetails);
      }, [refresh, loadDetails]);

      useEffect(() => {
        if (open) reload();
      }, [open, reload]);
      useEffect(() => {
        if (!signedIn) setOpen(false);
      }, [signedIn]);
      useEffect(() => {
        if (!open) return undefined;
        const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
        const onDown = (e) => {
          if (!(e.target instanceof Node)) return;
          if (rootRef.current?.contains(e.target) || panelRef.current?.contains(e.target)) return;
          setOpen(false);
        };
        document.addEventListener('keydown', onKey);
        document.addEventListener('pointerdown', onDown, true);
        return () => {
          document.removeEventListener('keydown', onKey);
          document.removeEventListener('pointerdown', onDown, true);
        };
      }, [open]);

      if (state.view === undefined) return null;

      let text;
      if (!signedIn) text = t('notSignedIn');
      else if (state.balance === null) text = t('loading');
      else if (state.balance.status !== 'ready') text = t('unavailable');
      else {
        text = joinMoney(state.balance.wallets.length > 0 ? state.balance.wallets : [{ currency: 'CNY', balance: '0' }]);
        const bonus = state.balance.bonusWallets.filter((w) => !isZeroAmount(w.balance));
        if (bonus.length > 0) text += ' · ' + t('bonus') + ' ' + joinMoney(bonus);
      }

      const label = h('span', { className: 'dshbal-label' }, text);
      if (!signedIn) {
        return h('span', { className: 'dshbal-anchor', 'data-composer-stat': 'balance' },
          h('span', { className: 'dshbal-pill', title: t('balance') }, h(WalletIcon), label));
      }
      return h('span', { ref: rootRef, className: 'dshbal-anchor', 'data-composer-stat': 'balance' },
        h('button', {
          type: 'button',
          className: 'dshbal-pill',
          'aria-haspopup': 'dialog',
          'aria-expanded': open,
          'aria-label': t('balance') + ' ' + text,
          title: open ? undefined : t('openDetails'),
          onClick: () => setOpen(!open),
        }, h(WalletIcon), label),
        open && createPortal(h('div', {
          ref: panelRef,
          className: 'dshbal-panel',
          role: 'dialog',
          'aria-label': t('detailsTitle'),
          style: pos ?? { visibility: 'hidden', left: 0, top: 0 },
        },
          h('div', { className: 'dshbal-title' },
            h('span', { className: 'dshbal-title-label' }, h(WalletIcon), t('detailsTitle')),
            h('span', { className: 'dshbal-title-value' }, text)),
          h('div', { className: 'dshbal-rule', 'aria-hidden': true }),
          h(DetailsPanel, { state, details, t, lang: langOf(locale), links: state.view?.links, onRefresh: reload })
        ), document.body)
      );
    }

    // Copied from the shipped stats pill and stat dialog styles, renamed under this plugin's prefix.
    const CSS = `
.dshbal-anchor{min-width:0;font-size:calc(var(--dsh-content-font-size-secondary,13px) - 1px);line-height:calc(20px + var(--dsh-content-font-delta-secondary,0px));display:inline-flex}
.dshbal-pill{box-sizing:border-box;border-radius:var(--dsw-radius-sm);max-width:100%;color:var(--dsw-alias-label-tertiary);font:inherit;font-variant-numeric:tabular-nums;line-height:inherit;white-space:nowrap;background:0 0;border:none;align-items:center;gap:6px;padding:1px 8px;display:inline-flex}
.dshbal-pill svg{flex:none;width:14px;height:14px}
button.dshbal-pill{cursor:pointer}
button.dshbal-pill[aria-expanded=true]{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary)}
@media (hover:hover){button.dshbal-pill:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary)}}
button.dshbal-pill:focus-visible,.dshbal-link:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:1px}
.dshbal-label{text-overflow:ellipsis;min-width:0;overflow:hidden}
.dshbal-panel{z-index:1100;box-sizing:border-box;width:max-content;min-width:min(320px,calc(100vw - 24px));max-width:min(440px,calc(100vw - 24px));max-height:var(--dshbal-max-height,70vh);border-radius:var(--dsw-radius-lg);background:var(--dsw-specific-menu);backdrop-filter:var(--dsw-menu-backdrop-filter);--dsw-elevation-stroke-color:var(--dsw-alias-border-l1);box-shadow:var(--dsw-elevation-prominent);color:var(--dsw-alias-label-secondary);cursor:default;border:0;padding:16px;font-size:12px;line-height:18px;position:fixed;overflow:hidden auto}
.dshbal-title{color:var(--dsw-alias-label-primary);justify-content:space-between;gap:16px;margin-bottom:8px;font-weight:500;display:flex}
.dshbal-title-label{align-items:center;gap:6px;min-width:0;display:inline-flex}
.dshbal-title-label svg{flex:none;width:14px;height:14px}
.dshbal-title-value{font-variant-numeric:tabular-nums;white-space:nowrap}
.dshbal-rule{border-top:.5px solid var(--dsw-alias-border-l2);margin-bottom:10px}
.dshbal-details{color:var(--dsw-alias-label-tertiary);grid-template-columns:minmax(76px,auto) minmax(0,1fr);gap:6px 16px;margin:0;display:grid}
.dshbal-details dt,.dshbal-details dd{min-width:0;margin:0}
.dshbal-details dt{overflow-wrap:anywhere}
.dshbal-details dd{color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums;text-align:right;white-space:nowrap}
.dshbal-sub{display:block;color:var(--dsw-alias-label-tertiary);opacity:.8;font-size:11px;line-height:16px}
.dshbal-section{color:var(--dsw-alias-label-primary);font-weight:500;justify-content:space-between;gap:16px;margin:14px 0 6px;padding-top:10px;border-top:.5px solid var(--dsw-alias-border-l2);display:flex}
.dshbal-aside{font-variant-numeric:tabular-nums;font-weight:500}
.dshbal-note{color:var(--dsw-alias-label-tertiary)}
.dshbal-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:14px;padding-top:10px;border-top:.5px solid var(--dsw-alias-border-l2)}
.dshbal-link{box-sizing:border-box;font:inherit;color:var(--dsw-alias-label-primary);background:0 0;border:.5px solid var(--dsw-alias-border-l3);border-radius:var(--dsw-radius-md);padding:3px 10px;text-decoration:none;cursor:pointer;white-space:nowrap}
.dshbal-link:disabled{opacity:.5;cursor:default}
@media (hover:hover){.dshbal-link:not(:disabled):hover{background:var(--dsw-alias-interactive-bg-hover)}}
.dshbal-primary{color:var(--dsw-alias-state-business-primary)}
`;

    return {
      inject: ['slots', 'locale', 'remote', 'remote.account', 'remoteAccess'],

      apply(ctx) {
        for (const [lang, dict] of Object.entries(STRINGS)) {
          ctx.effect(() => ctx.locale.register('balance-display', lang, dict), 'balance-display: locale ' + lang);
        }
        const bound = ctx.locale.bind('balance-display');
        /** Fall back to English for UI languages this plugin does not translate. */
        const translate = (key, arg) => {
          let value;
          try { value = bound(key); } catch (_) { value = undefined; }
          if (value === key || value === undefined || value === '') value = STRINGS.en[key] ?? key;
          return arg === undefined ? value : String(value).replace('{0}', String(arg));
        };

        ctx.effect(() => {
          const style = document.createElement('style');
          style.dataset.plugin = '@local/dsh-balance-display';
          style.textContent = CSS;
          document.head.appendChild(style);
          return () => style.remove();
        }, 'balance-display: styles');

        // One shared store for every session's dock: account view plus the latest balance read.
        const listeners = new Set();
        let snapshot = { view: undefined, balance: null, loading: false };
        const publish = (patch) => {
          snapshot = { ...snapshot, ...patch };
          for (const fn of listeners) fn();
        };
        const store = {
          getSnapshot: () => snapshot,
          subscribe: (fn) => {
            listeners.add(fn);
            return () => listeners.delete(fn);
          },
        };

        let generation = 0;
        let pending;
        /** Read wallets through the same Remote method the account settings page uses. */
        const refresh = () => {
          if (snapshot.view?.status !== 'credential-stored') return Promise.resolve();
          if (pending !== undefined) return pending;
          const current = generation;
          publish({ loading: true });
          pending = (async () => {
            let balance;
            try {
              const result = await ctx.remote.account.getBalance({
                version: CLIENT_VERSION,
                locale: ctx.locale.getSnapshot().active,
                timezoneOffsetSeconds: -new Date().getTimezoneOffset() * 60,
              });
              const value = result.ok ? result.value : null;
              balance = value?.status === 'ready'
                ? { status: 'ready', wallets: value.value ?? [], bonusWallets: value.bonusWallets ?? [] }
                : { status: 'failed' };
              if (balance.status === 'ready') {
                for (const w of [...balance.wallets, ...balance.bonusWallets]) {
                  if (parseDecimal(w.balance) === null) console.warn('[balance-display] unrecognized balance value', w);
                }
              }
            } catch (error) {
              console.error('[balance-display] balance read failed', error);
              balance = { status: 'failed' };
            }
            if (current === generation) publish({ balance, loading: false });
          })().finally(() => { pending = undefined; });
          return pending;
        };

        ctx.effect(() => {
          const id = setInterval(() => { refresh(); }, REFRESH_MS);
          const onFocus = () => { refresh(); };
          window.addEventListener('focus', onFocus);
          return () => {
            clearInterval(id);
            window.removeEventListener('focus', onFocus);
          };
        }, 'balance-display: refresh timer');

        // Track sign-in state; the pill only exists while the account feature is reachable.
        ctx.remoteAccess.whenAccess('account/watch', function* () {
          const stream = ctx.remote.$stream({
            name: 'balance-display.account',
            open: (signal) => ctx.remote.account.watch(signal),
            ended: () => new Error('balance-display: account stream ended'),
          });
          let ended = false;
          yield () => {
            ended = true;
            generation++;
            publish({ view: undefined, balance: null, loading: false });
            return stream.dispose();
          };
          (async () => {
            for await (const frame of stream) {
              if (ended) return;
              generation++;
              pending = undefined;
              publish({ view: frame.value, balance: null, loading: false });
              frame.accept();
              refresh();
            }
          })().catch((error) => {
            if (!ended) console.error('[balance-display] account stream failed', error);
          });
        });

        /** Spending and recharge details from the Host half's Platform route; the token stays on the Host. */
        const loadDetails = async () => {
          try {
            const tz = -new Date().getTimezoneOffset() * 60;
            const response = await fetch(DETAILS_ROUTE + '?tz=' + tz, { headers: { accept: 'application/json' } });
            if (!response.ok) return { status: 'failed' };
            const body = await response.json();
            if (body?.status !== 'ready') return { status: 'failed' };
            return { status: 'ready', value: body };
          } catch (error) {
            console.error('[balance-display] details read failed', error);
            return { status: 'failed' };
          }
        };

        const locale = {
          getSnapshot: () => ctx.locale.getSnapshot(),
          subscribe: (fn) => ctx.locale.subscribe(fn),
        };
        const props = { store, refresh: () => { refresh(); }, loadDetails, locale, translate };
        ctx.slots.inject('conversation.composer.dock', () => ctx.slots.register({
          name: 'conversation.composer.dock',
          id: 'balance',
          order: 2,
          label: () => translate('balance'),
        }, function BalanceDockEntry() {
          return h(BalancePill, props);
        }));
      },
    };
  },
});
