import importlib
import stat
import sys
from pathlib import Path

import pytest


def test_the_activity_data_is_readable_by_the_user_alone(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    # Window titles say what the user read and wrote all day; files made by older versions were world-readable.
    monkeypatch.setenv("XDG_DATA_HOME", str(tmp_path))
    data = tmp_path / "activity-tracker"
    data.mkdir(mode=0o755)
    (data / "activity.db").write_text("")
    (data / "activity.db").chmod(0o644)
    sys.modules.pop("main", None)
    main = importlib.import_module("main")

    main._private_data_dir()

    assert stat.S_IMODE(data.stat().st_mode) == 0o700
    assert stat.S_IMODE((data / "activity.db").stat().st_mode) == 0o600


def test_the_idle_file_is_not_in_shared_tmp(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("XDG_RUNTIME_DIR", "/run/user/1000")
    sys.modules.pop("main", None)
    main = importlib.import_module("main")
    assert main.IDLE_FILE == Path("/run/user/1000/activity-tracker-idle")
