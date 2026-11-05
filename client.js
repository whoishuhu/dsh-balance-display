window.__ModuleLoader__.load({
  id: '@local/dsh-balance-display',
  factory(require) {
    const React = require('react');
    const { useSyncExternalStore } = React;
    const h = React.createElement;

    /** Client build version the account Remote methods expect (matches the shipped account plugin). */
    const CLIENT_VERSION = '0.2.2-rc.1';
    /** Balance refresh period while signed in; balances change as the agent spends tokens. */
    const REFRESH_MS = 60 * 1000;

    const STRINGS = {
      zh: { balance: '余额', bonus: '赠金', loading: '余额加载中', notSignedIn: '未登录', unavailable: '余额获取失败', refresh: '点击刷新余额' },
      en: { balance: 'Balance', bonus: 'granted', loading: 'Loading balance', notSignedIn: 'Not signed in', unavailable: 'Balance unavailable', refresh: 'Click to refresh balance' },
      ja: { balance: '残高', bonus: '付与', loading: '残高を読込中', notSignedIn: '未ログイン', unavailable: '残高を取得できません', refresh: 'クリックして残高を更新' },
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

    /** Inline reading in the composer dock, styled like the shipped stats pills. */
    function BalancePill({ store, refresh, translate }) {
      const state = useSyncExternalStore(store.subscribe, store.getSnapshot);
      const t = translate;
      if (state.view === undefined) return null;
      const signedIn = state.view.status === 'credential-stored';

      let text;
      if (!signedIn) text = t('notSignedIn');
      else if (state.balance === null) text = t('loading');
      else if (state.balance.status !== 'ready') text = t('unavailable');
      else {
        const wallets = state.balance.wallets.length > 0 ? state.balance.wallets : [{ currency: 'CNY', balance: '0' }];
        text = wallets.map((w) => formatBalance(w.balance, currencySymbol(w.currency))).join(' / ');
        const bonus = state.balance.bonusWallets.filter((w) => !isZeroAmount(w.balance));
        if (bonus.length > 0) {
          text += ' · ' + t('bonus') + ' ' + bonus.map((w) => formatBalance(w.balance, currencySymbol(w.currency))).join(' / ');
        }
      }

      const label = h('span', { className: 'dshbal-label' }, text);
      return h('span', { className: 'dshbal-anchor', 'data-composer-stat': 'balance' },
        signedIn
          ? h('button', {
            type: 'button',
            className: 'dshbal-pill',
            title: t('balance') + ' ' + text + '\n' + t('refresh'),
            'aria-label': t('balance') + ' ' + text,
            'aria-busy': state.loading || undefined,
            onClick: refresh,
          }, h(WalletIcon), label)
          : h('span', { className: 'dshbal-pill', title: t('balance') }, h(WalletIcon), label)
      );
    }

    // Copied from the shipped stats pill styles, renamed under this plugin's prefix.
    const CSS = `
.dshbal-anchor{min-width:0;font-size:calc(var(--dsh-content-font-size-secondary,13px) - 1px);line-height:calc(20px + var(--dsh-content-font-delta-secondary,0px));display:inline-flex}
.dshbal-pill{box-sizing:border-box;border-radius:var(--dsw-radius-sm);max-width:100%;color:var(--dsw-alias-label-tertiary);font:inherit;font-variant-numeric:tabular-nums;line-height:inherit;white-space:nowrap;background:0 0;border:none;align-items:center;gap:6px;padding:1px 8px;display:inline-flex}
.dshbal-pill svg{flex:none;width:14px;height:14px}
button.dshbal-pill{cursor:pointer}
button.dshbal-pill[aria-busy=true]{opacity:.6}
@media (hover:hover){button.dshbal-pill:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary)}}
button.dshbal-pill:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:1px}
.dshbal-label{text-overflow:ellipsis;min-width:0;overflow:hidden}
`;

    return {
      inject: ['slots', 'locale', 'remote', 'remote.account', 'remoteAccess'],

      apply(ctx) {
        for (const [lang, dict] of Object.entries(STRINGS)) {
          ctx.effect(() => ctx.locale.register('balance-display', lang, dict), 'balance-display: locale ' + lang);
        }
        const bound = ctx.locale.bind('balance-display');
        /** Fall back to English for UI languages this plugin does not translate. */
        const translate = (key) => {
          const value = bound(key);
          return value === key || value === undefined || value === '' ? STRINGS.en[key] : value;
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

        const props = { store, refresh: () => { refresh(); }, translate };
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
