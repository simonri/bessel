import calendar
from datetime import date, timedelta


def compute_next_due_date(
  current_due: date | None,
  frequency: str,
  interval: int = 1,
  day_of_week: int | None = None,
  day_of_month: int | None = None,
) -> date:
  """Compute the next due date for a recurring task.

  Args:
    current_due: The current due date. If None, uses today.
    frequency: One of "daily", "weekly", "monthly", "yearly".
    interval: How many periods between occurrences.
    day_of_week: 0=Monday, 6=Sunday. Used for weekly frequency.
    day_of_month: 1-31. Used for monthly frequency.

  Returns:
    The next due date.
  """
  base = current_due or date.today()

  if frequency == "daily":
    return base + timedelta(days=interval)

  if frequency == "weekly":
    if day_of_week is not None:
      # Advance to next occurrence of the target weekday
      days_ahead = day_of_week - base.weekday()
      if days_ahead <= 0:
        days_ahead += 7 * interval
      else:
        days_ahead += 7 * (interval - 1)
      return base + timedelta(days=days_ahead)
    return base + timedelta(weeks=interval)

  if frequency == "monthly":
    target_day = day_of_month or base.day
    month = base.month + interval
    year = base.year + (month - 1) // 12
    month = (month - 1) % 12 + 1
    # Clamp to last day of month
    max_day = calendar.monthrange(year, month)[1]
    return date(year, month, min(target_day, max_day))

  if frequency == "yearly":
    try:
      return base.replace(year=base.year + interval)
    except ValueError:
      # Feb 29 in a non-leap year
      return date(base.year + interval, 2, 28)

  # Fallback
  return base + timedelta(days=1)
