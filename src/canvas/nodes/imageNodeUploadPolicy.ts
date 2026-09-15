export function canManuallyUploadMedia(
  hasIncomingConnection: boolean,
  mediaInputMode?: 'upload' | 'generation-only',
) {
  return !hasIncomingConnection && mediaInputMode !== 'generation-only';
}

export function shouldHideMediaNodeInputs(
  isVideoNode: boolean,
  hasIncomingConnection: boolean,
  referenceOnly: boolean,
) {
  return referenceOnly || (isVideoNode && !hasIncomingConnection);
}
