import test from 'node:test';
import assert from 'node:assert/strict';
import { Tideguard } from './strategy.ts';
import { BarsState } from './vendor/makefun-bars.ts';

const hello = {
  type: 'hello', protocol: 'agent-fun/bars-replay/v1', seed: '1',
  symbols: [{ symbol: 'CBBTC', mint: 'test', price_scale: 5, qty_scale: 8 }],
  capital: { quote: 'USDC', quote_scale: 6, quote_units: '1000000000' },
  caps: { max_open_positions: 1, max_orders_per_bar: 16, max_weight_bps: 10000, shorts: false, leverage: false },
  fees: { fee_bps: 4, slippage_bps: 2, min_notional_quote_units: '1000000' },
  bar_interval: '1m', first_close_ms: 60000, latency_bars: 1,
};

function step(bot, state, seq, price, options = {}) {
  const p = String(Math.round(price));
  const batch = { type: 'batch', seq, t: (seq + 1) * 60000,
    bars: [{ symbol: 'CBBTC', t: (seq + 1) * 60000, o: p, h: p, l: p, c: p, v: null,
      o_depth: ['700000000000'], c_depth: ['700000000000'] }], fills: [],
    account: { cash_quote_units: '1000000000', equity_quote_units: '1000000000', positions: [], ...options },
  };
  state.applyBatch(batch);
  return state.toOrders(bot.decide(state, batch));
}

test('flat and falling early markets do not consume capital', () => {
  for (const rate of [1, 0.999]) {
    const bot = new Tideguard(), state = new BarsState(hello);
    for (let i = 0; i < 200; i++) assert.deepEqual(step(bot, state, i, 6500000000 * rate ** i), []);
  }
});

test('a confirmed trend sizes within cash, position and pool-impact caps', () => {
  const bot = new Tideguard(), state = new BarsState(hello);
  const orders = [];
  for (let i = 0; i < 100; i++) orders.push(...step(bot, state, i, 6500000000 * 1.001 ** i, { cash_quote_units: '300000000' }));
  assert.ok(orders.length > 0);
  for (const order of orders) {
    assert.equal(order.side, 'buy');
    assert.ok(BigInt(order.notional_quote_units) <= 300000000n);
    assert.ok(BigInt(order.notional_quote_units) <= 1400000000n);
  }
  assert.equal(bot.holding, false, 'An unfilled buy must not invent a position.');
});

test('a price gap rebuilds history while keeping the protective exit active', () => {
  const bot = new Tideguard(), state = new BarsState(hello);
  for (let i = 0; i < 60; i++) step(bot, state, i, 6500000000);
  const holding = { cash_quote_units: '350000000', positions: [{ symbol: 'CBBTC', qty: '1000000', cost_quote_units: '650000000' }] };
  step(bot, state, 60, 6500000000, holding);
  const orders = step(bot, state, 70, 6300000000, holding);
  assert.equal(bot.history.length, 1);
  assert.equal(orders[0]?.side, 'sell');
  assert.equal(orders[0]?.qty, '1000000');
});

test('the equity circuit breaker latches even after an account recovery', () => {
  const bot = new Tideguard(), state = new BarsState(hello);
  step(bot, state, 0, 6500000000);
  step(bot, state, 1, 6500000000, { equity_quote_units: '900000000' });
  for (let i = 2; i < 100; i++) assert.deepEqual(step(bot, state, i, 6500000000 * 1.001 ** i), []);
  assert.equal(bot.halted, true);
});

test('late entries stop before the final half hour', () => {
  const bot = new Tideguard(), state = new BarsState(hello);
  for (let i = 1350; i < 1439; i++) {
    const orders = step(bot, state, i, 6500000000 * 1.001 ** (i - 1350));
    if (i >= 1410) assert.deepEqual(orders, []);
  }
});

test('a quiet race has a single small participation position once filled', () => {
  const bot = new Tideguard(), state = new BarsState(hello);
  let order;
  for (let i = 0; i <= 1200; i++) order = step(bot, state, i, 6500000000)[0];
  assert.equal(order?.notional_quote_units, '2000000');
  const orders = step(bot, state, 1201, 6500000000, {
    cash_quote_units: '998000000', positions: [{ symbol: 'CBBTC', qty: '3074', cost_quote_units: '2000000' }],
  });
  assert.deepEqual(orders, []);
  assert.equal(bot.hasTraded, true);
});

test('decisions depend only on the observed prefix and repeat byte for byte', () => {
  const run = (futureRate) => {
    const bot = new Tideguard(), state = new BarsState(hello), replies = [];
    for (let i = 0; i < 160; i++) {
      const price = 6500000000 * (i < 100 ? 1.001 ** i : 1.001 ** 99 * futureRate ** (i - 99));
      replies.push(JSON.stringify(step(bot, state, i, price)));
    }
    return replies;
  };
  const rising = run(1.002);
  assert.deepEqual(rising, run(1.002));
  assert.deepEqual(rising.slice(0, 100), run(0.998).slice(0, 100));
});
