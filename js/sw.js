/**
 * Service Worker – Asset Patch for Subway Surfers (local dev)
 * Intercepts requests for missing audio files and returns silent WAV.
 * Also handles missing font files gracefully.
 */

// Activate immediately and take control of all pages
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

// Minimal silent WAV (44 bytes, 1ch 44100Hz 16-bit PCM, 0 samples)
const SILENT_WAV_B64 = 'UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';

function b64ToUint8Array(b64) {
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}

const SILENT_BYTES = b64ToUint8Array(SILENT_WAV_B64);

self.addEventListener('fetch', (event) => {
  const url = event.request.url;
  const isAudio = /\.(ogg|mp3|wav|m4a|aac)(\?|$)/i.test(url);

  if (!isAudio) return; // Let non-audio requests pass through normally

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (!response.ok) {
          console.log('[SW] Serving silent audio for:', url);
          return new Response(SILENT_BYTES.slice(), {
            status: 200,
            statusText: 'OK',
            headers: {
              'Content-Type': 'audio/wav',
              'Content-Length': String(SILENT_BYTES.byteLength),
            },
          });
        }
        return response;
      })
      .catch(() => {
        return new Response(SILENT_BYTES.slice(), {
          status: 200,
          statusText: 'OK',
          headers: {
            'Content-Type': 'audio/wav',
            'Content-Length': String(SILENT_BYTES.byteLength),
          },
        });
      })
  );
});
