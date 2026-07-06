"""전략 DSL 스키마.

전략은 임의 코드가 아니라 이 스키마를 통과한 JSON만 실행된다.
- 참조 가능한 지표는 indicators.SPECS에 등록된 것뿐
- 파라미터는 스키마 범위로 클램프
따라서 AI가 생성하든 유저가 조립하든, 엔진에서 실행되는 것은 검증된 블록 조합뿐이다.

예시:
{
  "version": 1,
  "name": "RSI 과매도 반등",
  "entry": {"op": "lt", "left": {"ind": "rsi", "params": {"period": 14}}, "right": {"const": 30}},
  "exit":  {"op": "gt", "left": {"ind": "rsi", "params": {"period": 14}}, "right": {"const": 70}},
  "risk":  {"stop_loss_pct": 5}
}
"""

from typing import Annotated, Literal, Union

from pydantic import BaseModel, Field, field_validator, model_validator

from dsl import indicators


class IndicatorRef(BaseModel):
    ind: str
    params: dict[str, float] = {}

    @model_validator(mode="after")
    def _check(self):
        spec = indicators.SPECS.get(self.ind)
        if spec is None:
            valid = ", ".join(indicators.SPECS)
            raise ValueError(f"알 수 없는 지표 '{self.ind}'. 사용 가능: {valid}")
        keys = {p.key for p in spec.params}
        unknown = set(self.params) - keys
        if unknown:
            raise ValueError(f"지표 '{self.ind}'에 없는 파라미터: {sorted(unknown)} (사용 가능: {sorted(keys)})")
        # 범위 밖 값은 스키마 범위로 클램프
        for p in spec.params:
            if p.key in self.params:
                v = max(p.min, min(p.max, self.params[p.key]))
                self.params[p.key] = int(v) if p.type == "int" else v
        return self


class ConstRef(BaseModel):
    const: float


Operand = Union[IndicatorRef, ConstRef]


class Compare(BaseModel):
    op: Literal["gt", "lt", "cross_above", "cross_below"]
    left: Operand
    right: Operand

    @model_validator(mode="after")
    def _check(self):
        if self.op in ("cross_above", "cross_below"):
            if isinstance(self.left, ConstRef) and isinstance(self.right, ConstRef):
                raise ValueError("교차(cross) 조건의 양쪽이 모두 상수일 수 없습니다")
        return self


class Logic(BaseModel):
    op: Literal["and", "or"]
    args: list["Condition"] = Field(min_length=1, max_length=8)


class Not(BaseModel):
    op: Literal["not"]
    arg: "Condition"


Condition = Annotated[Union[Compare, Logic, Not], Field(discriminator="op")]

Logic.model_rebuild()
Not.model_rebuild()


class Risk(BaseModel):
    stop_loss_pct: float | None = Field(None, gt=0, le=90, description="진입가 대비 손절 % (종가 기준 판정)")
    take_profit_pct: float | None = Field(None, gt=0, le=1000, description="진입가 대비 익절 %")


class StrategyDSL(BaseModel):
    version: Literal[1] = 1
    name: str = "이름 없는 전략"
    direction: Literal["long", "short"] = "long"
    entry: Condition
    exit: Condition
    risk: Risk = Risk()

    @field_validator("name")
    @classmethod
    def _name(cls, v: str) -> str:
        v = v.strip()
        return v[:60] if v else "이름 없는 전략"
