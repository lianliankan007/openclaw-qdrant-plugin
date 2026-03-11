# Qdrant Plugin Examples

## 1. 健康检查

```json
{
  "tool": "qdrant_health",
  "params": {}
}
```

## 2. 创建 collection

```json
{
  "tool": "qdrant_collection",
  "params": {
    "action": "create",
    "collection": "docs",
    "vectorSize": 1536,
    "distance": "Cosine"
  }
}
```

## 3. 列出 collections

```json
{
  "tool": "qdrant_collection",
  "params": {
    "action": "list"
  }
}
```

## 4. Upsert points

```json
{
  "tool": "qdrant_points",
  "params": {
    "action": "upsert",
    "collection": "docs",
    "wait": true,
    "points": [
      {
        "id": "doc-1",
        "vector": [0.12, 0.44, 0.91],
        "payload": {
          "text": "OpenClaw plugin design note",
          "source": "demo"
        }
      }
    ]
  }
}
```

## 5. Query / search

```json
{
  "tool": "qdrant_query",
  "params": {
    "action": "search",
    "collection": "docs",
    "queryVector": [0.12, 0.44, 0.91],
    "limit": 5,
    "withPayload": true
  }
}
```

## 6. Delete by ids

```json
{
  "tool": "qdrant_points",
  "params": {
    "action": "delete",
    "collection": "docs",
    "ids": ["doc-1"]
  }
}
```

## 7. Scroll / list points

```json
{
  "tool": "qdrant_query",
  "params": {
    "action": "scroll",
    "collection": "docs",
    "limit": 20,
    "withPayload": true
  }
}
```
