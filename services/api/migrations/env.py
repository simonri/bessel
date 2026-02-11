import asyncio
from logging.config import fileConfig

from alembic import context
from api.models.base import Model
from api.settings import settings
from sqlalchemy import pool
from sqlalchemy.ext.asyncio import async_engine_from_config

# this is the Alembic Config object, which provides
# access to the values within the .ini file in use.
config = context.config

# Interpret the config file for Python logging.
# This line sets up loggers basically.
if config.config_file_name is not None:
  fileConfig(config.config_file_name)

# add your model's MetaData object here
# for 'autogenerate' support
# from myapp import mymodel
# target_metadata = mymodel.Base.metadata
target_metadata = Model.metadata

config.set_main_option("sqlalchemy.url", settings.get_postgres_dsn("asyncpg").replace("%", "%%"))

# other values from the config, defined by the needs of env.py,
# can be acquired:
# my_important_option = config.get_main_option("my_important_option")
# ... etc.


def include_object(obj_, name, type_, reflected, compare_to):
  """
  Exclude PostGIS TIGER geocoder tables from migrations.
  These tables are managed by the postgis_tiger_geocoder extension.
  """
  if type_ == "table":
    # Exclude PostGIS TIGER geocoder tables
    tiger_tables = {
      'addr',
      'addrfeat',
      'bg',
      'county',
      'cousub',
      'edges',
      'faces',
      'featnames',
      'geocode_settings',
      'geocode_settings_default',
      'layer',
      'loader_lookuptables',
      'loader_platform',
      'loader_variables',
      'pagc_gaz',
      'pagc_lex',
      'pagc_rules',
      'place',
      'place_lookup',
      'secondary_unit_lookup',
      'spatial_ref_sys',
      'state',
      'state_lookup',
      'street_type_lookup',
      'tabblock',
      'tabblock20',
      'topology',
      'tract',
      'direction_lookup',
      'county_lookup',
      'countysub_lookup',
      'zip_lookup',
      'zip_lookup_all',
      'zip_lookup_base',
      'zip_state',
      'zip_state_loc',
      'zcta5',
    }
    if name in tiger_tables:
      return False
  return True


def run_migrations_offline() -> None:
  """Run migrations in 'offline' mode.

  This configures the context with just a URL
  and not an Engine, though an Engine is acceptable
  here as well.  By skipping the Engine creation
  we don't even need a DBAPI to be available.

  Calls to context.execute() here emit the given string to the
  script output.

  """
  url = config.get_main_option("sqlalchemy.url")
  context.configure(
    url=url,
    target_metadata=target_metadata,
    literal_binds=True,
    dialect_opts={"paramstyle": "named"},
    compare_type=True,
    include_object=include_object,
  )

  with context.begin_transaction():
    context.run_migrations()


def do_run_migrations(connection) -> None:
  context.configure(connection=connection, target_metadata=target_metadata, compare_type=True, include_object=include_object)

  with context.begin_transaction():
    context.run_migrations()


async def run_migrations_online() -> None:
  """Run migrations in 'online' mode.

  In this scenario we need to create an Engine
  and associate a connection with the context.

  """
  configuration = config.get_section(config.config_ini_section)
  if not configuration:
    raise ValueError("No Alembic config found")

  connectable = async_engine_from_config(
    configuration,
    prefix="sqlalchemy.",
    poolclass=pool.NullPool,
    future=True,
  )

  async with connectable.connect() as connection:
    await connection.run_sync(do_run_migrations)

  await connectable.dispose()


if context.is_offline_mode():
  run_migrations_offline()
else:
  asyncio.run(run_migrations_online())
