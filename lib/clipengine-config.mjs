// CreatorOS Clipengine rollout switches. No production traffic changes by default.
export function clipengineConfig(env = process.env) {
  const enabled = value => String(value ?? '').toLowerCase() === 'true';
  return Object.freeze({
    active: enabled(env.CLIPENGINE_ACTIVE),
    transcribe: env.CLIPENGINE_TRANSCRIBE === undefined ? true : enabled(env.CLIPENGINE_TRANSCRIBE),
    render: env.CLIPENGINE_RENDER === undefined ? true : enabled(env.CLIPENGINE_RENDER),
  });
}

export function assertClipengineReady(config, dependencies) {
  if (!config.active) return false;
  if (!dependencies?.authenticatedOwner) throw new Error('Clipengine requires verified owner');
  if (!dependencies?.durableStorage) throw new Error('Clipengine requires durable storage');
  if (!dependencies?.workerLauncher) throw new Error('Clipengine requires worker launcher');
  return true;
}
