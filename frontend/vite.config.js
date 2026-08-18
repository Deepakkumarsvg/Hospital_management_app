import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,

    // Listen on every interface, IPv4 included.
    //
    // Without this Vite binds to the string "localhost", which Node resolves
    // verbatim — and on Windows that is ::1 ONLY, with nothing on 127.0.0.1.
    // The page still loads, because browsers retry an HTTP connection on the
    // other address family; the HMR WebSocket does not retry, so it fails
    // outright with "WebSocket connection to 'ws://localhost:5173' failed".
    //
    // A dead HMR socket does not just cost live reload. The tab stops
    // receiving module updates while continuing to serve the modules it
    // already has, so an edited file keeps its OLD contents in the browser —
    // which surfaces as a nonsense error about an export that is plainly
    // there in the source ("does not provide an export named 'forgotPassword'").
    //
    // Binding to all interfaces also puts the dev server on the LAN, which is
    // what lets you open it on a phone or a ward tablet. Narrow this to
    // '127.0.0.1' if that is not wanted on your network.
    host: true,

    proxy: {
      // Forward API calls to the Express backend during development.
      //
      // 127.0.0.1 rather than "localhost" for the same reason as above: this
      // is a Node-side lookup, and pinning the family keeps it working
      // whichever stack the API happens to be listening on.
      '/api': {
        target: 'http://127.0.0.1:5000',
        changeOrigin: true,
      },
    },
  },
});
