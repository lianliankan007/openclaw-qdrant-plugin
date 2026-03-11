import {
  QdrantClient,
  QdrantError,
  type QdrantPluginConfig,
  type CreateCollectionInput,
  type DeletePointsInput,
  type ScrollPointsInput,
  type SearchPointsInput,
  type UpsertPointsInput,
} from "./src/qdrant-client.ts";
import {
  qdrantCollectionSchema,
  qdrantHealthSchema,
  qdrantPointsSchema,
  qdrantQuerySchema,
} from "./src/schemas.ts";

type JsonRecord = Record<string, unknown>;
type JsonResult = {
  content: Array<{ type: "text"; text: string }>;
  details: unknown;
};

type CliCommand = {
  description: (text: string) => CliCommand;
  action: (handler: () => void | Promise<void>) => CliCommand;
  command: (name: string) => CliCommand;
};

type CliProgram = {
  command: (name: string) => CliCommand;
};

type OpenClawPluginApi = {
  pluginConfig?: Record<string, unknown>;
  logger: {
    info: (message: string) => void;
    warn: (message: string) => void;
  };
  registerTool: (tool: unknown, opts?: { name?: string }) => void;
  registerCli: (registrar: (ctx: { program: CliProgram }) => void, opts?: { commands?: string[] }) => void;
};

function jsonResult(payload: unknown): JsonResult {
  return {
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
    details: payload,
  };
}

function readPluginConfig(api: OpenClawPluginApi): QdrantPluginConfig {
  const raw = (api.pluginConfig ?? {}) as JsonRecord;
  const baseUrl = typeof raw.baseUrl === "string" ? raw.baseUrl.trim() : "";
  if (!baseUrl) {
    throw new Error(
      "qdrant: plugin installed but inactive. Set plugins.entries.openclaw-qdrant-plugin.config.baseUrl (for example http://127.0.0.1:6333) to enable Qdrant tools.",
    );
  }

  return {
    baseUrl,
    apiKey: typeof raw.apiKey === "string" && raw.apiKey.trim() ? raw.apiKey.trim() : undefined,
    timeoutMs: typeof raw.timeoutMs === "number" ? raw.timeoutMs : undefined,
    defaultVectorSize: typeof raw.defaultVectorSize === "number" ? raw.defaultVectorSize : undefined,
    defaultDistance:
      typeof raw.defaultDistance === "string"
        ? (raw.defaultDistance as QdrantPluginConfig["defaultDistance"])
        : undefined,
    preferGrpc: Boolean(raw.preferGrpc),
  };
}

function readObject(params: unknown): JsonRecord {
  if (!params || typeof params !== "object" || Array.isArray(params)) {
    throw new Error("tool parameters must be an object");
  }
  return params as JsonRecord;
}

function readString(params: JsonRecord, key: string, options?: { required?: boolean }) {
  const value = params[key];
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  if (options?.required) {
    throw new Error(`${key} is required`);
  }
  return undefined;
}

function readNumber(params: JsonRecord, key: string) {
  const value = params[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readBoolean(params: JsonRecord, key: string) {
  const value = params[key];
  return typeof value === "boolean" ? value : undefined;
}

function readArray<T>(params: JsonRecord, key: string): T[] | undefined {
  const value = params[key];
  return Array.isArray(value) ? (value as T[]) : undefined;
}

function readJsonRecord(params: JsonRecord, key: string): JsonRecord | undefined {
  const value = params[key];
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  return value as JsonRecord;
}

function formatError(error: unknown) {
  if (error instanceof QdrantError) {
    return {
      error: error.message,
      status: error.status,
      details: error.details,
    };
  }
  if (error instanceof Error) {
    return { error: error.message };
  }
  return { error: String(error) };
}

function withErrorHandling<TParams>(
  handler: (params: TParams) => Promise<unknown>,
): (_toolCallId: string, params: unknown) => Promise<JsonResult> {
  return async (_toolCallId, params) => {
    try {
      return jsonResult(await handler(params as TParams));
    } catch (error) {
      return jsonResult(formatError(error));
    }
  };
}

function buildCollectionCreateInput(
  params: JsonRecord,
  config: QdrantPluginConfig,
): CreateCollectionInput {
  const vectorSize = readNumber(params, "vectorSize") ?? config.defaultVectorSize;
  if (!vectorSize) {
    throw new Error("vectorSize is required for create_collection when no defaultVectorSize is configured");
  }

  return {
    collection: readString(params, "collection", { required: true })!,
    vectorSize,
    distance: (readString(params, "distance") as CreateCollectionInput["distance"]) ??
      config.defaultDistance ??
      "Cosine",
    onDiskPayload: readBoolean(params, "onDiskPayload"),
    shardNumber: readNumber(params, "shardNumber"),
    replicationFactor: readNumber(params, "replicationFactor"),
  };
}

function buildUpsertInput(params: JsonRecord): UpsertPointsInput {
  const points = readArray<UpsertPointsInput["points"][number]>(params, "points");
  if (!points || points.length === 0) {
    throw new Error("points must contain at least one point for upsert");
  }

  return {
    collection: readString(params, "collection", { required: true })!,
    wait: readBoolean(params, "wait"),
    points,
  };
}

function buildDeleteInput(params: JsonRecord): DeletePointsInput {
  return {
    collection: readString(params, "collection", { required: true })!,
    wait: readBoolean(params, "wait"),
    ids: readArray<string | number>(params, "ids"),
    filter: readJsonRecord(params, "filter"),
  };
}

function buildSearchInput(params: JsonRecord): SearchPointsInput {
  const queryVector = readArray<number>(params, "queryVector");
  if (!queryVector || queryVector.length === 0) {
    throw new Error("queryVector must be a non-empty number array");
  }

  return {
    collection: readString(params, "collection", { required: true })!,
    queryVector,
    limit: readNumber(params, "limit"),
    withPayload: (params.withPayload as SearchPointsInput["withPayload"]) ?? undefined,
    withVector: (params.withVector as SearchPointsInput["withVector"]) ?? undefined,
    scoreThreshold: readNumber(params, "scoreThreshold"),
    filter: readJsonRecord(params, "filter"),
  };
}

function buildScrollInput(params: JsonRecord): ScrollPointsInput {
  return {
    collection: readString(params, "collection", { required: true })!,
    limit: readNumber(params, "limit"),
    offset:
      typeof params.offset === "string" || typeof params.offset === "number"
        ? (params.offset as string | number)
        : undefined,
    withPayload: (params.withPayload as ScrollPointsInput["withPayload"]) ?? undefined,
    withVector: (params.withVector as ScrollPointsInput["withVector"]) ?? undefined,
    filter: readJsonRecord(params, "filter"),
  };
}

const plugin = {
  id: "openclaw-qdrant-plugin",
  name: "Qdrant",
  description: "Qdrant vector database tools for OpenClaw",
  register(api: OpenClawPluginApi) {
    let client: QdrantClient;
    let config: QdrantPluginConfig;

    try {
      config = readPluginConfig(api);
      client = new QdrantClient(config);
    } catch (error) {
      api.logger.warn(`qdrant: plugin disabled: ${error instanceof Error ? error.message : String(error)}`);
      return;
    }

    if (config.preferGrpc) {
      api.logger.info("qdrant: preferGrpc is set but current plugin transport is REST-only");
    }

    api.registerTool(
      {
        name: "qdrant_health",
        label: "Qdrant Health",
        description: "Verify that OpenClaw can connect to the configured Qdrant instance.",
        parameters: qdrantHealthSchema,
        execute: withErrorHandling(async () => {
          const result = await client.healthCheck();
          return { action: "health", ...result };
        }),
      },
      { name: "qdrant_health" },
    );

    api.registerTool(
      {
        name: "qdrant_collection",
        label: "Qdrant Collection",
        description: "Manage Qdrant collections. Actions: create, get, list, delete.",
        parameters: qdrantCollectionSchema,
        execute: withErrorHandling(async (rawParams) => {
          const params = readObject(rawParams);
          const action = readString(params, "action", { required: true });

          switch (action) {
            case "create": {
              const input = buildCollectionCreateInput(params, config);
              return {
                action,
                collection: input.collection,
                result: await client.createCollection(input),
              };
            }
            case "get":
              return {
                action,
                collection: readString(params, "collection", { required: true }),
                result: await client.getCollection(readString(params, "collection", { required: true })!),
              };
            case "list":
              return {
                action,
                result: await client.listCollections(),
              };
            case "delete":
              return {
                action,
                collection: readString(params, "collection", { required: true }),
                result: await client.deleteCollection(
                  readString(params, "collection", { required: true })!,
                ),
              };
            default:
              throw new Error(`unsupported action: ${String(action)}`);
          }
        }),
      },
      { name: "qdrant_collection" },
    );

    api.registerTool(
      {
        name: "qdrant_points",
        label: "Qdrant Points",
        description: "Upsert or delete points in a Qdrant collection.",
        parameters: qdrantPointsSchema,
        execute: withErrorHandling(async (rawParams) => {
          const params = readObject(rawParams);
          const action = readString(params, "action", { required: true });

          switch (action) {
            case "upsert":
              return {
                action,
                collection: readString(params, "collection", { required: true }),
                count: readArray(params, "points")?.length ?? 0,
                result: await client.upsertPoints(buildUpsertInput(params)),
              };
            case "delete":
              return {
                action,
                collection: readString(params, "collection", { required: true }),
                result: await client.deletePoints(buildDeleteInput(params)),
              };
            default:
              throw new Error(`unsupported action: ${String(action)}`);
          }
        }),
      },
      { name: "qdrant_points" },
    );

    api.registerTool(
      {
        name: "qdrant_query",
        label: "Qdrant Query",
        description: "Search or scroll points in a Qdrant collection.",
        parameters: qdrantQuerySchema,
        execute: withErrorHandling(async (rawParams) => {
          const params = readObject(rawParams);
          const action = readString(params, "action", { required: true });

          switch (action) {
            case "search":
              return {
                action,
                collection: readString(params, "collection", { required: true }),
                result: await client.searchPoints(buildSearchInput(params)),
              };
            case "scroll":
              return {
                action,
                collection: readString(params, "collection", { required: true }),
                result: await client.scrollPoints(buildScrollInput(params)),
              };
            default:
              throw new Error(`unsupported action: ${String(action)}`);
          }
        }),
      },
      { name: "qdrant_query" },
    );

    api.registerCli(
      ({ program }) => {
        const qdrant = program.command("qdrant").description("Qdrant plugin diagnostics");

        qdrant.command("health").description("Check Qdrant connectivity").action(async () => {
          console.log(JSON.stringify(await client.healthCheck(), null, 2));
        });

        qdrant.command("collections").description("List Qdrant collections").action(async () => {
          console.log(JSON.stringify(await client.listCollections(), null, 2));
        });
      },
      { commands: ["qdrant"] },
    );

    api.logger.info(`qdrant: registered tools against ${config.baseUrl}`);
  },
};

export default plugin;
