import React, { useRef, useEffect } from 'react';

export default function BackgroundCanvas({ type }) {
  const canvasRef = useRef(null);
  const rafRef = useRef(null);
  const glRef = useRef(null);

  useEffect(() => {
    if (!type || type === 'none') return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    let raf;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const resize = () => {
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      canvas.style.width = window.innerWidth + 'px';
      canvas.style.height = window.innerHeight + 'px';
    };
    resize();
    window.addEventListener('resize', resize);

    if (type === 'grainient') {
      const gl = canvas.getContext('webgl2', { alpha: false, antialias: false });
      if (!gl) return;
      glRef.current = gl;

      const vs = `#version 300 es
        in vec2 position;
        void main() { gl_Position = vec4(position, 0.0, 1.0); }`;

      const fs = `#version 300 es
        precision highp float;
        uniform vec2 iResolution;
        uniform float iTime;
        out vec4 fragColor;
        mat2 Rot(float a){float s=sin(a),c=cos(a);return mat2(c,-s,s,c);}
        vec2 hash(vec2 p){p=vec2(dot(p,vec2(2127.1,81.17)),dot(p,vec2(1269.5,283.37)));return fract(sin(p)*43758.5453);}
        float noise(vec2 p){vec2 i=floor(p),f=fract(p),u=f*f*(3.0-2.0*f);float n=mix(mix(dot(-1.0+2.0*hash(i),f),dot(-1.0+2.0*hash(i+vec2(1,0)),f-vec2(1,0)),u.x),mix(dot(-1.0+2.0*hash(i+vec2(0,1)),f-vec2(0,1)),dot(-1.0+2.0*hash(i+vec2(1,1)),f-vec2(1,1)),u.x),u.y);return 0.5+0.5*n;}
        void main(){
          float t=iTime*0.25;
          vec2 uv=gl_FragCoord.xy/iResolution.xy;
          float ratio=iResolution.x/iResolution.y;
          vec2 tuv=uv-0.5;
          tuv/=0.9;
          float degree=noise(vec2(t*0.1,tuv.x*tuv.y)*2.0);
          tuv.y*=1.0/ratio;
          tuv*=Rot(radians((degree-0.5)*500.0+180.0));
          tuv.y*=ratio;
          float amp=50.0;
          tuv.x+=sin(tuv.y*5.0+t*2.0)/amp;
          tuv.y+=sin(tuv.x*7.5+t*2.0)/(amp*0.5);
          vec3 c1=vec3(0.35,0.5,0.2);
          vec3 c2=vec3(0.0,0.502,0.502);
          vec3 c3=vec3(0.8,0.6,0.2);
          mat2 br=Rot(radians(0.0));
          float bx=(tuv*br).x;
          vec3 l1=mix(c3,c2,smoothstep(-0.3,-0.1+0.3,bx));
          vec3 l2=mix(c2,c1,smoothstep(-0.3,-0.1+0.3,bx));
          vec3 col=mix(l1,l2,smoothstep(0.5,-0.3,tuv.y));
          vec2 guv=uv*2.0+vec2(iTime*0.05);
          float grain=fract(sin(dot(guv,vec2(12.9898,78.233)))*43758.5453);
          col+=(grain-0.5)*0.1;
          col=(col-0.5)*1.5+0.5;
          col=clamp(col*0.35,0.0,1.0);
          fragColor=vec4(col,1.0);
        }`;

      function makeShader(gl, type, src) {
        const s = gl.createShader(type);
        gl.shaderSource(s, src);
        gl.compileShader(s);
        return s;
      }
      const prog = gl.createProgram();
      gl.attachShader(prog, makeShader(gl, gl.VERTEX_SHADER, vs));
      gl.attachShader(prog, makeShader(gl, gl.FRAGMENT_SHADER, fs));
      gl.linkProgram(prog);
      gl.useProgram(prog);

      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 3,-1, -1,3]), gl.STATIC_DRAW);
      const pos = gl.getAttribLocation(prog, 'position');
      gl.enableVertexAttribArray(pos);
      gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0);

      const uRes = gl.getUniformLocation(prog, 'iResolution');
      const uTime = gl.getUniformLocation(prog, 'iTime');
      const t0 = performance.now();

      const draw = () => {
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.uniform2f(uRes, canvas.width, canvas.height);
        gl.uniform1f(uTime, (performance.now() - t0) * 0.001);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        raf = requestAnimationFrame(draw);
      };
      raf = requestAnimationFrame(draw);

    } else if (type === 'particles') {
      const ctx = canvas.getContext('2d');
      const count = 80;
      const pts = Array.from({ length: count }, () => ({
        x: Math.random(), y: Math.random(), z: Math.random(),
        vx: (Math.random() - 0.5) * 0.0003, vy: (Math.random() - 0.5) * 0.0003,
        size: 1 + Math.random() * 2,
        color: ['rgba(139,92,246,', 'rgba(167,139,250,', 'rgba(34,197,94,'][Math.floor(Math.random() * 3)],
      }));
      const draw = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        pts.forEach(p => {
          p.x += p.vx; p.y += p.vy;
          if (p.x < 0 || p.x > 1) p.vx *= -1;
          if (p.y < 0 || p.y > 1) p.vy *= -1;
          const alpha = 0.15 + p.z * 0.2;
          ctx.beginPath();
          ctx.arc(p.x * canvas.width, p.y * canvas.height, p.size * dpr, 0, Math.PI * 2);
          ctx.fillStyle = p.color + alpha + ')';
          ctx.fill();
        });
        raf = requestAnimationFrame(draw);
      };
      raf = requestAnimationFrame(draw);

    } else if (type === 'squares') {
      const ctx = canvas.getContext('2d');
      const sz = 40 * dpr;
      const offset = { x: 0, y: 0 };
      const draw = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const startX = Math.floor(offset.x / sz) * sz;
        const startY = Math.floor(offset.y / sz) * sz;
        ctx.strokeStyle = 'rgba(255,255,255,0.04)';
        ctx.lineWidth = dpr;
        for (let x = startX; x < canvas.width + sz; x += sz) {
          for (let y = startY; y < canvas.height + sz; y += sz) {
            ctx.strokeRect(x - (offset.x % sz), y - (offset.y % sz), sz, sz);
          }
        }
        offset.x = (offset.x - 0.3 * dpr + sz) % sz;
        offset.y = (offset.y - 0.3 * dpr + sz) % sz;
        raf = requestAnimationFrame(draw);
      };
      raf = requestAnimationFrame(draw);

    } else if (type === 'dots') {
      const ctx = canvas.getContext('2d');
      const gap = 32 * dpr;
      const dotR = 2 * dpr;
      const draw = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        for (let x = gap; x < canvas.width; x += gap) {
          for (let y = gap; y < canvas.height; y += gap) {
            ctx.beginPath();
            ctx.arc(x, y, dotR, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(139,92,246,0.08)';
            ctx.fill();
          }
        }
        raf = requestAnimationFrame(draw);
      };
      raf = requestAnimationFrame(draw);

    } else if (type === 'snow') {
      const ctx = canvas.getContext('2d');
      const count = 120;
      const flakes = Array.from({ length: count }, () => ({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        size: (1 + Math.random() * 2) * dpr,
        speed: (0.3 + Math.random() * 0.7) * dpr,
        drift: (Math.random() - 0.5) * 0.3 * dpr,
        alpha: 0.05 + Math.random() * 0.1,
      }));
      const draw = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        flakes.forEach(f => {
          f.y += f.speed;
          f.x += f.drift;
          if (f.y > canvas.height) { f.y = -f.size; f.x = Math.random() * canvas.width; }
          if (f.x > canvas.width) f.x = 0;
          if (f.x < 0) f.x = canvas.width;
          ctx.fillStyle = `rgba(167,139,250,${f.alpha})`;
          ctx.fillRect(Math.floor(f.x), Math.floor(f.y), f.size, f.size);
        });
        raf = requestAnimationFrame(draw);
      };
      raf = requestAnimationFrame(draw);
    }

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, [type]);

  if (!type || type === 'none') return null;
  return <canvas key={type} ref={canvasRef} style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none' }} />;
}
