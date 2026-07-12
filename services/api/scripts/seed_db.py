"""
Seed the database with representative data for local development.
Truncates all data and rebuilds from scratch.

Run: cd services/api && uv run python -m scripts.seed_db
"""

import asyncio
import hashlib
import sys
from datetime import UTC, date, datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

from api.models import ActivityEvent, BankAccount, Category, Place, Project, Security, SecurityPrice, Task, Trade, Transaction
from api.models.security import AssetType
from api.models.trade import TradeType
from api.models.transaction import TransactionDirection
from api.settings import settings
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

TODAY = date(2026, 6, 15)
NOW = datetime(2026, 6, 15, 12, 0, 0, tzinfo=UTC)

HEARTBEAT = 300  # seconds between activity events


def _activity_blocks(day: date, blocks: list[tuple]) -> list[tuple]:
  """Generate (ts, state, app_class) events from (start_h, end_h, app) block specs."""
  base = datetime(day.year, day.month, day.day, tzinfo=UTC)
  events: list[tuple] = []
  for blk in blocks:
    start_h, end_h, app_class = blk[0], blk[1], blk[2]
    t = int((base + timedelta(hours=start_h)).timestamp())
    end_t = int((base + timedelta(hours=end_h)).timestamp())
    while t < end_t:
      events.append((t, "active", app_class))
      t += HEARTBEAT
  return events


def d(days_ago: int) -> date:
  return TODAY - timedelta(days=days_ago)


def _hash(s: str) -> str:
  return hashlib.sha256(s.encode()).hexdigest()[:64]


# ── Categories ────────────────────────────────────────────────────────────────

PARENT_CATS = [
  {"slug": "income", "name": "Income", "color": "#22c55e", "excluded": True},
  {"slug": "food", "name": "Food & Dining", "color": "#f97316", "excluded": False},
  {"slug": "housing", "name": "Housing", "color": "#3b82f6", "excluded": False},
  {"slug": "transport", "name": "Transport", "color": "#14b8a6", "excluded": False},
  {"slug": "shopping", "name": "Shopping", "color": "#a855f7", "excluded": False},
  {"slug": "health", "name": "Health", "color": "#ef4444", "excluded": False},
  {"slug": "entertainment", "name": "Entertainment", "color": "#ec4899", "excluded": False},
  {"slug": "travel", "name": "Travel", "color": "#eab308", "excluded": False},
  {"slug": "education", "name": "Education", "color": "#6366f1", "excluded": False},
  {"slug": "transfer", "name": "Transfers", "color": "#6b7280", "excluded": True},
]

CHILD_CATS = [
  {"slug": "salary", "name": "Salary", "color": "#22c55e", "parent": "income"},
  {"slug": "freelance", "name": "Freelance", "color": "#4ade80", "parent": "income"},
  {"slug": "groceries", "name": "Groceries", "color": "#fb923c", "parent": "food"},
  {"slug": "restaurants", "name": "Restaurants", "color": "#f97316", "parent": "food"},
  {"slug": "coffee", "name": "Coffee & Cafes", "color": "#fdba74", "parent": "food"},
  {"slug": "rent", "name": "Rent", "color": "#60a5fa", "parent": "housing"},
  {"slug": "utilities", "name": "Utilities", "color": "#93c5fd", "parent": "housing"},
  {"slug": "internet", "name": "Internet & Phone", "color": "#bfdbfe", "parent": "housing"},
  {"slug": "fuel", "name": "Fuel", "color": "#2dd4bf", "parent": "transport"},
  {"slug": "transit", "name": "Public Transit", "color": "#5eead4", "parent": "transport"},
  {"slug": "gym", "name": "Gym & Fitness", "color": "#f87171", "parent": "health"},
  {"slug": "pharmacy", "name": "Pharmacy", "color": "#fca5a5", "parent": "health"},
  {"slug": "streaming", "name": "Streaming", "color": "#f9a8d4", "parent": "entertainment"},
  {"slug": "events", "name": "Events", "color": "#ec4899", "parent": "entertainment"},
  {"slug": "clothing", "name": "Clothing", "color": "#c084fc", "parent": "shopping"},
  {"slug": "electronics", "name": "Electronics", "color": "#a855f7", "parent": "shopping"},
]


async def seed() -> None:
  dsn = settings.get_postgres_dsn("asyncpg")
  engine = create_async_engine(dsn)
  async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)  # type: ignore[call-overload]

  async with async_session() as session:
    # ── 1. Truncate ───────────────────────────────────────────────────────
    for table in [
      "activity_events",
      "tasks",
      "projects",
      "places",
      "trades",
      "security_prices",
      "securities",
      "transactions",
      "raw_transactions",
      "import_batches",
      "bank_accounts",
      "categories",
    ]:
      await session.execute(text(f'TRUNCATE TABLE "{table}" CASCADE'))
    await session.commit()
    print("Truncated all tables.")

    # ── 2. Categories ─────────────────────────────────────────────────────
    cat_map: dict[str, Category] = {}
    for c in PARENT_CATS:
      obj = Category(name=c["name"], slug=c["slug"], color=c["color"], excluded=c["excluded"])
      session.add(obj)
      cat_map[c["slug"]] = obj
    await session.flush()

    for c in CHILD_CATS:
      obj = Category(
        name=c["name"],
        slug=c["slug"],
        color=c["color"],
        excluded=False,
        parent_id=cat_map[c["parent"]].id,
      )
      session.add(obj)
      cat_map[c["slug"]] = obj
    await session.flush()
    print(f"Seeded {len(cat_map)} categories.")

    # ── 3. Bank accounts ──────────────────────────────────────────────────
    acc_checking = BankAccount(
      name="DNB Brukskonto",
      currency="NOK",
      base_balance=8_500_000,  # 85 000 NOK in øre
      subtype="checking",
    )
    acc_savings = BankAccount(
      name="DNB Sparekonto",
      currency="NOK",
      base_balance=25_000_000,  # 250 000 NOK in øre
      subtype="savings",
    )
    acc_invest = BankAccount(name="Nordnet", currency="NOK", base_balance=0, subtype="investment")
    session.add_all([acc_checking, acc_savings, acc_invest])
    await session.flush()
    print("Seeded 3 bank accounts.")

    # ── 4. Transactions ───────────────────────────────────────────────────
    # All amounts in minor units (øre = NOK * 100)
    tx_list: list[Transaction] = []
    n = 0

    def tx(*, account: BankAccount, cat: str, tx_date: date, desc: str, amount_nok: float, direction: TransactionDirection) -> Transaction:
      nonlocal n
      n += 1
      return Transaction(
        amount=round(amount_nok * 100),
        currency="NOK",
        transaction_date=tx_date,
        direction=direction,
        description=desc,
        dedup_hash=_hash(f"seed:{n}:{desc}:{tx_date}"),
        bank_account_id=account.id,
        category_id=cat_map[cat].id,
      )

    def credit(*, account: BankAccount, cat: str, tx_date: date, desc: str, amount_nok: float) -> Transaction:
      return tx(account=account, cat=cat, tx_date=tx_date, desc=desc, amount_nok=amount_nok, direction=TransactionDirection.credit)

    def debit(*, account: BankAccount, cat: str, tx_date: date, desc: str, amount_nok: float) -> Transaction:
      return tx(account=account, cat=cat, tx_date=tx_date, desc=desc, amount_nok=amount_nok, direction=TransactionDirection.debit)

    # Monthly recurring — 3 months
    for m in range(3):
      month_start = TODAY.replace(day=1) - timedelta(days=m * 30)
      off = timedelta(days=0)
      tx_list += [
        credit(account=acc_checking, cat="salary", tx_date=month_start + off, desc="LØNN ARBEIDSGIVER AS", amount_nok=62_000),
        debit(account=acc_checking, cat="rent", tx_date=month_start + off, desc="HUSLEIE BOLIGER AS", amount_nok=13_500),
        debit(account=acc_checking, cat="internet", tx_date=month_start + timedelta(days=2), desc="TELENOR INTERNETT", amount_nok=699),
        debit(account=acc_checking, cat="internet", tx_date=month_start + timedelta(days=2), desc="TELENOR MOBIL", amount_nok=549),
        debit(account=acc_checking, cat="gym", tx_date=month_start + timedelta(days=3), desc="SATS TRENINGSSENTER", amount_nok=449),
        debit(account=acc_checking, cat="streaming", tx_date=month_start + timedelta(days=5), desc="SPOTIFY PREMIUM", amount_nok=109),
        debit(account=acc_checking, cat="streaming", tx_date=month_start + timedelta(days=5), desc="NETFLIX", amount_nok=179),
      ]

    # Weekly groceries — 12 weeks
    stores = ["REMA 1000 STORGATA", "KIWI MARKVEIEN", "MENY OSLO S", "COOP EXTRA GRÜNERLØKKA"]
    amounts = [890, 1120, 750, 1340, 960, 820, 1050, 1200, 680, 1100, 940, 790]
    for week in range(12):
      tx_list.append(debit(account=acc_checking, cat="groceries", tx_date=d(week * 7 + 1), desc=stores[week % 4], amount_nok=amounts[week]))

    # Restaurants
    for days_ago, name, nok in [
      (3, "MAAEMO OSLO", 1850),
      (10, "ILLEGAL BURGER YOUNGSTORGET", 320),
      (17, "SMALHANS RESTAURANT", 680),
      (24, "TACO REPUBLICA", 215),
      (38, "ARAKATAKA", 890),
      (45, "SENTRALEN RESTAURANT", 1200),
      (52, "FISKERIET YOUNGSTORGET", 760),
      (60, "MORMORS STUE", 490),
      (72, "TORGGATA BOTANISKE", 320),
    ]:
      tx_list.append(debit(account=acc_checking, cat="restaurants", tx_date=d(days_ago), desc=name, amount_nok=nok))

    # Coffee
    for days_ago, name, nok in [
      (2, "TIM WENDELBOE", 58),
      (5, "FUGLEN OSLO", 64),
      (8, "JAVA ESPRESSOBAR", 52),
      (12, "STOCKFLETHS", 55),
      (15, "KAFFEBRENNERI OSLO", 61),
      (19, "HENDRIX IBSEN", 68),
      (22, "KAFFEBRENNERIET BOGSTADVEIEN", 54),
      (26, "TIM WENDELBOE", 58),
    ]:
      tx_list.append(debit(account=acc_checking, cat="coffee", tx_date=d(days_ago), desc=name, amount_nok=nok))

    # Shopping
    for days_ago, cat, name, nok in [
      (7, "clothing", "H&M OSLO CITY", 890),
      (14, "clothing", "ZARA KARL JOHANS GATE", 1240),
      (21, "electronics", "POWER AKER BRYGGE", 3490),
      (35, "clothing", "WEEKDAY OSLO", 650),
      (50, "electronics", "KOMPLETT.NO", 1290),
      (62, "clothing", "ARKET OSLO", 2100),
    ]:
      tx_list.append(debit(account=acc_checking, cat=cat, tx_date=d(days_ago), desc=name, amount_nok=nok))

    # Fuel
    for days_ago, name, nok in [
      (9, "CIRCLE K GRØNLAND", 1380),
      (23, "SHELL OSLO SENTRUM", 1240),
      (45, "ESSO TØYEN", 1520),
      (67, "CIRCLE K MAJORSTUEN", 1150),
    ]:
      tx_list.append(debit(account=acc_checking, cat="fuel", tx_date=d(days_ago), desc=name, amount_nok=nok))

    # Transit
    for days_ago, name, nok in [
      (1, "RUTER MOBILBILLETT", 37),
      (4, "RUTER MOBILBILLETT", 37),
      (7, "RUTER MOBILBILLETT", 37),
      (11, "RUTER MÅNEDSKORT", 870),
      (30, "RUTER MÅNEDSKORT", 870),
      (60, "RUTER MÅNEDSKORT", 870),
    ]:
      tx_list.append(debit(account=acc_checking, cat="transit", tx_date=d(days_ago), desc=name, amount_nok=nok))

    # Pharmacy
    for days_ago, name, nok in [
      (13, "APOTEK 1 OSLO S", 189),
      (44, "BOOTS APOTEK KARL JOHAN", 320),
    ]:
      tx_list.append(debit(account=acc_checking, cat="pharmacy", tx_date=d(days_ago), desc=name, amount_nok=nok))

    # Travel
    for days_ago, name, nok in [
      (40, "SAS BILLETTER OSLO-LONDON", 3200),
      (41, "AIRBNB LONDON", 4800),
      (58, "NSB OSLO-BERGEN", 890),
    ]:
      tx_list.append(debit(account=acc_checking, cat="travel", tx_date=d(days_ago), desc=name, amount_nok=nok))

    # Transfers + freelance
    tx_list += [
      debit(account=acc_checking, cat="transfer", tx_date=d(25), desc="OVERFØRING TIL SPAREKONTO", amount_nok=10_000),
      credit(account=acc_savings, cat="transfer", tx_date=d(25), desc="OVERFØRING FRA BRUKSKONTO", amount_nok=10_000),
      credit(account=acc_checking, cat="freelance", tx_date=d(20), desc="FAKTURAES CONSULTING SERVICES", amount_nok=15_000),
    ]

    for t in tx_list:
      session.add(t)
    await session.flush()
    print(f"Seeded {len(tx_list)} transactions.")

    # ── 5. Securities ─────────────────────────────────────────────────────
    sec_aapl = Security(name="Apple Inc.", ticker="AAPL", asset_type=AssetType.stock, currency="USD")
    sec_voo = Security(name="Vanguard S&P 500 ETF", ticker="VOO", asset_type=AssetType.etf, currency="USD")
    sec_btc = Security(name="Bitcoin", ticker="BTC", asset_type=AssetType.crypto, currency="USD")
    sec_eqnr = Security(name="Equinor ASA", ticker="EQNR", asset_type=AssetType.stock, currency="NOK")
    sec_sgsac = Security(name="Storebrand Global All Countries A", ticker="SGSAC", asset_type=AssetType.mutual_fund, currency="NOK")
    session.add_all([sec_aapl, sec_voo, sec_btc, sec_eqnr, sec_sgsac])
    await session.flush()
    print("Seeded 5 securities.")

    # ── 6. Security prices ────────────────────────────────────────────────
    # Prices in minor units (cents for USD, øre for NOK)
    for sec, price_points in [
      (sec_aapl, [(90, 18500), (75, 18700), (60, 19100), (45, 18900), (30, 19300), (15, 19600), (0, 19850)]),
      (sec_voo, [(90, 47800), (75, 48200), (60, 49100), (45, 48700), (30, 50100), (15, 51200), (0, 52300)]),
      (sec_btc, [(90, 6_500_000), (75, 6_200_000), (60, 6_800_000), (45, 7_100_000), (30, 6_900_000), (15, 7_300_000), (0, 6_750_000)]),
      (sec_eqnr, [(90, 27800), (75, 27200), (60, 28100), (45, 27900), (30, 28400), (15, 29100), (0, 28700)]),
      (sec_sgsac, [(90, 34200), (75, 34800), (60, 35100), (45, 35600), (30, 36200), (15, 36800), (0, 37100)]),
    ]:
      for days_ago, price in price_points:
        session.add(
          SecurityPrice(
            security_id=sec.id,
            price_date=d(days_ago),
            price_per_unit=price,
            currency=sec.currency,
          )
        )
    await session.flush()
    print("Seeded security prices.")

    # ── 7. Trades ─────────────────────────────────────────────────────────
    # quantity in micro-units (shares * 1_000_000); price in minor units (cents/øre)
    trades = [
      (sec_aapl, TradeType.buy, d(85), 5_000_000, 18500, "USD"),
      (sec_voo, TradeType.buy, d(70), 3_000_000, 47800, "USD"),
      (sec_btc, TradeType.buy, d(55), 100_000, 6_500_000, "USD"),
      (sec_eqnr, TradeType.buy, d(50), 50_000_000, 27200, "NOK"),
      (sec_aapl, TradeType.sell, d(30), 2_000_000, 19300, "USD"),
      (sec_sgsac, TradeType.buy, d(20), 10_000_000, 36200, "NOK"),
    ]
    for sec, trade_type, trade_date, quantity, price, currency in trades:
      session.add(
        Trade(
          security_id=sec.id,
          bank_account_id=acc_invest.id,
          trade_type=trade_type,
          trade_date=trade_date,
          quantity=quantity,
          price_per_unit=price,
          currency=currency,
        )
      )
    await session.flush()
    print(f"Seeded {len(trades)} trades.")

    # ── 8. Projects ───────────────────────────────────────────────────────
    proj_bessel = Project(name="Bessel Dev")
    proj_work = Project(name="Work")
    session.add_all([proj_bessel, proj_work])
    await session.flush()
    print("Seeded 2 projects.")

    # ── 9. Tasks ──────────────────────────────────────────────────────────
    tasks = [
      Task(title="Add activity heatmap to Activity page", status="todo", priority=2, project_id=proj_bessel.id, area="Engineering", due_date=d(-7), position=0),
      Task(title="Implement budget tracking feature", status="todo", priority=1, project_id=proj_bessel.id, area="Engineering", position=1),
      Task(title="Fix chart responsiveness on mobile", status="in_progress", priority=2, project_id=proj_bessel.id, area="Engineering", position=2),
      Task(
        title="Set up systemd monitor timer",
        status="done",
        priority=3,
        project_id=proj_bessel.id,
        area="Engineering",
        position=3,
        completed_at=datetime(2026, 6, 14, 18, 30, tzinfo=UTC),
      ),
      Task(
        title="Implement activity batch endpoint",
        status="done",
        priority=3,
        project_id=proj_bessel.id,
        area="Engineering",
        position=4,
        completed_at=datetime(2026, 6, 15, 10, 0, tzinfo=UTC),
      ),
      Task(title="Q2 performance review", status="todo", priority=1, project_id=proj_work.id, area="Career", due_date=d(-3), position=5),
      Task(title="Draft project proposal for client", status="in_progress", priority=2, project_id=proj_work.id, area="Career", due_date=d(2), position=6),
      Task(
        title="Team meeting prep",
        status="done",
        priority=2,
        project_id=proj_work.id,
        area="Career",
        position=7,
        completed_at=datetime(2026, 6, 13, 9, 0, tzinfo=UTC),
      ),
      Task(
        title="Send invoice to Consulting AS",
        status="done",
        priority=3,
        project_id=proj_work.id,
        area="Career",
        position=8,
        completed_at=datetime(2026, 6, 10, 15, 0, tzinfo=UTC),
      ),
      Task(title="Book dentist appointment", status="todo", priority=1, area="Health", due_date=d(-10), position=9),
      Task(title="Try new running route – Nordmarka", status="todo", priority=0, area="Health", tags=["running", "outdoors"], position=10),
      Task(
        title="Morning stretch routine", status="todo", priority=1, area="Health", is_recurring=True, rrule_frequency="daily", rrule_interval=1, position=11
      ),
      Task(title="Call mom", status="todo", priority=1, area="Personal", due_date=d(-1), position=12),
      Task(title="Read Thinking Fast and Slow", status="in_progress", priority=0, area="Personal", tags=["books"], position=13),
      Task(title="Plan summer holiday", status="todo", priority=1, area="Personal", tags=["travel"], position=14),
      Task(title="Fix bike brakes", status="done", priority=2, area="Personal", position=15, completed_at=datetime(2026, 6, 8, 16, 0, tzinfo=UTC)),
    ]
    for task in tasks:
      session.add(task)
    await session.flush()
    print(f"Seeded {len(tasks)} tasks.")

    # ── 10. Places ────────────────────────────────────────────────────────
    places = [
      Place(
        name="Tim Wendelboe",
        address="Grüners gate 1, Oslo",
        country="Norway",
        latitude=59.9196,
        longitude=10.7585,
        category="cafe",
        status="visited",
        rating=5,
        visited_at=d(5),
        review="Best espresso in Oslo. Queue out the door on weekends but worth every minute.",
        tags=["coffee", "specialty", "oslo"],
      ),
      Place(
        name="Maaemo",
        address="Schweigaards gate 15B, Oslo",
        country="Norway",
        latitude=59.9085,
        longitude=10.7600,
        category="restaurant",
        status="visited",
        rating=5,
        visited_at=d(3),
        review="3 Michelin stars. Mind-blowing tasting menu, fully committed to Norwegian produce.",
        tags=["fine-dining", "michelin", "nordic"],
      ),
      Place(
        name="Nordmarka",
        address="Oslo, Norway",
        country="Norway",
        latitude=60.0667,
        longitude=10.6833,
        category="outdoors",
        status="visited",
        rating=4,
        visited_at=d(15),
        review="Beautiful forest right outside the city. Perfect for trail running and skiing.",
        tags=["hiking", "running", "nature", "oslo"],
      ),
      Place(
        name="Vigelandsparken",
        address="Nobels gate 32, Oslo",
        country="Norway",
        latitude=59.9273,
        longitude=10.6997,
        category="park",
        status="visited",
        rating=4,
        visited_at=d(30),
        review="Surreal sculpture park. Free entry. Best in summer.",
        tags=["oslo", "sculpture", "park", "free"],
      ),
      Place(
        name="Stockfleths Bogstadveien",
        address="Bogstadveien 1, Oslo",
        country="Norway",
        latitude=59.9234,
        longitude=10.7123,
        category="cafe",
        status="visited",
        rating=4,
        visited_at=d(8),
        review="Classic Oslo coffee bar. Great people-watching corner spot.",
        tags=["coffee", "oslo"],
      ),
      Place(
        name="Smalhans",
        address="Ullevålsveien 43, Oslo",
        country="Norway",
        latitude=59.9280,
        longitude=10.7425,
        category="restaurant",
        status="want_to_go",
        tags=["food", "oslo", "neighbourhood"],
      ),
      Place(
        name="Lofoten Islands",
        address="Lofoten, Norway",
        country="Norway",
        latitude=68.1541,
        longitude=13.9990,
        category="destination",
        status="want_to_go",
        tags=["travel", "norway", "nature", "fishing"],
      ),
      Place(
        name="Molde Jazz Festival",
        address="Molde, Norway",
        country="Norway",
        latitude=62.7378,
        longitude=7.1591,
        category="event",
        status="want_to_go",
        tags=["music", "festival", "jazz", "norway"],
      ),
      Place(
        name="The Jane, Antwerp",
        address="Paradeplein 1, Antwerp",
        country="Belgium",
        latitude=51.2065,
        longitude=4.3934,
        category="restaurant",
        status="want_to_go",
        tags=["food", "antwerp", "fine-dining", "michelin"],
      ),
      Place(
        name="Fjaerland",
        address="Fjærland, Norway",
        country="Norway",
        latitude=61.4178,
        longitude=6.7531,
        category="destination",
        status="want_to_go",
        tags=["fjord", "norway", "scenic", "books"],
      ),
    ]
    for place in places:
      session.add(place)
    await session.flush()
    print(f"Seeded {len(places)} places.")

    # ── 11. Activity events ───────────────────────────────────────────────
    # 30-day history with varied daily profiles.
    # Each day spec is (days_ago, [(start_h, end_h, app_class), ...]).
    # Days omitted from the list = no activity (weekends off, holidays).
    # App classes: code, terminal, browser, slack, figma, notion, mail, zoom
    _day_specs: list[tuple[int, list[tuple]]] = [
      # d(0) Mon June 15 — morning session
      (0, [(9.0, 10.5, "code"), (10.5, 11.0, "browser"), (11.0, 12.5, "code"), (12.5, 13.5, "terminal")]),
      # d(1) Sun June 14 — light weekend session
      (1, [(10.5, 12.0, "browser"), (12.0, 13.5, "code"), (15.0, 16.5, "code")]),
      # d(2) Sat June 13 — off
      # d(3) Fri June 12 — solid day
      (
        3,
        [
          (8.5, 10.5, "code"),
          (10.5, 11.0, "slack"),
          (11.0, 12.5, "code"),
          (13.5, 15.5, "code"),
          (15.5, 16.0, "terminal"),
          (16.0, 18.0, "browser"),
          (18.0, 19.0, "code"),
        ],
      ),
      # d(4) Thu June 11 — heavy coding
      (
        4,
        [
          (8.0, 10.0, "code"),
          (10.0, 10.5, "browser"),
          (10.5, 12.5, "code"),
          (12.5, 13.0, "terminal"),
          (14.0, 16.5, "code"),
          (16.5, 17.0, "slack"),
          (17.0, 19.0, "code"),
          (19.0, 19.5, "terminal"),
        ],
      ),
      # d(5) Wed June 10 — meeting-heavy
      (
        5,
        [
          (9.0, 10.0, "zoom"),
          (10.0, 11.5, "code"),
          (11.5, 12.0, "slack"),
          (13.5, 15.0, "zoom"),
          (15.0, 16.5, "browser"),
          (16.5, 17.5, "code"),
          (17.5, 18.0, "mail"),
        ],
      ),
      # d(6) Tue June 9 — heavy coding + design
      (
        6,
        [
          (8.5, 10.5, "code"),
          (10.5, 11.0, "terminal"),
          (11.0, 12.5, "code"),
          (13.5, 15.0, "code"),
          (15.0, 16.0, "figma"),
          (16.0, 18.0, "code"),
          (18.0, 18.5, "browser"),
        ],
      ),
      # d(7) Mon June 8 — normal
      (7, [(9.0, 11.0, "code"), (11.0, 11.5, "mail"), (11.5, 13.0, "code"), (14.0, 16.0, "code"), (16.0, 16.5, "slack"), (16.5, 17.5, "browser")]),
      # d(8) Sun June 7 — off
      # d(9) Sat June 6 — short session
      (9, [(11.0, 12.5, "code"), (12.5, 13.0, "browser")]),
      # d(10) Fri June 5 — productive
      (10, [(8.0, 10.0, "code"), (10.0, 10.5, "slack"), (10.5, 12.5, "code"), (13.5, 16.0, "code"), (16.0, 17.0, "terminal"), (17.0, 19.0, "code")]),
      # d(11) Thu June 4 — normal
      (11, [(8.5, 10.5, "code"), (10.5, 11.0, "browser"), (11.0, 12.5, "code"), (13.5, 15.0, "code"), (15.0, 15.5, "terminal"), (15.5, 17.5, "code")]),
      # d(12) Wed June 3 — design-focused
      (12, [(9.0, 11.0, "figma"), (11.0, 12.0, "code"), (13.0, 14.5, "figma"), (14.5, 15.5, "browser"), (15.5, 17.5, "code"), (17.5, 18.0, "figma")]),
      # d(13) Tue June 2 — heavy day
      (
        13,
        [
          (8.0, 10.0, "code"),
          (10.0, 10.5, "slack"),
          (10.5, 12.5, "code"),
          (13.5, 16.0, "code"),
          (16.0, 16.5, "terminal"),
          (16.5, 18.5, "code"),
          (18.5, 19.0, "browser"),
        ],
      ),
      # d(14) Mon June 1 — start of week, email-heavy morning
      (14, [(9.0, 10.5, "mail"), (10.5, 12.5, "code"), (13.5, 15.5, "code"), (15.5, 16.0, "slack"), (16.0, 17.5, "notion")]),
      # d(15) Sun May 31 — off
      # d(16) Sat May 30 — light afternoon
      (16, [(14.0, 16.0, "browser"), (16.0, 17.0, "code")]),
      # d(17) Fri May 29 — good day
      (17, [(8.5, 10.5, "code"), (10.5, 11.0, "terminal"), (11.0, 12.5, "code"), (13.5, 16.0, "code"), (16.0, 17.0, "slack"), (17.0, 18.5, "code")]),
      # d(18) Thu May 28 — heaviest day of the period
      (
        18,
        [
          (7.5, 10.0, "code"),
          (10.0, 10.5, "browser"),
          (10.5, 12.5, "code"),
          (12.5, 13.0, "terminal"),
          (14.0, 16.5, "code"),
          (16.5, 17.0, "figma"),
          (17.0, 19.0, "code"),
          (19.0, 19.5, "terminal"),
        ],
      ),
      # d(19) Wed May 27 — meetings + code
      (19, [(9.0, 10.5, "zoom"), (10.5, 12.0, "code"), (13.5, 14.5, "zoom"), (14.5, 16.0, "browser"), (16.0, 17.5, "code")]),
      # d(20) Tue May 26 — normal + figma
      (20, [(8.5, 10.5, "code"), (10.5, 11.5, "figma"), (11.5, 12.5, "code"), (13.5, 15.0, "code"), (15.0, 15.5, "slack"), (15.5, 17.0, "code")]),
      # d(21) Mon May 25 — holiday, short afternoon
      (21, [(13.0, 14.5, "code"), (14.5, 15.5, "browser")]),
      # d(22) Sun May 24 — off
      # d(23) Sat May 23 — off
      # d(24) Fri May 22 — productive end of week
      (24, [(8.0, 10.0, "code"), (10.0, 10.5, "slack"), (10.5, 12.5, "code"), (13.5, 16.0, "code"), (16.0, 17.5, "browser"), (17.5, 19.0, "code")]),
      # d(25) Thu May 21 — normal
      (25, [(9.0, 11.0, "code"), (11.0, 11.5, "browser"), (11.5, 12.5, "code"), (13.5, 15.0, "code"), (15.0, 15.5, "terminal"), (15.5, 17.5, "code")]),
      # d(26) Wed May 20 — mixed
      (26, [(8.5, 10.5, "code"), (10.5, 11.0, "slack"), (11.0, 12.5, "browser"), (13.5, 16.0, "code"), (16.0, 17.0, "figma"), (17.0, 18.0, "code")]),
      # d(27) Tue May 19 — heavy
      (
        27,
        [
          (8.0, 10.0, "code"),
          (10.0, 10.5, "terminal"),
          (10.5, 12.5, "code"),
          (13.5, 15.5, "code"),
          (15.5, 16.0, "slack"),
          (16.0, 18.5, "code"),
          (18.5, 19.0, "browser"),
        ],
      ),
      # d(28) Mon May 18 — lighter Monday
      (28, [(10.0, 12.0, "code"), (12.0, 12.5, "mail"), (13.5, 15.5, "code"), (15.5, 16.5, "notion")]),
      # d(29) Sun May 17 — off
    ]

    all_activity: list[tuple] = []
    for days_ago, blocks in _day_specs:
      all_activity.extend(_activity_blocks(d(days_ago), blocks))
    all_activity.sort(key=lambda e: e[0])

    for local_id, (ts, state, app_class) in enumerate(all_activity, 1):
      session.add(
        ActivityEvent(
          ts=ts,
          state=state,
          app_class=app_class,
          source="dev-machine",
          local_id=local_id,
        )
      )
    await session.flush()
    print(f"Seeded {len(all_activity)} activity events across {len(_day_specs)} active days.")

    # ── Commit ────────────────────────────────────────────────────────────
    await session.commit()
    print("\n✅ Database seeded successfully!")
    print(f"   Categories:    {len(cat_map)}")
    print("   Bank accounts: 3")
    print(f"   Transactions:  {len(tx_list)}")
    print("   Securities:    5  (35 price points)")
    print(f"   Trades:        {len(trades)}")
    print(f"   Tasks:         {len(tasks)}")
    print(f"   Places:        {len(places)}")
    print(f"   Activity:      {len(all_activity)} events  ({len(_day_specs)} active days)")

  await engine.dispose()


if __name__ == "__main__":
  asyncio.run(seed())
