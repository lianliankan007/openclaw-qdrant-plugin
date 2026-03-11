export const COLLECTION_ACTIONS = ["create", "get", "list", "delete"] as const;
export const POINTS_ACTIONS = ["upsert", "delete"] as const;
export const QUERY_ACTIONS = ["search", "scroll"] as const;
export const DISTANCE_VALUES = ["Cosine", "Dot", "Euclid", "Manhattan"] as const;

export const qdrantHealthSchema = {
  type: "object",
  additionalProperties: false,
  properties: {},
  required: [],
} as const;

export const qdrantCollectionSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    action: {
      type: "string",
      enum: [...COLLECTION_ACTIONS],
      description: "Collection action: create | get | list | delete",
    },
    collection: {
      type: "string",
      description: "Collection name. Required except for action=list.",
    },
    vectorSize: {
      type: "integer",
      minimum: 1,
      description: "Vector dimension used for create.",
    },
    distance: {
      type: "string",
      enum: [...DISTANCE_VALUES],
      description: "Distance metric used for create.",
    },
    onDiskPayload: {
      type: "boolean",
      description: "Whether payload should be stored on disk for create.",
    },
    shardNumber: {
      type: "integer",
      minimum: 1,
      description: "Optional shard number for create.",
    },
    replicationFactor: {
      type: "integer",
      minimum: 1,
      description: "Optional replication factor for create.",
    },
  },
  required: ["action"],
} as const;

export const qdrantPointsSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    action: {
      type: "string",
      enum: [...POINTS_ACTIONS],
      description: "Points action: upsert | delete",
    },
    collection: {
      type: "string",
      description: "Collection name.",
    },
    wait: {
      type: "boolean",
      description: "Wait until write is fully applied.",
    },
    points: {
      type: "array",
      description: "Point objects for upsert.",
      items: {
        type: "object",
        additionalProperties: true,
        properties: {
          id: {
            anyOf: [{ type: "string" }, { type: "integer" }],
          },
          vector: {
            anyOf: [
              {
                type: "array",
                items: { type: "number" },
              },
              {
                type: "object",
                additionalProperties: {
                  type: "array",
                  items: { type: "number" },
                },
              },
            ],
          },
          payload: {
            type: "object",
            additionalProperties: true,
          },
        },
        required: ["id", "vector"],
      },
    },
    ids: {
      type: "array",
      description: "Point ids to delete.",
      items: {
        anyOf: [{ type: "string" }, { type: "integer" }],
      },
    },
    filter: {
      type: "object",
      description: "Qdrant filter for delete/search/scroll.",
      additionalProperties: true,
    },
  },
  required: ["action", "collection"],
} as const;

export const qdrantQuerySchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    action: {
      type: "string",
      enum: [...QUERY_ACTIONS],
      description: "Query action: search | scroll",
    },
    collection: {
      type: "string",
      description: "Collection name.",
    },
    queryVector: {
      type: "array",
      description: "Vector used for similarity search.",
      items: { type: "number" },
    },
    limit: {
      type: "integer",
      minimum: 1,
      maximum: 1000,
      description: "Maximum number of results.",
    },
    offset: {
      anyOf: [{ type: "integer" }, { type: "string" }],
      description: "Optional offset for scroll.",
    },
    withPayload: {
      anyOf: [
        { type: "boolean" },
        { type: "array", items: { type: "string" } },
        { type: "object", additionalProperties: true },
      ],
      description: "Include payload in results.",
    },
    withVector: {
      anyOf: [{ type: "boolean" }, { type: "array", items: { type: "string" } }],
      description: "Include stored vector in results.",
    },
    scoreThreshold: {
      type: "number",
      description: "Optional similarity threshold for search.",
    },
    filter: {
      type: "object",
      description: "Qdrant filter expression.",
      additionalProperties: true,
    },
  },
  required: ["action", "collection"],
} as const;
