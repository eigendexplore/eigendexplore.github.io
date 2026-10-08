// Pixel columns read back from a WebGL2 canvas without stalling the page. A plain gl.readPixels into memory waits for
// the GPU to finish everything queued (a few ms, more on a slow machine: a hitch in a smooth scroll); here the pixels
// are copied into a GPU buffer right after the frame (in GPU order, so later draws do not change them) and fetched a
// frame or two later, once a fence says the GPU is done.
// cols: [x, y, n] in device pixels, y from the bottom. Resolves to one Uint8Array of n RGBA pixels per column.
export function readColumns(gl, cols) {
  const size = cols.reduce((a, c) => a + c[2] * 4, 0), pbo = gl.createBuffer(), offs = [];
  gl.bindBuffer(gl.PIXEL_PACK_BUFFER, pbo);
  gl.bufferData(gl.PIXEL_PACK_BUFFER, size, gl.STREAM_READ);
  let off = 0;
  for (const [x, y, n] of cols) { gl.readPixels(x, y, 1, n, gl.RGBA, gl.UNSIGNED_BYTE, off); offs.push(off); off += n * 4; }
  gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
  const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
  gl.flush();
  return new Promise(res => {
    const poll = () => {
      if (gl.clientWaitSync(sync, 0, 0) === gl.TIMEOUT_EXPIRED) { requestAnimationFrame(poll); return; }
      const all = new Uint8Array(size);
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, pbo);
      gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, all);
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
      gl.deleteSync(sync); gl.deleteBuffer(pbo);
      res(cols.map(([, , n], i) => all.subarray(offs[i], offs[i] + n * 4)));
    };
    requestAnimationFrame(poll);
  });
}
