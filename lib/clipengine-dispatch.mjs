import {clipengineConfig,assertClipengineReady} from './clipengine-config.mjs';

/**
 * Shadow-safe dispatch boundary. This module deliberately refuses to create
 * fake completed clips or jobs without authenticated, durable dependencies.
 * Production route wiring must preserve its current owner and response shape.
 */
export class ClipengineUnavailableError extends Error {
  constructor(message = 'CreatorOS native processing is not ready') {
    super(message);
    this.name = 'ClipengineUnavailableError';
    this.status = 503;
  }
}

export async function dispatchClipengine({owner,sourceUrl,dependencies,config=clipengineConfig()}) {
  if (!config.active) return {handled:false};
  if (!owner?.id || !dependencies?.verifyOwner) throw new ClipengineUnavailableError('Authenticated owner required');
  const verified = await dependencies.verifyOwner(owner.id);
  if (!verified) throw new ClipengineUnavailableError('Owner verification failed');
  try {
    assertClipengineReady(config, {
      authenticatedOwner:true,
      durableStorage:Boolean(dependencies.storeResult),
      workerLauncher:Boolean(dependencies.launchWorker),
    });
  } catch (error) {throw new ClipengineUnavailableError(error.message);}
  if (!/^https:\/\/(?:www\.|m\.)?(?:youtube\.com|youtu\.be)\//i.test(sourceUrl)) {
    throw new ClipengineUnavailableError('Unsupported source URL');
  }
  // The route owns its import record; never insert a second row here.
  if (!dependencies.importId) throw new ClipengineUnavailableError('Existing import record required');
  const launched = await dependencies.launchWorker({
    importId:dependencies.importId,
    ownerId:owner.id,
    sourceUrl,
    stages:{transcribe:config.transcribe,render:config.render},
  });
  return {handled:true,launched};
}
