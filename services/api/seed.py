import argparse
import asyncio
import random
from datetime import datetime, timedelta

from sqlalchemy import text
from src.api.common.db.postgres import create_async_sessionmaker
from src.api.common.repository.customer import CustomerRepository
from src.api.common.repository.point import PointRepository
from src.api.models.customer import Customer
from src.api.models.point import Point
from src.api.postgres import AsyncSession, create_async_engine

STORE_ID = "mio001"


def create_customer_with_path(customer_id: str, start_id: int) -> tuple[Customer, list[Point]]:
  customer = Customer(customer_id=customer_id, store_id=STORE_ID, is_staff=False, is_static=False)
  points: list[Point] = []

  curr_x = random.uniform(0, 60)
  curr_y = random.uniform(0, 86)

  for i in range(10):
    # pick a random velocity (vx, vy) between -0.5 and 0.5
    vx = random.uniform(-0.5, 0.5)
    vy = random.uniform(-0.5, 0.5)

    for j in range(10):
      curr_x += vx
      curr_y += vy
      points.append(
        Point(
          point_id=start_id + i * 10 + j,
          time=datetime.now() - timedelta(minutes=j),  # Spread points over last hour
          store_id=STORE_ID,
          room_id=1,
          section_id=None,
          product_id=None,
          x_pos=curr_x,
          y_pos=curr_y,
          customer_id=customer.customer_id,
          camera_id="",
          mood="",
          holding=False,
          sitting=False,
        )
      )

  return customer, points


# this function will only create points for now
async def create_seed_data(session: AsyncSession, clean: bool = False) -> None:
  point_repository = PointRepository.from_session(session)
  customer_repository = CustomerRepository.from_session(session)

  if clean:
    print("Cleaning the database")
    await session.execute(text("DELETE FROM points"))
    await session.execute(text("DELETE FROM customers"))
    await session.commit()
    print("Cleaned the database")

  points: list[Point] = []

  point_count = 0

  for i in range(10):
    customer, points = create_customer_with_path(f"customer_{i}", point_count)
    await customer_repository.create(customer)
    for point in points:
      await point_repository.create(point)
    point_count += len(points)

  print("Committing")
  await session.commit()
  print("Committed successfully")


async def run() -> None:
  parser = argparse.ArgumentParser()
  parser.add_argument("--clean", action="store_true", help="Clean the database")
  args = parser.parse_args()

  engine = create_async_engine("script")
  sessionmaker = create_async_sessionmaker(engine)
  async with sessionmaker() as session:
    await create_seed_data(session, args.clean)


if __name__ == "__main__":
  asyncio.run(run())
