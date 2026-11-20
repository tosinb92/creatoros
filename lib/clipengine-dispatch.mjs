import {clipengineConfig,assertClipengineReady} from './clipengine-config.mjs';

export class ClipengineUnavailableError extends Error {
  constructor(message = 'CreatorOS native processing is not ready', code = 'CLIPENGINE_UNAVAILABLE') {
    super(message);
    this.name = 'ClipengineUnavailableError';
    this.code = code;
    this.status = 503;
  }
}

/** The route creates the import row; dispatch only verifies and launches it.
 * Dependencies are server-side implementations, never client-supplied values.
 * markFailed must map to the existing frontend's terminal failure vocabulary.
 */
export async function dispatchClipengine({owner,sourceUrl,dependencies,config=clipengineConfig()}) {
  if (!config.active) return {handled:false};
  const importId = dependencies?.importId;
  if (!owner?.id || !dependencies?.verifyOwner) throw new ClipengineUnavailableError('Authenticated owner required','AUTH_REQUIRED');
  if (!importId || !dependencies?.verifyImportOwnership) throw new ClipengineUnavailableError('Import ownership verification unavailable','OWNERSHIP_CHECK_MISSING');
  if (!(await dependencies.verifyOwner(owner.id))) throw new ClipengineUnavailableError('Owner verification failed','AUTH_FAILED');
  if (!(await dependencies.verifyImportOwnership({importId,ownerId:owner.id}))) throw new ClipengineUnavailableError('Import does not belong to authenticated owner','IMPORT_FORBIDDEN');
  // Once ownership is verified, failures must be visible to the owner via polling.
  try {
    assertClipengineReady(config, {
      authenticatedOwner:true,
      durableStorage:Boolean(dependencies.storeResult),
      workerLauncher:Boolean(dependencies.launchWorker),
    });
    const parsed = new URL(sourceUrl);
    const host = parsed.hostname.toLowerCase();
    if (parsed.protocol !== 'https:' || !['youtube.com','www.youtube.com','m.youtube.com','youtu.be','www.youtu.be'].includes(host)) {
      throw new ClipengineUnavailableError('Unsupported source URL','INVALID_SOURCE');
    }
    const launched = await dependencies.launchWorker({
      importId,ownerId:owner.id,sourceUrl,
      engine:'clipengine',revision:config.revision,
      stages:{transcribe:config.transcribe,render:config.render},
    });
    return {handled:true,launched};
  } catch (error) {
    const failure = error instanceof ClipengineUnavailableError ? error : new ClipengineUnavailableError('Native processing launch failed','LAUNCH_FAILED');
    if (typeof dependencies.markFailed !== 'function') throw new ClipengineUnavailableError('Failure-state writer is required','FAILURE_WRITER_MISSING');
    try {
      await dependencies.markFailed({importId,ownerId:owner.id,code:failure.code,message:failure.message,revision:config.revision});
    } catch {throw new ClipengineUnavailableError('Unable to persist processing failure','FAILURE_WRITE_FAILED');}
    throw failure;
  }
}
