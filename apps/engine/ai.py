"""자연어 → 전략 DSL 생성.

Anthropic API로 사용자의 자연어 설명을 전략 DSL(JSON)로 변환한다.
- 프롬프트에 지표 레지스트리 스키마를 그대로 주입하므로, 지표를 추가하면 AI도 즉시 알게 된다
- 모델 출력은 반드시 StrategyDSL 스키마 검증을 통과해야 하며,
  실패하면 오류 내용을 되돌려 주고 1회 재시도한다
"""

import json
import os

from dotenv import load_dotenv
from pydantic import ValidationError

from dsl import indicators
from dsl.schema import StrategyDSL

load_dotenv()

MODEL = "claude-opus-4-8"


class AIUnavailable(Exception):
    """API 키 미설정 등으로 AI 기능을 쓸 수 없는 상태."""


class GenerationFailed(Exception):
    """모델이 유효한 DSL을 만들지 못한 경우."""


def _system_prompt() -> str:
    schema = json.dumps(indicators.schema(), ensure_ascii=False, indent=1)
    return f"""당신은 퀀트 트레이딩 전략을 JSON DSL로 변환하는 전문가입니다.
사용자의 자연어 설명을 아래 DSL로 변환하세요. 응답은 JSON 하나만 출력합니다 — 설명, 마크다운 코드펜스, 기타 텍스트 금지.

## DSL 형식
{{
  "version": 1,
  "name": "전략 이름 (한국어, 60자 이내)",
  "direction": "long" | "short",  // long=상승에 베팅(매수 진입), short=하락에 베팅(공매도 진입). 기본값 long
  "entry": <조건>,   // 진입 조건
  "exit": <조건>,    // 청산 조건
  "risk": {{
    "stop_loss_pct": 숫자 | null,
    "take_profit_pct": 숫자 | null,
    "size_pct": 1~100,   // 진입 시 투입 자본 비중 %. 기본 100. "자본의 30%만" 같은 요청 시 설정
    "intrabar": true | false  // 손절/익절을 장중 저가/고가 터치로 판정. 기본 false(종가 기준). "장중 손절" 요청 시 true
  }}
}}

<조건>은 다음 중 하나:
- 비교: {{"op": "gt"|"lt"|"cross_above"|"cross_below", "left": <피연산자>, "right": <피연산자>}}
- 논리: {{"op": "and"|"or", "args": [<조건>, ...]}}  (최대 8개)
- 부정: {{"op": "not", "arg": <조건>}}

<피연산자>는 다음 중 하나:
- 지표: {{"ind": "지표ID", "params": {{"파라미터": 값}}}}
- 상수: {{"const": 숫자}}

## 사용 가능한 지표 (이것만 사용 가능)
{schema}

## 규칙
- 지표 ID와 파라미터는 위 목록에 있는 것만 사용. 목록에 없는 지표가 필요하면 가장 가까운 대체 지표로 구성
- cross_above/cross_below의 양쪽이 모두 상수일 수 없음
- direction 기본값은 "long". 사용자가 하락 베팅·공매도·숏을 요청하면 "short"로 설정하고, 조건은 뒤집지 말고 하락 신호를 그대로 진입 조건으로 사용
  (direction="short"일 때 stop_loss_pct는 가격이 오를 때, take_profit_pct는 가격이 내릴 때 발동됨을 감안해 자연스러운 조건을 구성)
- 모든 조건은 봉 종가 시점에 평가됨. 손절/익절이 명시되면 risk에 넣고, 없으면 null
- 사용자가 기간·수치를 말하지 않으면 지표의 default 값을 사용

## 예시
입력: "RSI가 30 밑으로 떨어지면 사고 70 넘으면 팔아줘. 손절은 5%"
출력: {{"version": 1, "name": "RSI 과매도 반등", "direction": "long", "entry": {{"op": "lt", "left": {{"ind": "rsi", "params": {{"period": 14}}}}, "right": {{"const": 30}}}}, "exit": {{"op": "gt", "left": {{"ind": "rsi", "params": {{"period": 14}}}}, "right": {{"const": 70}}}}, "risk": {{"stop_loss_pct": 5, "take_profit_pct": null}}}}

입력: "20일 최저가를 하향 돌파하면 숏 진입하고, 20일 최고가를 상향 돌파하면 청산해줘"
출력: {{"version": 1, "name": "채널 하향 돌파 숏", "direction": "short", "entry": {{"op": "cross_below", "left": {{"ind": "close", "params": {{}}}}, "right": {{"ind": "lowest", "params": {{"period": 20}}}}}}, "exit": {{"op": "cross_above", "left": {{"ind": "close", "params": {{}}}}, "right": {{"ind": "highest", "params": {{"period": 20}}}}}}, "risk": {{"stop_loss_pct": null, "take_profit_pct": null}}}}"""


def _extract_json(text: str) -> dict:
    text = text.strip()
    if text.startswith("```"):
        text = text.split("```")[1]
        if text.startswith("json"):
            text = text[4:]
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end == -1:
        raise ValueError("응답에서 JSON을 찾지 못했습니다")
    return json.loads(text[start : end + 1])


def generate(prompt: str) -> StrategyDSL:
    if not os.environ.get("ANTHROPIC_API_KEY"):
        raise AIUnavailable(
            "ANTHROPIC_API_KEY가 설정되지 않았습니다. apps/engine/.env 파일에 키를 추가해 주세요."
        )

    import anthropic

    client = anthropic.Anthropic()
    system = _system_prompt()
    messages = [{"role": "user", "content": prompt.strip()[:2000]}]

    last_error = None
    for _ in range(2):  # 최초 1회 + 검증 실패 시 1회 재시도
        try:
            response = client.messages.create(
                model=MODEL,
                max_tokens=8192,
                thinking={"type": "adaptive"},
                system=system,
                messages=messages,
            )
        except anthropic.AuthenticationError:
            raise AIUnavailable("Anthropic API 키가 유효하지 않습니다.")
        except anthropic.RateLimitError:
            raise GenerationFailed("API 사용량 한도에 도달했습니다. 잠시 후 다시 시도해 주세요.")
        except anthropic.APIStatusError as e:
            raise GenerationFailed(f"Anthropic API 오류 (HTTP {e.status_code})")
        except anthropic.APIConnectionError:
            raise GenerationFailed("Anthropic API에 연결하지 못했습니다. 네트워크를 확인해 주세요.")

        if response.stop_reason == "refusal":
            raise GenerationFailed("요청이 거부되었습니다. 전략 설명을 바꿔서 다시 시도해 주세요.")

        text = next((b.text for b in response.content if b.type == "text"), "")
        try:
            return StrategyDSL.model_validate(_extract_json(text))
        except (ValueError, ValidationError) as e:
            last_error = e
            # 모델 응답과 오류를 대화에 붙여 1회 재시도
            messages = messages + [
                {"role": "assistant", "content": text or "(빈 응답)"},
                {
                    "role": "user",
                    "content": f"출력이 스키마 검증에 실패했습니다. 오류를 고쳐 JSON만 다시 출력하세요:\n{e}",
                },
            ]

    raise GenerationFailed(f"유효한 전략을 생성하지 못했습니다: {last_error}")
