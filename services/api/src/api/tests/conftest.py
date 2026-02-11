import os

# Set environment to testing BEFORE importing any application code
# This must happen before settings are loaded
# Note: Settings uses METRON_ prefix, so we need METRON_ENV not ENV
os.environ["METRON_ENV"] = "testing"


from api.tests.fixtures import *  # noqa: F403
