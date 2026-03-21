Running the API:

```
uv run task api
```

Running the worker:

```
uv run task worker
```

OpenAPI url:
http://localhost:8000/docs

```
[
  {
    "AllowedOrigins": [
      "http://localhost:3000",
      "http://127.0.0.1:5173"
    ],
    "AllowedMethods": [
      "PUT",
      "GET",
      "POST"
    ],
    "AllowedHeaders": [
      "*"
    ],
    "ExposeHeaders": [
      "ETag"
    ],
    "MaxAgeSeconds": 3600
  }
]
```
