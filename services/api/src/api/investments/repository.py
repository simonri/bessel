from uuid import UUID

from api.common.repository.base import RepositoryBase, RepositoryIDMixin
from api.models.security import Security
from api.models.security_price import SecurityPrice
from api.models.trade import Trade


class SecurityRepository(RepositoryBase[Security], RepositoryIDMixin[Security, UUID]):
  model = Security


class TradeRepository(RepositoryBase[Trade], RepositoryIDMixin[Trade, UUID]):
  model = Trade


class SecurityPriceRepository(RepositoryBase[SecurityPrice], RepositoryIDMixin[SecurityPrice, UUID]):
  model = SecurityPrice
