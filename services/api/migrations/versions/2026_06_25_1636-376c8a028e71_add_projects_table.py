"""add_projects_table

Revision ID: 376c8a028e71
Revises: a14d65f0d3f1
Create Date: 2026-06-25 16:36:48.025661

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = '376c8a028e71'
down_revision: str | Sequence[str] | None = 'a14d65f0d3f1'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
  """Upgrade schema."""
  op.create_table(
    'projects',
    sa.Column('name', sa.String(length=100), nullable=False),
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('created_at', sa.TIMESTAMP(timezone=True), nullable=False),
    sa.Column('modified_at', sa.TIMESTAMP(timezone=True), nullable=True),
    sa.Column('deleted_at', sa.TIMESTAMP(timezone=True), nullable=True),
    sa.PrimaryKeyConstraint('id', name=op.f('projects_pkey')),
    sa.UniqueConstraint('name', name=op.f('projects_name_key')),
  )
  op.create_index(op.f('ix_projects_created_at'), 'projects', ['created_at'], unique=False)
  op.create_index(op.f('ix_projects_deleted_at'), 'projects', ['deleted_at'], unique=False)

  op.execute("""
    INSERT INTO projects (id, name, created_at)
    SELECT gen_random_uuid(), project, now()
    FROM tasks
    WHERE project IS NOT NULL
    GROUP BY project
  """)

  op.add_column('tasks', sa.Column('project_id', sa.Uuid(), nullable=True))

  op.execute("""
    UPDATE tasks t
    SET project_id = p.id
    FROM projects p
    WHERE t.project = p.name
  """)

  op.drop_index(op.f('ix_tasks_project'), table_name='tasks')
  op.create_index(op.f('ix_tasks_project_id'), 'tasks', ['project_id'], unique=False)
  op.create_foreign_key(op.f('tasks_project_id_fkey'), 'tasks', 'projects', ['project_id'], ['id'])
  op.drop_column('tasks', 'project')


def downgrade() -> None:
  """Downgrade schema."""
  op.add_column('tasks', sa.Column('project', sa.VARCHAR(length=100), autoincrement=False, nullable=True))

  op.execute("""
    UPDATE tasks t
    SET project = p.name
    FROM projects p
    WHERE t.project_id = p.id
  """)

  op.drop_constraint(op.f('tasks_project_id_fkey'), 'tasks', type_='foreignkey')
  op.drop_index(op.f('ix_tasks_project_id'), table_name='tasks')
  op.create_index(op.f('ix_tasks_project'), 'tasks', ['project'], unique=False)
  op.drop_column('tasks', 'project_id')

  op.drop_index(op.f('ix_projects_deleted_at'), table_name='projects')
  op.drop_index(op.f('ix_projects_created_at'), table_name='projects')
  op.drop_table('projects')
