import asyncio

import dramatiq
import src.api.tasks  # noqa: F401
from src.api.redis import create_redis
from src.api.worker import JobQueueManager


async def run() -> None:
  redis = create_redis("app")
  async with JobQueueManager.open(dramatiq.get_broker(), redis):
    print("Done!")


if __name__ == "__main__":
  asyncio.run(run())
