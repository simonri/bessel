import os

# Set environment to testing BEFORE importing any application code
# This must happen before settings are loaded
# Note: Settings uses BESSEL_ prefix, so we need BESSEL_ENV not ENV
os.environ["BESSEL_ENV"] = "testing"
# A placeholder tenant so the MCP server (which needs an issuer) is mounted the
# same way in CI, where no env file is present, as locally.
os.environ["BESSEL_AUTH0_DOMAIN"] = "bessel-test.example.com"
# Each xdist worker gets a Redis database of its own (as it does a Postgres one) within the run's slot of 16,
# and none uses the developer's database 0. So at most 15 workers.
os.environ["BESSEL_REDIS_DB"] = str(
  16 * int(os.environ.get("BESSEL_TEST_SLOT", "0")) + 1 + int(os.environ.get("PYTEST_XDIST_WORKER", "gw0").removeprefix("gw"))
)


from collections.abc import Iterator
from pathlib import Path

import pytest
from api.settings import settings
from api.tests.fixtures import *  # noqa: F403


@pytest.fixture(autouse=True)
def _files_in_a_temporary_folder(tmp_path: Path) -> Iterator[None]:
  """Uploaded files go to a folder of the test's own, never the developer's ./data or a bucket."""
  original = (settings.FILES_DIR, settings.STORAGE_ENDPOINT_URL)
  settings.FILES_DIR, settings.STORAGE_ENDPOINT_URL = str(tmp_path / "files"), ""
  yield
  settings.FILES_DIR, settings.STORAGE_ENDPOINT_URL = original
