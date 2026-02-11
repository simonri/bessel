import os

import typer
from alembic.command import upgrade as alembic_upgrade
from alembic.config import Config
from api.settings import settings

cli = typer.Typer()


def get_sync_postgres_dsn() -> str:
  return settings.get_postgres_dsn("psycopg2").replace("%", "%%")


def get_config() -> Config:
  config_file = os.path.join(os.path.dirname(__file__), "./alembic.ini")
  config = Config(config_file)
  config.set_main_option("sqlalchemy.url", get_sync_postgres_dsn())
  return config


def _upgrade(revision: str = "head") -> None:
  config = get_config()

  print(f"SQLAlchemy URL: {config.get_main_option('sqlalchemy.url')}")
  print(f"Script location: {config.get_main_option('script_location')}")

  alembic_upgrade(config, revision)


@cli.command()
def upgrade(
  revision: str = typer.Option("head", help="Which revision to upgrade to"),
) -> None:
  print(f"Upgrading to revision: {revision}")
  _upgrade(revision)


@cli.command()
def recreate() -> None:
  print("Not implemented")


if __name__ == "__main__":
  cli()
