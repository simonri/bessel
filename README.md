# Project Metron

## Commands

```
uv sync --all-packages --all-extras --all-groups
```

Creating a new service:
```
uv init --package --lib services/hello
uv lock
```

Add lib-one as dependency to lib-two
```
uv add --package lib-two lib-one
```
