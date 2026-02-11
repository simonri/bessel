import pytest_asyncio
from api.worker._enqueue import JobQueueManager


@pytest_asyncio.fixture
async def job_queue_manager():
  """Fixture that initializes JobQueueManager context variable."""
  manager = JobQueueManager.set()
  try:
    yield manager
  finally:
    JobQueueManager.close()
