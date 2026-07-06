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

export type OptimizeResult = {
  strategy: StrategyMeta;
  evaluated: number;
  note: string;
  results: OptimizeRow[];
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

export type OptimizeRequest = Omit<BacktestRequest, "params" | "dsl">;

export async function runOptimize(req: OptimizeRequest): Promise<OptimizeResult> {
  return postJson("/optimize", req, "최적화 실패");
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
