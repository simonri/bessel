from apscheduler.jobstores.memory import MemoryJobStore
from apscheduler.schedulers.blocking import BlockingScheduler

from api import tasks
from api.logging import configure as configure_logging
from api.worker import scheduler_middleware

configure_logging()


def start() -> None:
  scheduler = BlockingScheduler()

  scheduler.add_jobstore(MemoryJobStore(), "memory")

  for func, cron_trigger in scheduler_middleware.cron_triggers:
    scheduler.add_job(func, cron_trigger, jobstore="memory")

  for func in scheduler_middleware.startup_jobs:
    func()

  try:
    scheduler.start()
  except KeyboardInterrupt:
    scheduler.shutdown()


__all__ = ["start", "tasks"]

if __name__ == "__main__":
  start()
