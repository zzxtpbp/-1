/**
 * 2.5D 浮雕插件（性能优化版）
 *
 * 优化要点：
 *  1. 无持续 RAF loop — setRotation / setScale / updatePixels 里直接 draw() 一次性渲染
 *  2. shader 简化 — 法线用 dFdx/dFdy（硬件导数指令，比手动采样快 2×）
 *  3. 纹理预处理 — 输入 RGBA 压缩到 MAX_TEX 分辨率再上传
 *  4. uniform location 缓存 — 避免每帧 gl.getUniformLocation
 */

const MAX_TEX = 128

const VERT = `
attribute vec2 a_pos;
attribute vec2 a_uv;
uniform mat3 u_matrix;
varying vec2 v_uv;
void main() {
  vec3 p = u_matrix * vec3(a_pos, 1.0);
  gl_Position = vec4(p.xy, 0.0, p.z);
  v_uv = a_uv;
}
`

const FRAG = `
precision mediump float;
uniform sampler2D u_color;
uniform sampler2D u_depth;
varying vec2 v_uv;

void main() {
  vec4 color = texture2D(u_color, v_uv);
  if (color.a < 0.02) discard;

  // hardware derivative — 比手动 4 次 texture2D 快很多
  float dzdx = dFdx(texture2D(u_depth, v_uv).r);
  float dzdy = dFdy(texture2D(u_depth, v_uv).r);
  vec3 n = normalize(vec3(-dzdx * 16.0, -dzdy * 16.0, 1.0));

  vec3 lightDir = vec3(0.5, 0.8, 0.6);
  float ndl = max(dot(n, normalize(lightDir)), 0.0);
  vec3 lit = color.rgb * (0.45 + 0.55 * ndl);

  gl_FragColor = vec4(lit, color.a);
}
`

export type Relief3DHandle = {
  render(): void
  setRotation(rotX: number, rotY: number): void
  setScale(s: number): void
  updatePixels(rgba: Uint8ClampedArray, width: number, height: number): void
  dispose(): void
}

export function createRelief3D(
  canvas: WechatMiniprogram.CanvasNode,
  initialRgba?: Uint8ClampedArray,
  width?: number,
  height?: number,
): Relief3DHandle {
  const gl = (canvas as any).getContext('webgl') as WebGLRenderingContext | null
  if (!gl) {
    console.warn('[relief3d] webgl unavailable')
    return createNoopHandle()
  }

  const program = compileProgram(gl, VERT, FRAG)

  const quadVerts = new Float32Array([
    -1, -1, 0, 1,
     1, -1, 1, 1,
    -1,  1, 0, 0,
     1,  1, 1, 0,
  ])
  const quadIdx = new Uint16Array([0, 1, 2, 1, 3, 2])

  const vbo = gl.createBuffer()!
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo)
  gl.bufferData(gl.ARRAY_BUFFER, quadVerts, gl.STATIC_DRAW)

  const ibo = gl.createBuffer()!
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo)
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, quadIdx, gl.STATIC_DRAW)

  const aPos = gl.getAttribLocation(program, 'a_pos')
  const aUv = gl.getAttribLocation(program, 'a_uv')
  gl.enableVertexAttribArray(aPos)
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 16, 0)
  gl.enableVertexAttribArray(aUv)
  gl.vertexAttribPointer(aUv, 2, gl.FLOAT, false, 16, 8)

  const texColor = gl.createTexture()!
  const texDepth = gl.createTexture()!

  // 缓存 uniform location
  const uMatrixLoc = gl.getUniformLocation(program, 'u_matrix')
  const uColorLoc = gl.getUniformLocation(program, 'u_color')
  const uDepthLoc = gl.getUniformLocation(program, 'u_depth')

  let rotX = 0.25
  let rotY = 0
  let scale = 0.85
  let disposed = false

  gl.enable(gl.BLEND)
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)

  // ---------- 纹理上传 ----------
  function resampleRGBA(src: Uint8ClampedArray, sw: number, sh: number, tw: number, th: number): Uint8ClampedArray {
    const out = new Uint8ClampedArray(tw * th * 4)
    for (let y = 0; y < th; y += 1) {
      const sy = Math.min(sh - 1, Math.round((y * sh) / th))
      for (let x = 0; x < tw; x += 1) {
        const sx = Math.min(sw - 1, Math.round((x * sw) / tw))
        const si = (sy * sw + sx) * 4
        const oi = (y * tw + x) * 4
        out[oi] = src[si]
        out[oi + 1] = src[si + 1]
        out[oi + 2] = src[si + 2]
        out[oi + 3] = src[si + 3]
      }
    }
    return out
  }

  function buildDepth(rgba: Uint8ClampedArray, w: number, h: number): Uint8Array {
    const depth = new Uint8Array(w * h)
    for (let i = 0; i < w * h; i += 1) {
      const o = i * 4
      const lum = Math.round(0.299 * rgba[o] + 0.587 * rgba[o + 1] + 0.114 * rgba[o + 2])
      depth[i] = Math.round(lum * (rgba[o + 3] / 255))
    }
    return depth
  }

  function uploadAll(rgba: Uint8ClampedArray, w: number, h: number) {
    // 压缩纹理到 MAX_TEX
    const compress = Math.min(1, MAX_TEX / Math.max(w, h))
    const tw = Math.max(4, Math.round(w * compress))
    const th = Math.max(4, Math.round(h * compress))
    const packed = resampleRGBA(rgba, w, h, tw, th)
    const depth = buildDepth(packed, tw, th)

    gl.bindTexture(gl.TEXTURE_2D, texColor)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, tw, th, 0, gl.RGBA, gl.UNSIGNED_BYTE, packed)

    gl.bindTexture(gl.TEXTURE_2D, texDepth)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    // LUMINANCE 格式 — 节省带宽
    ;(gl as any).texImage2D(gl.TEXTURE_2D, 0, (gl as any).LUMINANCE, tw, th, 0, (gl as any).LUMINANCE, gl.UNSIGNED_BYTE, depth)
  }

  // 初始占位纹理
  ;(function initDummy() {
    const w = 32, h = 32
    const dummy = new Uint8ClampedArray(w * h * 4)
    for (let y = 0; y < h; y += 1)
      for (let x = 0; x < w; x += 1) {
        const i = (y * w + x) * 4
        const inside = ((x - w / 2) ** 2 + (y - h / 2) ** 2) < (w / 3) ** 2
        dummy[i] = inside ? 200 : 240
        dummy[i + 1] = inside ? 160 : 240
        dummy[i + 2] = inside ? 120 : 240
        dummy[i + 3] = inside ? 255 : 0
      }
    uploadAll(dummy, w, h)
  })()

  if (initialRgba && width && height) uploadAll(initialRgba, width, height)

  // ---------- 单次 draw ----------
  function draw() {
    if (disposed) return
    const { width: cw, height: ch } = canvas
    gl.viewport(0, 0, cw, ch)
    gl.clearColor(0.96, 0.97, 0.98, 1.0)
    gl.clear(gl.COLOR_BUFFER_BIT)

    gl.useProgram(program)

    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, texColor)
    gl.uniform1i(uColorLoc, 0)

    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, texDepth)
    gl.uniform1i(uDepthLoc, 1)

    const s = scale
    const cosY = Math.cos(rotY)
    const sinY = Math.sin(rotY)
    const shearY = sinY * 0.25
    const shearX = rotX * 0.3

    gl.uniformMatrix3fv(uMatrixLoc, false, new Float32Array([
      s * cosY,  s * shearX, 0,
      s * shearY, s,          0,
      0,        0,           1,
    ]))

    gl.bindBuffer(gl.ARRAY_BUFFER, vbo)
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo)
    gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0)
  }

  // 立即渲染一次
  draw()

  return {
    render() { draw() },
    setRotation(rx, ry) {
      rotX = clamp(rx, -0.6, 0.6)
      rotY = clamp(ry, -1.2, 1.2)
      draw()
    },
    setScale(s) {
      scale = clamp(s, 0.35, 2.0)
      draw()
    },
    updatePixels(rgba, w, h) {
      uploadAll(rgba, w, h)
      draw()
    },
    dispose() {
      disposed = true
      try {
        gl.deleteBuffer(vbo)
        gl.deleteBuffer(ibo)
        gl.deleteTexture(texColor)
        gl.deleteTexture(texDepth)
        gl.deleteProgram(program)
      } catch { /* ignore */ }
    },
  }
}

function compileProgram(gl: WebGLRenderingContext, vs: string, fs: string): WebGLProgram {
  const compile = (type: number, src: string) => {
    const sh = gl.createShader(type)!
    gl.shaderSource(sh, src)
    gl.compileShader(sh)
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(sh)
      gl.deleteShader(sh)
      throw new Error(`Shader compile fail: ${log}`)
    }
    return sh
  }
  const vsObj = compile(gl.VERTEX_SHADER, vs)
  const fsObj = compile(gl.FRAGMENT_SHADER, fs)
  const prog = gl.createProgram()!
  gl.attachShader(prog, vsObj)
  gl.attachShader(prog, fsObj)
  gl.linkProgram(prog)
  gl.deleteShader(vsObj)
  gl.deleteShader(fsObj)
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(prog)
    throw new Error(`Program link fail: ${log}`)
  }
  return prog
}

function createNoopHandle(): Relief3DHandle {
  const noop = () => {}
  return { render: noop, setRotation: noop, setScale: noop, updatePixels: noop, dispose: noop }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v))
}
