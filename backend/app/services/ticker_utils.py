"""
Shared ticker normalisation utilities.
Used by all routers so the same rule applies everywhere.
"""


def normalize_symbol(symbol: str) -> str:
    """
    Normalise a raw ticker string.

    Rules (applied in order):
    1. Strip surrounding whitespace and uppercase the input.
    2. Pure 4-digit numeric string → Taiwan Stock Exchange code,
       append '.TW'.  e.g. '2330' → '2330.TW'
    3. Everything else is returned as-is (US tickers, or
       already-normalised '2330.TW' codes).
    """
    s = symbol.strip().upper()
    if s.isdigit() and len(s) == 4:
        return f"{s}.TW"
    return s
