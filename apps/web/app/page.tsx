import Link from "next/link";

const FEATURES: { title: string; desc: string }[] = [
  { title: "프리셋 전략 5종", desc: "골든크로스·RSI·볼린저밴드·MACD·모멘텀을 바로 실행" },
  { title: "AI 전략 생성", desc: "자연어 설명을 Claude가 전략 DSL로 변환, 실행 전 스키마 검증" },
  { title: "블록 빌더 · JSON 편집", desc: "지표를 조합해 조립하거나 DSL을 직접 작성 — 롱/숏 모두 지원" },
  { title: "과적합 진단 (IS/OOS)", desc: "학습·검증 구간을 나눠 평가하고 과적합 위험도를 판정" },
  { title: "파라미터 최적화", desc: "그리드 서치로 최적 조합 탐색, 2D 히트맵으로 안정성 확인" },
  { title: "워크포워드 · 몬테카를로", desc: "폴드별 재검증과 거래 재배열 시뮬레이션으로 신뢰도 검증" },
  { title: "멀티 심볼 검증", desc: "같은 전략을 여러 종목에 동시 적용해 범용성 확인" },
  { title: "전략 저장 · 비교", desc: "마음에 든 전략을 저장하고 여러 개를 한 번에 비교" },
];

export default function Home() {
  return (
    <div className="mx-auto flex w-full max-w-screen-xl flex-col gap-16 px-6 py-16 sm:py-24">
      <section className="flex flex-col items-start gap-5">
        <span className="rounded-full border border-black/10 px-3 py-1 text-xs font-medium text-neutral-500 dark:border-white/10">
          주식 · 크립토 퀀트 백테스트
        </span>
        <h1 className="max-w-2xl text-3xl font-bold leading-tight tracking-tight sm:text-5xl">
          전략을 만들고,{" "}
          <span className="text-[#2a78d6] dark:text-[#3987e5]">과거로 검증</span>
          하세요.
        </h1>
        <p className="max-w-xl text-sm leading-relaxed text-neutral-500 sm:text-base">
          프리셋을 고르거나, AI에게 설명하거나, 블록을 조립해 전략을 만들고
          주식·크립토 시세로 백테스트합니다. 과적합 진단·워크포워드·몬테카를로까지 —
          숫자 하나만 보고 전략을 믿지 않도록 설계했습니다.
        </p>
        <div className="mt-2 flex flex-wrap gap-3">
          <Link
            href="/backtest"
            className="rounded-md bg-neutral-900 px-5 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-85 dark:bg-white dark:text-neutral-900"
          >
            백테스트 시작하기
          </Link>
          <Link
            href="/strategies"
            className="rounded-md border border-black/20 px-5 py-2.5 text-sm font-medium text-neutral-700 transition-opacity hover:opacity-80 dark:border-white/20 dark:text-neutral-200"
          >
            저장된 전략 보기
          </Link>
        </div>
      </section>

      <section>
        <h2 className="mb-5 text-sm font-semibold text-neutral-500">주요 기능</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="rounded-lg border border-black/10 bg-[#fcfcfb] p-4 transition-colors hover:border-[#2a78d6]/40 dark:border-white/10 dark:bg-[#1a1a19] dark:hover:border-[#3987e5]/40"
            >
              <h3 className="text-sm font-semibold">{f.title}</h3>
              <p className="mt-1.5 text-xs leading-relaxed text-neutral-500">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-black/10 bg-[#fcfcfb] p-6 dark:border-white/10 dark:bg-[#1a1a19] sm:p-8">
        <h2 className="text-sm font-semibold text-neutral-500">시작하는 방법</h2>
        <ol className="mt-4 flex flex-col gap-3 text-sm leading-relaxed sm:grid sm:grid-cols-3 sm:gap-6">
          <li>
            <span className="mb-1 block text-xs font-semibold text-[#2a78d6] dark:text-[#3987e5]">
              1. 전략 선택
            </span>
            프리셋을 고르거나 AI·블록·JSON으로 나만의 전략을 만듭니다.
          </li>
          <li>
            <span className="mb-1 block text-xs font-semibold text-[#2a78d6] dark:text-[#3987e5]">
              2. 백테스트 · 검증
            </span>
            종목·기간을 정해 실행하고, 과적합 진단·최적화·워크포워드·몬테카를로로 신뢰도를 확인합니다.
          </li>
          <li>
            <span className="mb-1 block text-xs font-semibold text-[#2a78d6] dark:text-[#3987e5]">
              3. 저장 · 비교
            </span>
            마음에 든 전략을 저장하고, 여러 종목·전략을 한 번에 비교합니다.
          </li>
        </ol>
      </section>
    </div>
  );
}
