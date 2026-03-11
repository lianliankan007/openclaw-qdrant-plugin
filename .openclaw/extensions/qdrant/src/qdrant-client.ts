type JsonObject = Record<string, unknown>;

export type QdrantPluginConfig = {
  baseUrl: string;
  apiKey?: string;
  timeoutMs?: number;
  defaultVectorSize?: number;
  defaultDistance?: "Cosine" | "Dot" | "Euclid" | "Manhattan";
  preferGrpc?: boolean;
};

export type CreateCollectionInput = {
  collection: string;
  vectorSize: number;
  distance: NonNullable<QdrantPluginConfig["defaultDistance"]>;
  onDiskPayload?: boolean;
  shardNumber?: number;
  replicationFactor?: number;
};

export type UpsertPointsInput = {
  collection: string;
  wait?: boolean;
  points: Array<{
    id: string | number;
    vector: number[] | Record<string, number[]>;
    payload?: JsonObject;
  }>;
};

export type DeletePointsInput = {
  collection: string;
  wait?: boolean;
  ids?: Array<string | number>;
  filter?: JsonObject;
};

export type SearchPointsInput = {
  collection: string;
  queryVector: number[];
  limit?: number;
  withPayload?: boolean | string[];
  withVector?: boolean | string[];
  scoreThreshold?: number;
  filter?: JsonObject;
};

export type ScrollPointsInput = {
  collection: string;
  limit?: number;
  offset?: string | number;
  withPayload?: boolean | string[];
  withVector?: boolean | string[];
  filter?: JsonObject;
};

export class QdrantError extends Error {
  readonly status?: number;
  readonly details?: unknown;

  constructor(message: string, options?: { status?: number; details?: unknown; cause?: unknown }) {
    super(message, options?.cause ? { cause: options.cause } : undefined);
    this.name = "QdrantError";
    this.status = options?.status;
    this.details = options?.details;
  }
}

export class QdrantClient {
  private readonly config: QdrantPluginConfig;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(config: QdrantPluginConfig) {
    this.config = config;
    this.baseUrl = config.baseUrl.replace(/\/+$/, "");
    this.timeoutMs = config.timeoutMs ?? 15_000;
  }

  async healthCheck() {
    const collections = await this.request<{ collections?: Array<{ name?: string }> }>(
      "GET",
      "/collections",
    );

    return {
      ok: true,
      baseUrl: this.baseUrl,
      collectionsCount: collections.collections?.length ?? 0,
      collections: collections.collections?.map((entry) => entry.name).filter(Boolean) ?? [],
    };
  }

  listCollections() {
    return this.request("GET", "/collections");
  }

  getCollection(collection: string) {
    return this.request("GET", `/collections/${encodeURIComponent(collection)}`);
  }

  createCollection(input: CreateCollectionInput) {
    return this.request("PUT", `/collections/${encodeURIComponent(input.collection)}`, {
      vectors: {
        size: input.vectorSize,
        distance: input.distance,
      },
      on_disk_payload: input.onDiskPayload,
      shard_number: input.shardNumber,
      replication_factor: input.replicationFactor,
    });
  }

  deleteCollection(collection: string) {
    return this.request("DELETE", `/collections/${encodeURIComponent(collection)}`);
  }

  upsertPoints(input: UpsertPointsInput) {
    return this.request(
      "PUT",
      `/collections/${encodeURIComponent(input.collection)}/points?wait=${String(Boolean(input.wait))}`,
      { points: input.points },
    );
  }

  deletePoints(input: DeletePointsInput) {
    const selector =
      input.ids && input.ids.length > 0
        ? { points: input.ids }
        : input.filter
          ? { filter: input.filter }
          : null;
    if (!selector) {
      throw new QdrantError("delete requires ids or filter");
    }

    return this.request(
      "POST",
      `/collections/${encodeURIComponent(input.collection)}/points/delete?wait=${String(Boolean(input.wait))}`,
      selector,
    );
  }

  searchPoints(input: SearchPointsInput) {
    return this.request("POST", `/collections/${encodeURIComponent(input.collection)}/points/query`, {
      query: input.queryVector,
      limit: input.limit ?? 10,
      with_payload: input.withPayload ?? true,
      with_vector: input.withVector ?? false,
      score_threshold: input.scoreThreshold,
      filter: input.filter,
    });
  }

  scrollPoints(input: ScrollPointsInput) {
    return this.request("POST", `/collections/${encodeURIComponent(input.collection)}/points/scroll`, {
      limit: input.limit ?? 10,
      offset: input.offset,
      with_payload: input.withPayload ?? true,
      with_vector: input.withVector ?? false,
      filter: input.filter,
    });
  }

  private async request<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: this.buildHeaders(body),
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });

      const payload = await this.readPayload(response);

      if (!response.ok) {
        throw new QdrantError(
          `Qdrant request failed with ${response.status} ${response.statusText}`,
          {
            status: response.status,
            details: payload,
          },
        );
      }

      return this.unwrapResult(payload) as T;
    } catch (error) {
      if (error instanceof QdrantError) {
        throw error;
      }
      if (error instanceof Error && error.name === "AbortError") {
        throw new QdrantError(`Qdrant request timed out after ${this.timeoutMs}ms`, {
          cause: error,
        });
      }
      throw new QdrantError("Qdrant request failed", { cause: error });
    } finally {
      clearTimeout(timeout);
    }
  }

  private buildHeaders(body: unknown) {
    const headers = new Headers();
    headers.set("accept", "application/json");
    if (body !== undefined) {
      headers.set("content-type", "application/json");
    }
    if (this.config.apiKey) {
      headers.set("api-key", this.config.apiKey);
    }
    return headers;
  }

  private async readPayload(response: Response) {
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      return response.json();
    }
    return response.text();
  }

  private unwrapResult(payload: unknown) {
    if (payload && typeof payload === "object" && "result" in (payload as JsonObject)) {
      return (payload as JsonObject).result;
    }
    return payload;
  }
}
