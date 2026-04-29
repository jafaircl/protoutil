import {
  type ConnectionOptions,
  connect,
  type JetStreamClient,
  type JetStreamManager,
  type NatsConnection,
} from "nats";

interface SharedNatsConnection {
  key: string;
  connection: NatsConnection;
  jetstream: JetStreamClient;
  manager: JetStreamManager;
}

interface SharedNatsConnectionEntry {
  refs: number;
  startup: Promise<SharedNatsConnection>;
}

const sharedConnections = new Map<string, SharedNatsConnectionEntry>();

/** Acquire one shared NATS connection bundle for a server/config pair. */
export async function acquireSharedNatsConnection(options: {
  servers?: string | string[];
  connectionOptions?: Omit<ConnectionOptions, "servers">;
}): Promise<SharedNatsConnection> {
  const key = connectionKey(options);
  let entry = sharedConnections.get(key);
  if (!entry) {
    // Transport and scheduler instances often point at the same broker. Pool
    // the underlying connection so scheduled delivery does not pay for a
    // second JetStream session with identical settings.
    entry = {
      refs: 0,
      startup: createSharedConnection(key, options),
    };
    sharedConnections.set(key, entry);
  }
  entry.refs += 1;
  try {
    return await entry.startup;
  } catch (error) {
    entry.refs -= 1;
    if (entry.refs === 0 && sharedConnections.get(key) === entry) {
      sharedConnections.delete(key);
    }
    throw error;
  }
}

/** Release one acquired shared NATS connection bundle. */
export async function releaseSharedNatsConnection(key: string): Promise<void> {
  const entry = sharedConnections.get(key);
  if (!entry) {
    return;
  }
  entry.refs -= 1;
  if (entry.refs > 0) {
    return;
  }
  sharedConnections.delete(key);
  const shared = await entry.startup.catch(() => undefined);
  await shared?.connection.close();
}

/** Open one physical NATS connection and derive the shared JetStream clients. */
async function createSharedConnection(
  key: string,
  options: {
    servers?: string | string[];
    connectionOptions?: Omit<ConnectionOptions, "servers">;
  },
): Promise<SharedNatsConnection> {
  const connection = await connect({
    ...options.connectionOptions,
    servers: options.servers,
  });
  return {
    key,
    connection,
    jetstream: connection.jetstream(),
    manager: await connection.jetstreamManager(),
  };
}

/** Build a stable pool key from the NATS target and serializable options. */
function connectionKey(options: {
  servers?: string | string[];
  connectionOptions?: Omit<ConnectionOptions, "servers">;
}): string {
  return JSON.stringify({
    servers: options.servers,
    connectionOptions: stableValue(options.connectionOptions),
  });
}

/** Sort plain-object keys so equivalent configs share one pool entry. */
function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => stableValue(item));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, stableValue(nested)]),
    );
  }
  return value;
}
