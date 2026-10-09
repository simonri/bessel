from enum import StrEnum

from pydantic import Field

from api.common.schemas import Schema


class TimelineLaneKey(StrEnum):
  sleep = "sleep"
  workouts = "workouts"
  pc = "pc"


class TimelineSegment(Schema):
  start_ts: int = Field(description="Segment start (Unix epoch seconds), clipped to the window.")
  end_ts: int = Field(description="Segment end (Unix epoch seconds, exclusive), clipped to the window.")
  label: str = Field(
    description="What filled this span: the sleep stage for the sleep lane, the activity (e.g. 'running') for the workouts lane, the app class for the PC lane."
  )


class TimelineLane(Schema):
  key: TimelineLaneKey
  total_secs: int = Field(description="Seconds attributed to this lane, counting overlapping segments once. Awake sleep segments are shown but not counted.")
  segments: list[TimelineSegment] = Field(description="Segments sorted by start time. Contiguous segments with the same label are merged.")


class TimelineResponse(Schema):
  start_ts: int
  end_ts: int
  source: str | None = Field(description="Activity source used for the PC lane, or null if no activity has been recorded.")
  tracked_secs: int = Field(description="Seconds covered by at least one lane's counted segments.")
  lanes: list[TimelineLane]
