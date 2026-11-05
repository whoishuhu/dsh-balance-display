window.__ModuleLoader__.load({
  id: '@local/dsh-balance-display',
  factory(require) {
    const React = require('react');
    const { useState, useEffect, useSyncExternalStore } = React;
    const h = React.createElement;

    /** Client build version the account Remote methods expect (matches the shipped account plugin). */
    const CLIENT_VERSION = '0.2.2-rc.1';
    /** Balance refresh period while signed in; balances change as the agent spends tokens. */
    const REFRESH_MS = 60 * 1000;

    const STRINGS = {
      zh: { balance: '余额', loading: '加载中', notSignedIn: '未登录', unavailable: '获取失败', refresh: '点击刷新', hide: '隐藏余额' },
      en: { balance: 'Balance', loading: 'Loading', notSignedIn: 'Not signed in', unavailable: 'Unavailable', refresh: 'Click to refresh', hide: 'Hide balance' },
      ja: { balance: '残高', loading: '読込中', notSignedIn: '未ログイン', unavailable: '取得失敗', refresh: 'クリックして更新', hide: '残高を隠す' },
    };

    /** Add thousands separators to the integer part of a fixed-point string. */
    function addCommas(fixed) {
      const [integer, fraction] = fixed.split('.');
      return integer.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '.' + fraction;
    }

    /**
     * Format a decimal balance string with the shipped account page's rules:
     * two decimals rounded down, `<¥0.01` for sub-cent amounts, grouped digits.
     * String arithmetic avoids floating-point rounding of the source amount.
     */
    function formatBalance(amount, symbol) {
      const match = /^(-?)(\d*)(?:\.(\d*))?$/.exec(String(amount).trim());
      if (!match) return symbol + '—';
      const negative = match[1] === '-';
      const integer = (match[2] || '0').replace(/^0+(?=\d)/, '');
      const fraction = match[3] || '';
      const cents = (fraction + '00').slice(0, 2);
      const isZero = /^0*$/.test(integer) && /^0*$/.test(fraction);
      if (isZero) return symbol + '0.00';
      const belowCent = /^0*$/.test(integer) && cents === '00';
      if (negative) return '-' + symbol + (belowCent ? '0.01' : addCommas(integer + '.' + cents));
      if (belowCent) return '<' + symbol + '0.01';
      return symbol + addCommas(integer + '.' + cents);
    }

    function currencySymbol(currency) {
      return currency === 'CNY' ? '¥' : '$';
    }

    /** Floating balance pill; all data arrives through props so the component stays side-effect free. */
    function BalanceWidget({ account, locale, getBalance, translate }) {
      const accountState = useSyncExternalStore(account.subscribe, account.getSnapshot);
      useSyncExternalStore(locale.subscribe, locale.getSnapshot);
      const t = translate;

      const [result, setResult] = useState(null);
      const [tick, setTick] = useState(0);
      const [hidden, setHidden] = useState(false);
      const signedIn = accountState.view?.status === 'credential-stored';

      useEffect(() => {
        if (!signedIn) return undefined;
        const id = setInterval(() => setTick((n) => n + 1), REFRESH_MS);
        const onFocus = () => setTick((n) => n + 1);
        window.addEventListener('focus', onFocus);
        return () => {
          clearInterval(id);
          window.removeEventListener('focus', onFocus);
        };
      }, [signedIn]);

      useEffect(() => {
        if (!signedIn) {
          setResult(null);
          return undefined;
        }
        let cancelled = false;
        getBalance().then((next) => {
          if (!cancelled) setResult(next);
        });
        return () => { cancelled = true; };
      }, [signedIn, tick, getBalance]);

      if (hidden || accountState.view === undefined) return null;

      let text;
      if (!signedIn) text = t('notSignedIn');
      else if (result === null) text = t('loading');
      else if (result.status !== 'ready') text = t('unavailable');
      else {
        const wallets = result.wallets.length > 0 ? result.wallets : [{ currency: 'CNY', balance: '0' }];
        text = wallets.map((w) => formatBalance(w.balance, currencySymbol(w.currency))).join(' / ');
        const bonus = result.bonusWallets.filter((w) => !/^-?0*(\.0*)?$/.test(String(w.balance)));
        if (bonus.length > 0) {
          text += ' + ' + bonus.map((w) => formatBalance(w.balance, currencySymbol(w.currency))).join(' / ');
        }
      }

      return h('div', {
        className: 'dsh-balance-display',
        role: 'status',
        'aria-live': 'polite',
      },
        h('button', {
          type: 'button',
          className: 'dsh-balance-display__main',
          title: t('refresh'),
          onClick: () => setTick((n) => n + 1),
          disabled: !signedIn,
        },
          h('span', { className: 'dsh-balance-display__label' }, t('balance')),
          h('span', { className: 'dsh-balance-display__value', 'data-muted': !signedIn || result?.status !== 'ready' ? '' : undefined }, text)
        ),
        h('button', {
          type: 'button',
          className: 'dsh-balance-display__close',
          'aria-label': t('hide'),
          title: t('hide'),
          onClick: () => setHidden(true),
        }, '×')
      );
    }

    const CSS = `
.dsh-balance-display{position:fixed;right:16px;bottom:16px;z-index:20;display:flex;align-items:center;pointer-events:auto;
  background:var(--dsw-alias-bg-base);border:.5px solid var(--dsw-alias-border-l3);border-radius:999px;
  box-shadow:0 2px 8px rgba(0,0,0,.08);font-size:12px;line-height:18px;color:var(--dsw-alias-label-primary);user-select:none}
.dsh-balance-display button{font:inherit;color:inherit;background:none;border:none;cursor:pointer}
.dsh-balance-display__main{display:flex;align-items:center;gap:6px;padding:5px 4px 5px 12px;border-radius:999px 0 0 999px}
.dsh-balance-display__main:disabled{cursor:default}
.dsh-balance-display__label{color:var(--dsw-alias-label-tertiary)}
.dsh-balance-display__value{font-weight:500;font-variant-numeric:tabular-nums}
.dsh-balance-display__value[data-muted]{color:var(--dsw-alias-label-tertiary);font-weight:400}
.dsh-balance-display__close{padding:5px 10px 5px 4px;font-size:14px;line-height:18px;color:var(--dsw-alias-label-tertiary);border-radius:0 999px 999px 0}
@media (hover:hover){.dsh-balance-display__main:not(:disabled):hover,.dsh-balance-display__close:hover{background:var(--dsw-alias-interactive-bg-hover)}}
.dsh-balance-display button:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:1px}
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

        const listeners = new Set();
        let snapshot = { view: undefined };
        const publish = (next) => {
          snapshot = next;
          for (const fn of listeners) fn();
        };
        const account = {
          getSnapshot: () => snapshot,
          subscribe: (fn) => {
            listeners.add(fn);
            return () => listeners.delete(fn);
          },
        };
        const locale = {
          getSnapshot: () => ctx.locale.getSnapshot(),
          subscribe: (fn) => ctx.locale.subscribe(fn),
        };

        /** Read wallets through the same Remote method the account settings page uses. */
        const getBalance = async () => {
          try {
            const meta = {
              version: CLIENT_VERSION,
              locale: ctx.locale.getSnapshot().active,
              timezoneOffsetSeconds: -new Date().getTimezoneOffset() * 60,
            };
            const result = await ctx.remote.account.getBalance(meta);
            if (!result.ok || result.value === null) return { status: 'failed' };
            const balance = result.value;
            if (balance.status !== 'ready') return { status: 'failed' };
            return { status: 'ready', wallets: balance.value ?? [], bonusWallets: balance.bonusWallets ?? [] };
          } catch (error) {
            console.error('[balance-display] balance read failed', error);
            return { status: 'failed' };
          }
        };

        // Track sign-in state; the widget only exists while the account feature is reachable.
        ctx.remoteAccess.whenAccess('account/watch', function* () {
          const stream = ctx.remote.$stream({
            name: 'balance-display.account',
            open: (signal) => ctx.remote.account.watch(signal),
            ended: () => new Error('balance-display: account stream ended'),
          });
          let ended = false;
          yield () => {
            ended = true;
            publish({ view: undefined });
            return stream.dispose();
          };
          (async () => {
            for await (const frame of stream) {
              if (ended) return;
              publish({ view: frame.value });
              frame.accept();
            }
          })().catch((error) => {
            if (!ended) console.error('[balance-display] account stream failed', error);
          });
        });

        const props = { account, locale, getBalance, translate };
        ctx.slots.inject('shell.overlay', () => ctx.slots.register({
          name: 'shell.overlay',
          id: 'balance-display',
          label: () => translate('balance'),
        }, function BalanceDisplayEntry() {
          return h(BalanceWidget, props);
        }));
      },
    };
  },
});
