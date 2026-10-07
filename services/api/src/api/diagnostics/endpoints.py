import json

import structlog
from fastapi import APIRouter

from api.auth.dependencies import CurrentUser
from api.diagnostics.schemas import ClientDiagnosticsUpload
from api.logging import Logger, mask_key

log: Logger = structlog.get_logger()

router = APIRouter(prefix="/client-diagnostics", tags=["diagnostics"])


@router.post(
  "",
  summary="Upload Client Diagnostics",
  status_code=202,
)
async def upload_client_diagnostics(body: ClientDiagnosticsUpload, user: CurrentUser) -> None:
  """Crash and hang reports from the apps, logged so they can be found next to
  the server's own logs for the same build."""
  for payload in body.payloads:
    log.warning(
      "Client diagnostic report",
      user=mask_key(user.sub, visible_chars=10),
      client=f"{body.platform}/{body.version}+{body.build}",
      kinds=sorted(key for key in payload if key.endswith("Diagnostics")),
      payload=json.dumps(payload),
    )
