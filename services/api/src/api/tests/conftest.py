import os

# Set environment to testing BEFORE importing any application code
# This must happen before settings are loaded
# Note: Settings uses BESSEL_ prefix, so we need BESSEL_ENV not ENV
os.environ["BESSEL_ENV"] = "testing"


from api.tests.fixtures import *  # noqa: F403
