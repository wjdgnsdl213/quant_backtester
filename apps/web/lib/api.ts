export const ENGINE_URL =
  process.env.NEXT_PUBLIC_ENGINE_URL ?? "http://localhost:8000";

export type ParamSpec = {
  key: string;
  label: string;
  type: "int" | "float";
  default: number;
  min: number;
  max: number;
  step: number;
};

export type StrategyMeta = {
  id: string;
  name: string;
  description: string;
  params: ParamSpec[];
};

export type Metrics = {
  total_return_pct: number;
  benchmark_return_pct: number;
  cagr_pct: number;
  sharpe: number;
  sortino: number;
  volatility_pct: number;
  mdd_pct: number;
  num_trades: number;
  win_rate_pct: number;
  profit_factor: number | null;
  avg_trade_pct: number;
  exposure_pct: number;
};

export type Trade = {
  entry_time: string;
  exit_time: string | null;
  entry_price: number;
  exit_price: number;
  return_pct: number;
  holding_bars: number;
  direction: "long" | "short";
};

export type BacktestResult = {
  symbol: string;
  source: "stock" | "crypto";
  interval: string;
  strategy: { id: string; name: string; params: Record<string, number> };
  metrics: Metrics;
  split: SplitInfo;
  series: {
    time: string[];
    equity: number[];
    benchmark: number[];
    drawdown: number[];
  };
  ohlcv: {
    time: string[];
    open: number[];
    high: number[];
    low: number[];
    close: number[];
    volume: number[];
  };
  overlays: { label: string; values: (number | null)[] }[];
  trades: Trade[];
};

export type StrategyDSL = Record<string, unknown>;

export type GeneratedStrategy = {
  dsl: StrategyDSL;
  name: string;
  summary: string;
};

export type SavedStrategy = {
  id: number;
  name: string;
  summary: string;
  dsl: StrategyDSL;
  created_at: string;
};

export type IndicatorSpec = {
  id: string;
  label: string;
  description: string;
  unit: "price" | "percent" | "volume";
  params: ParamSpec[];
};

export type OptimizeRow = {
  params: Record<string, number>;
  total_return_pct: number;
  sharpe: number;
  mdd_pct: number;
  num_trades: number;
  is_sharpe: number | null;
  is_return_pct: number | null;
  oos_sharpe: number | null;
  oos_return_pct: number | null;
  overfit_risk: "low" | "medium" | "high";
};

export type OptimizeAllRow = {
  params: Record<string, number>;
  is_sharpe: number | null;
  oos_sharpe: number | null;
  total_return_pct: number;
  mdd_pct: number;
};

export type OptimizeResult = {
  strategy: StrategyMeta;
  evaluated: number;
  note: string;
  results: OptimizeRow[];
  all_results: OptimizeAllRow[];
};

export type CompareItem = {
  id: number;
  name: string;
  summary: string;
  equity: number[];
  metrics: Metrics;
};

export type CompareResult = {
  symbol: string;
  interval: string;
  time: string[];
  benchmark: number[];
  items: CompareItem[];
};

export type SegmentMetrics = {
  return_pct: number;
  sharpe: number;
  mdd_pct: number;
  num_trades: number;
  win_rate_pct: number;
};

export type SplitInfo = {
  available: boolean;
  split_date?: string;
  in_sample?: SegmentMetrics;
  out_of_sample?: SegmentMetrics;
  overfit_risk?: "low" | "medium" | "high";
  overfit_reason?: string;
};

export type BacktestRequest = {
  source: "stock" | "crypto";
  symbol: string;
  interval: string;
  start: string;
  end: string;
  strategy: string;
  params: Record<string, number>;
  dsl?: StrategyDSL | null;
  fee: number;
  slippage: number;
  initial_capital: number;
};

export async function fetchStrategies(): Promise<StrategyMeta[]> {
  const res = await fetch(`${ENGINE_URL}/strategies`);
  if (!res.ok) throw new Error("전략 목록을 불러오지 못했습니다");
  return res.json();
}

async function postJson<T>(path: string, body: unknown, failMsg: string): Promise<T> {
  const res = await fetch(`${ENGINE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new Error(detail?.detail ?? `${failMsg} (HTTP ${res.status})`);
  }
  return res.json();
}

export async function fetchIndicators(): Promise<IndicatorSpec[]> {
  const res = await fetch(`${ENGINE_URL}/indicators`);
  if (!res.ok) throw new Error("지표 목록을 불러오지 못했습니다");
  return res.json();
}

export async function validateDsl(dsl: StrategyDSL): Promise<GeneratedStrategy> {
  return postJson("/dsl/validate", { dsl }, "전략 검증 실패");
}

export type OptimizeRequest = Omit<BacktestRequest, "params" | "dsl"> & {
  grid?: Record<string, number[]> | null;
  sort_by?: "is_sharpe" | "is_return_pct" | "total_return_pct" | "mdd_pct";
};

export async function runOptimize(req: OptimizeRequest): Promise<OptimizeResult> {
  return postJson("/optimize", req, "최적화 실패");
}

export type WalkforwardFold = {
  fold: number;
  train_start: string;
  train_end: string;
  test_start: string;
  test_end: string;
  best_params: Record<string, number>;
  is_sharpe: number;
  oos: { return_pct: number; sharpe: number; mdd_pct: number };
};

export type WalkforwardResult = {
  strategy: StrategyMeta;
  n_folds: number;
  folds: WalkforwardFold[];
  oos: {
    return_pct: number;
    sharpe: number;
    mdd_pct: number;
    positive_folds: number;
    verdict: string;
  };
  series: { time: string[]; equity: number[] };
  note: string;
};

export type WalkforwardRequest = OptimizeRequest & { n_folds?: number };

export async function runWalkforward(req: WalkforwardRequest): Promise<WalkforwardResult> {
  return postJson("/walkforward", req, "워크포워드 분석 실패");
}

export type MonteCarloResult = {
  strategy: { id: string; name: string; params: Record<string, number> };
  n_sims: number;
  n_trades: number;
  envelope: {
    step: number[];
    p5: number[];
    p25: number[];
    p50: number[];
    p75: number[];
    p95: number[];
  };
  stats: {
    final_p5: number;
    final_p25: number;
    final_p50: number;
    final_p75: number;
    final_p95: number;
    prob_loss: number;
    mdd_p95: number;
  };
  note: string;
};

export type MonteCarloRequest = BacktestRequest & { n_sims?: number };

export async function runMonteCarlo(req: MonteCarloRequest): Promise<MonteCarloResult> {
  return postJson("/montecarlo", req, "몬테카를로 시뮬레이션 실패");
}

export type MultiSymbolItem = {
  symbol: string;
  metrics: Metrics;
  overfit_risk: "low" | "medium" | "high" | null;
  series: { time: string[]; equity_norm: number[] };
};

export type MultiSymbolResult = {
  strategy: { id: string; name: string; params: Record<string, number> };
  interval: string;
  items: MultiSymbolItem[];
  errors: { symbol: string; detail: string }[];
};

export type MultiSymbolRequest = {
  source: "stock" | "crypto";
  symbols: string[];
  interval: string;
  start: string;
  end: string;
  strategy: string;
  params: Record<string, number>;
  dsl?: StrategyDSL | null;
  fee: number;
  slippage: number;
  initial_capital: number;
};

export async function runMultiSymbol(req: MultiSymbolRequest): Promise<MultiSymbolResult> {
  return postJson("/multisymbol", req, "멀티 심볼 검증 실패");
}

export type CompareRequest = {
  source: "stock" | "crypto";
  symbol: string;
  interval: string;
  start: string;
  end: string;
  ids: number[];
  fee: number;
  slippage: number;
  initial_capital: number;
};

export async function runCompare(req: CompareRequest): Promise<CompareResult> {
  return postJson("/compare", req, "전략 비교 실패");
}

export type Watch = {
  id: number;
  strategy_id: number;
  strategy_name: string;
  source: "stock" | "crypto";
  symbol: string;
  interval: string;
  created_at: string;
};

export type SignalStatus = "entry_signal" | "exit_signal" | "holding" | "idle" | "error";

export type SignalResult = {
  id: number;
  strategy_id: number;
  strategy_name: string;
  source: "stock" | "crypto";
  symbol: string;
  interval: string;
  status: SignalStatus;
  direction?: "long" | "short";
  holding_bars?: number;
  last_bar?: string;
  last_close?: number;
  detail?: string;
};

export async function fetchWatches(): Promise<Watch[]> {
  const res = await fetch(`${ENGINE_URL}/watches`);
  if (!res.ok) throw new Error("감시 목록을 불러오지 못했습니다");
  return res.json();
}

export async function addWatch(req: {
  strategy_id: number;
  source: "stock" | "crypto";
  symbol: string;
  interval: string;
}): Promise<{ id: number }> {
  return postJson("/watches", req, "감시 추가 실패");
}

export async function deleteWatch(id: number): Promise<void> {
  const res = await fetch(`${ENGINE_URL}/watches/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("감시 삭제에 실패했습니다");
}

export async function checkSignals(): Promise<{ results: SignalResult[] }> {
  return postJson("/signals/check", {}, "시그널 확인 실패");
}

export async function fetchSavedStrategies(): Promise<SavedStrategy[]> {
  const res = await fetch(`${ENGINE_URL}/strategies/saved`);
  if (!res.ok) throw new Error("저장된 전략을 불러오지 못했습니다");
  return res.json();
}

export async function saveStrategy(dsl: StrategyDSL): Promise<SavedStrategy> {
  const res = await fetch(`${ENGINE_URL}/strategies/saved`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dsl }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.detail ?? "전략 저장에 실패했습니다");
  }
  return res.json();
}

export async function deleteSavedStrategy(id: number): Promise<void> {
  const res = await fetch(`${ENGINE_URL}/strategies/saved/${id}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error("전략 삭제에 실패했습니다");
}

export async function generateStrategy(prompt: string): Promise<GeneratedStrategy> {
  const res = await fetch(`${ENGINE_URL}/ai/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.detail ?? `전략 생성 실패 (HTTP ${res.status})`);
  }
  return res.json();
}

export async function runBacktest(req: BacktestRequest): Promise<BacktestResult> {
  const res = await fetch(`${ENGINE_URL}/backtest`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.detail ?? `백테스트 실패 (HTTP ${res.status})`);
  }
  return res.json();
}
