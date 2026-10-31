// English popup messages, grouped for a future translation layer. Static labels live in popup.html.
export const ui = {
 history: {
  loadError:'Unable to load history.', noProbe:'No playback probe received yet.',
  paused:'Logging paused. History remains on this device.', pause:'Pause logging', resume:'Resume logging',
  cleared:'Local history cleared.', clearError:'Could not clear history. Try again or keep your history.',
  deleting:'Deleting…', delete:'Delete history', unavailable:'Unavailable',
  video:'YouTube video · Channel: ', music:'YouTube Music · '
 },
 recording: {paused:'Logging paused', recording:'Recording selected tab', waiting:'Ready to record'},
 appearance: {
  restoreError:'Appearance could not be restored. Using System.',
  saved:'Appearance saved on this device.',
  saveError:'Appearance could not be saved. Previous setting restored; try again.'
 },
 sharing: {
  expired:'Session expired. Disconnect and reconnect.', publishing:'Publishing new plays', off:'Sharing is off',
  localOnly:'Sharing is off. Local-only operation.', failed:'Sharing failed.',
  revokeError:' Uploads are stopped locally. Retry to remove public plays immediately; otherwise they expire within 24 hours.',
  invalidOrigin:'Enter an HTTPS backend origin without a path.', permissionError:'Backend access was not granted.',
  connectionError:'Connection failed.'
 }
};
