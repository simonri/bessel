from enum import Enum


class AssetType(str, Enum):
  BOND = "bond"
  CRYPTO = "crypto"
  ETF = "etf"
  MUTUAL_FUND = "mutual_fund"
  OTHER = "other"
  REAL_ESTATE = "real_estate"
  STOCK = "stock"

  def __str__(self) -> str:
    return str(self.value)
