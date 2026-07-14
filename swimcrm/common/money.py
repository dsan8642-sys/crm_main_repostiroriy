"""
Money as integer minor units + ISO currency code. NEVER float for money.

A Money value is (amount_minor: int, currency: str). Models store the two
columns directly (see billing/catalog); this module gives arithmetic and
locale-agnostic formatting helpers.
"""
from __future__ import annotations
from dataclasses import dataclass

MINOR_UNITS = {"PLN": 2, "EUR": 2, "USD": 2}
SYMBOLS = {"PLN": "zł", "EUR": "€", "USD": "$"}

# Supported ISO currencies as Django field choices — single source of truth.
CURRENCY_CHOICES = [(code, code) for code in MINOR_UNITS]


@dataclass(frozen=True)
class Money:
    amount_minor: int
    currency: str = "PLN"

    def __post_init__(self):
        if not isinstance(self.amount_minor, int):
            raise TypeError("amount_minor must be int (minor units, e.g. grosze)")
        if self.currency not in MINOR_UNITS:
            raise ValueError(f"Unsupported currency: {self.currency}")

    def _check(self, other: "Money"):
        if self.currency != other.currency:
            raise ValueError("Currency mismatch")

    def __add__(self, other: "Money") -> "Money":
        self._check(other)
        return Money(self.amount_minor + other.amount_minor, self.currency)

    def __sub__(self, other: "Money") -> "Money":
        self._check(other)
        return Money(self.amount_minor - other.amount_minor, self.currency)

    @property
    def is_zero(self) -> bool:
        return self.amount_minor == 0

    @property
    def is_negative(self) -> bool:
        return self.amount_minor < 0

    def format(self) -> str:
        exp = MINOR_UNITS[self.currency]
        major, minor = divmod(abs(self.amount_minor), 10 ** exp)
        sign = "-" if self.amount_minor < 0 else ""
        sym = SYMBOLS.get(self.currency, self.currency)
        return f"{sign}{major},{str(minor).zfill(exp)} {sym}"

    def __str__(self) -> str:
        return self.format()
