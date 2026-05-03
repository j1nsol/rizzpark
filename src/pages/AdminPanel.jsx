/**
 * AdminPanel page — accessible at /admin
 *
 * This is the Pi control dashboard (MJPEG stream, slot editor, program config,
 * undistort tuning, remap controls). It requires LAN access to the Raspberry Pi.
 *
 * The full admin UI lives in AdminApp.jsx (the original monolithic App.js).
 * This wrapper just mounts it at the /admin route.
 */

import AdminApp from './AdminApp';

export default function AdminPanel() {
  return <AdminApp />;
}
