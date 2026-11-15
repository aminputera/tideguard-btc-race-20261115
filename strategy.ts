// Causal, long-only trend following. No dates, price levels or future bars are stored.
export class Tideguard {
  constructor(options = {}) {
    this.options = { fast: 12, slow: 48, horizon: 24, momentum: 0.008,
      efficiency: 0.25, trail: 0.006, stop: 0.009, cooldown: 15,
      exposure: 0.95, impact: 0.002, ...options };
    this.history = [];
    this.fast = null;
    this.slow = null;
    this.lastExit = -10000;
    this.holding = false;
    this.peak = 0;
    this.entry = 0;
    this.enteredAt = 0;
    this.lastTime = null;
    this.equityPeak = null;
    this.halted = false;
    this.hasTraded = false;
  }

  decide(state, batch) {
    const bar = batch.bars.find((b) => b.symbol === 'CBBTC');
    if (!bar) return [];
    const price = Number(bar.c);
    const o = this.options;
    // A missing minute never masquerades as an adjacent observation.
    if (this.lastTime !== null && bar.t - this.lastTime !== 60000) {
      this.history = [];
      this.fast = null;
      this.slow = null;
    }
    this.lastTime = bar.t;
    this.fast = this.fast === null ? price : this.fast + 2 / (o.fast + 1) * (price - this.fast);
    this.slow = this.slow === null ? price : this.slow + 2 / (o.slow + 1) * (price - this.slow);
    this.history.push(price);
    if (this.history.length > 256) this.history.shift();
    const position = state.positions.get('CBBTC');
    if (position && !this.holding) {
      const spec = state.symbols.get('CBBTC');
      const scale = 10 ** (spec.qty_scale + spec.price_scale - state.hello.capital.quote_scale);
      this.entry = Number(position.cost) / Number(position.qty) * scale;
      this.peak = price;
      this.enteredAt = batch.seq;
      this.hasTraded = true;
    }
    if (!position && this.holding) this.lastExit = batch.seq;
    this.holding = Boolean(position);
    this.equityPeak = Math.max(this.equityPeak ?? Number(state.equity), Number(state.equity));
    if (Number(state.equity) < this.equityPeak * 0.92) this.halted = true;

    const older = this.history[this.history.length - 1 - o.horizon] ?? price;
    const momentum = price / older - 1;
    let path = 0;
    for (let i = Math.max(1, this.history.length - o.horizon); i < this.history.length; i++) {
      path += Math.abs(Math.log(this.history[i] / this.history[i - 1]));
    }
    const efficiency = path > 0 ? Math.abs(Math.log(price / older)) / path : 0;
    if (position) {
      this.peak = Math.max(this.peak, price);
      const stop = price < this.entry * (1 - o.stop);
      const trailing = price < this.peak * (1 - o.trail);
      const lostTrend = batch.seq - this.enteredAt >= 8 && this.fast < this.slow && momentum < 0;
      // Exits stay active while the indicators rebuild after a feed gap.
      if (this.halted || stop || trailing || lostTrend) {
        return [{ side: 'sell', symbol: 'CBBTC', qty: position.qty, max_slippage_bps: 1000 }];
      }
      return [];
    }
    if (this.halted || state.warmingUp || this.history.length < Math.max(o.slow, o.horizon) + 1) return [];
    if (batch.seq - this.lastExit < o.cooldown) return [];
    const elapsed = (batch.t - state.hello.first_close_ms) / 60000 - state.warmupBars;
    // Do not open a position that has less than half an hour to recover its costs.
    if (elapsed >= 1410) return [];
    const depth = Number(bar.c_depth[0]);
    const size = Math.floor(Math.min(Number(state.cash), Number(state.equity) * o.exposure,
      Number(state.weightRoom('CBBTC')), depth * o.impact));
    const costFloor = 1.5 * (2 * (state.hello.fees.fee_bps + state.hello.fees.slippage_bps) / 10000 + 2 * size / depth);
    if (this.fast > this.slow * 1.001 && price > this.fast && momentum > Math.max(o.momentum, costFloor) && efficiency > o.efficiency) {
      if (size >= Number(state.hello.fees.min_notional_quote_units)) {
        return [{ side: 'buy', symbol: 'CBBTC', notional_quote_units: String(size), max_slippage_bps: 150 }];
      }
    }
    // A quiet race still gets one small participation position, without risking the bankroll.
    if (!this.hasTraded && elapsed >= 1200) {
      const probe = Math.min(size, Math.floor(Number(state.equity) * 0.002));
      if (probe >= Number(state.hello.fees.min_notional_quote_units)) {
        return [{ side: 'buy', symbol: 'CBBTC', notional_quote_units: String(probe), max_slippage_bps: 150 }];
      }
    }
    return [];
  }
}
