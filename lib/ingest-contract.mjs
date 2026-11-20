/**
 * CreatorOS ingest contract.
 * An adapter only obtains an authorised source; it never transcribes or renders.
 * Each adapter implements ingest(sourceRef, context) and may implement poll(sourceRef, context).
 * Context supplies storage and fetch dependencies; no platform credentials are persisted here.
 */
export class IngestError extends Error {
  constructor(code, message) { super(message); this.name = 'IngestError'; this.code = code; }
}
export function assertIngestResult(result) {
  if (!result || typeof result !== 'object') throw new IngestError('INVALID_RESULT', 'Ingest adapter returned no result');
  const {file_url, local_path, metadata} = result;
  if (Boolean(file_url) === Boolean(local_path)) throw new IngestError('INVALID_LOCATION', 'Exactly one source location is required');
  if (file_url) {
    let url;
    try { url = new URL(file_url); } catch { throw new IngestError('INVALID_URL', 'Invalid stored file URL'); }
    if (url.protocol !== 'https:') throw new IngestError('INVALID_URL', 'Stored file URL must use HTTPS');
  }
  if (local_path && (typeof local_path !== 'string' || !local_path.startsWith('/'))) throw new IngestError('INVALID_PATH', 'Local source path must be absolute');
  if (!metadata || typeof metadata.title !== 'string' || !metadata.title.trim() ||
      !Number.isFinite(metadata.duration) || metadata.duration <= 0 ||
      typeof metadata.source_platform !== 'string' || !metadata.source_platform.trim()) {
    throw new IngestError('INVALID_METADATA', 'Title, positive duration and source platform are required');
  }
  return Object.freeze({file_url: file_url || undefined, local_path: local_path || undefined,
    metadata: Object.freeze({title: metadata.title.trim(), duration: metadata.duration,
      source_platform: metadata.source_platform.trim(), source_id: metadata.source_id ?? null})});
}
export async function ingestWith(adapter, sourceRef, context) {
  if (!adapter || typeof adapter.ingest !== 'function') throw new IngestError('INVALID_ADAPTER', 'Missing ingest method');
  if (!context?.ownerId) throw new IngestError('UNAUTHENTICATED', 'Authenticated owner required');
  return assertIngestResult(await adapter.ingest(sourceRef, context));
}
export async function pollWith(adapter, sourceRef, context) {
  if (!adapter || typeof adapter.poll !== 'function') return [];
  if (!context?.ownerId || !context?.permissionGranted) throw new IngestError('UNAUTHORISED', 'Creator permission required');
  const items = await adapter.poll(sourceRef, context);
  if (!Array.isArray(items)) throw new IngestError('INVALID_POLL', 'Polling must return a list');
  return items;
}
