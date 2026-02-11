"""Common helper functions for API endpoints."""

from api.exceptions import ResourceNotFound


def require_resource[T](resource: T | None, resource_name: str = "Resource") -> T:
  """
  Ensure a resource exists or raise ResourceNotFound.

  Args:
    resource: Resource that may be None
    resource_name: Name of the resource for error message (default: "Resource")

  Returns:
    The resource if it exists

  Raises:
    ResourceNotFound: If resource is None
  """
  if resource is None:
    raise ResourceNotFound(f"{resource_name} not found")
  return resource
