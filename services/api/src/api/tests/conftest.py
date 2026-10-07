import os

# Set environment to testing BEFORE importing any application code
# This must happen before settings are loaded
# Note: Settings uses BESSEL_ prefix, so we need BESSEL_ENV not ENV
os.environ["BESSEL_ENV"] = "testing"
# A placeholder tenant so the MCP server (which needs an issuer) is mounted the
# same way in CI, where no env file is present, as locally.
os.environ["BESSEL_AUTH0_DOMAIN"] = "bessel-test.example.com"


from api.tests.fixtures import *  # noqa: F403
