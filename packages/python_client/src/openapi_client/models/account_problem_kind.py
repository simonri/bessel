from enum import StrEnum


class AccountProblemKind(StrEnum):
  BALANCE_MISMATCH = "balance_mismatch"
  IMPORT_DUE = "import_due"
  NOT_SHARED = "not_shared"
  NO_TRANSACTIONS = "no_transactions"
  RENEW_SOON = "renew_soon"
  SIGN_IN = "sign_in"
  STALE = "stale"
  SYNC_FAILED = "sync_failed"

  def __str__(self) -> str:
    return str(self.value)
