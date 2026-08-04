"use client";

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";
import type { HdChart } from "@/lib/human-design";
import {
  HD_CENTER_SHAPES,
  HD_CHANNEL_SEGMENTS,
  HD_GATE_ANCHORS,
} from "./bodygraph-geometry";

/** Map viewBox (400x700) coords to a centered 3D plane. */
function to3d(x: number, y: number): [number, number] {
  return [(x - 200) / 46, -(y - 340) / 46];
}

function svgPathToPoints(path: string): [number, number][] {
  const nums = path.match(/-?\d+(\.\d+)?/g)?.map(Number) ?? [];
  const points: [number, number][] = [];
  for (let i = 0; i + 1 < nums.length; i += 2) {
    points.push(to3d(nums[i]!, nums[i + 1]!));
  }
  return points;
}

export default function HdBodygraph3D({ chart }: { chart: HdChart }) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    let disposed = false;
    let cleanup: (() => void) | undefined;

    void (async () => {
      try {
        const THREE = await import("three");
        if (disposed || !mountRef.current) return;

        const width = mount.clientWidth || 600;
        const height = mount.clientHeight || 640;

        const scene = new THREE.Scene();
        scene.fog = new THREE.FogExp2(0x0c0a14, 0.045);

        const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 100);
        camera.position.set(0, 0.5, 13);

        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setSize(width, height);
        renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
        mount.appendChild(renderer.domElement);

        const group = new THREE.Group();
        scene.add(group);

        scene.add(new THREE.AmbientLight(0xffffff, 0.55));
        const keyLight = new THREE.DirectionalLight(0xffe8a8, 1.4);
        keyLight.position.set(4, 6, 8);
        scene.add(keyLight);
        const rimLight = new THREE.DirectionalLight(0x9b7fd4, 0.9);
        rimLight.position.set(-5, -3, 6);
        scene.add(rimLight);

        const definedCenters = new Set(chart.definedCenters);
        const definedChannels = new Set(
          chart.channels.filter((c) => c.defined).map((c) => c.key)
        );
        const activeGates = new Set(chart.activeGates);

        // Centers as extruded glass shapes
        for (const shape of Object.values(HD_CENTER_SHAPES)) {
          const pts = svgPathToPoints(shape.path);
          if (pts.length < 3) continue;
          const s = new THREE.Shape();
          s.moveTo(pts[0]![0], pts[0]![1]);
          for (let i = 1; i < pts.length; i++) s.lineTo(pts[i]![0], pts[i]![1]);
          s.closePath();

          const defined = definedCenters.has(shape.key);
          const geometry = new THREE.ExtrudeGeometry(s, {
            depth: defined ? 0.5 : 0.18,
            bevelEnabled: true,
            bevelThickness: 0.06,
            bevelSize: 0.05,
            bevelSegments: 2,
          });
          const material = new THREE.MeshPhysicalMaterial({
            color: defined ? 0xe8c77e : 0x2a2440,
            metalness: 0.25,
            roughness: defined ? 0.25 : 0.55,
            transparent: true,
            opacity: defined ? 0.95 : 0.35,
            transmission: defined ? 0.15 : 0.4,
            emissive: defined ? 0x8a6a25 : 0x000000,
            emissiveIntensity: defined ? 0.35 : 0,
          });
          const mesh = new THREE.Mesh(geometry, material);
          group.add(mesh);

          if (defined) {
            const glow = new THREE.PointLight(0xe8c77e, 0.55, 4);
            const [gx, gy] = to3d(shape.cx, shape.cy);
            glow.position.set(gx, gy, 0.8);
            group.add(glow);
          }
        }

        // Channels as tubes
        for (const seg of HD_CHANNEL_SEGMENTS) {
          const [ax, ay] = to3d(seg.ax, seg.ay);
          const [bx, by] = to3d(seg.bx, seg.by);
          const defined = definedChannels.has(seg.key);
          const start = new THREE.Vector3(ax, ay, 0.1);
          const end = new THREE.Vector3(bx, by, 0.1);
          const path = new THREE.LineCurve3(start, end);
          const tube = new THREE.TubeGeometry(path, 1, defined ? 0.075 : 0.035, 8, false);
          const mat = new THREE.MeshStandardMaterial({
            color: defined ? 0xf2e7c9 : 0x4a4266,
            emissive: defined ? 0xa8843a : 0x000000,
            emissiveIntensity: defined ? 0.5 : 0,
            transparent: true,
            opacity: defined ? 1 : 0.4,
          });
          group.add(new THREE.Mesh(tube, mat));
        }

        // Active gates as small spheres
        const sphereGeo = new THREE.SphereGeometry(0.09, 12, 12);
        for (const anchor of HD_GATE_ANCHORS) {
          if (!activeGates.has(anchor.gate)) continue;
          const [gx, gy] = to3d(anchor.lx, anchor.ly);
          const mat = new THREE.MeshStandardMaterial({
            color: 0xffe8a8,
            emissive: 0xe8c77e,
            emissiveIntensity: 0.8,
          });
          const sphere = new THREE.Mesh(sphereGeo, mat);
          sphere.position.set(gx, gy, 0.35);
          group.add(sphere);
        }

        // Starfield
        const starCount = 350;
        const starPositions = new Float32Array(starCount * 3);
        for (let i = 0; i < starCount; i++) {
          starPositions[i * 3] = (Math.random() - 0.5) * 40;
          starPositions[i * 3 + 1] = (Math.random() - 0.5) * 40;
          starPositions[i * 3 + 2] = -6 - Math.random() * 14;
        }
        const starGeo = new THREE.BufferGeometry();
        starGeo.setAttribute("position", new THREE.BufferAttribute(starPositions, 3));
        const stars = new THREE.Points(
          starGeo,
          new THREE.PointsMaterial({ color: 0xc9b98a, size: 0.05, transparent: true, opacity: 0.8 })
        );
        scene.add(stars);

        // Drag rotate + gentle auto-rotation
        let targetRotY = 0;
        let targetRotX = 0;
        let dragging = false;
        let lastX = 0;
        let lastY = 0;

        const onDown = (e: PointerEvent) => {
          if (!e.isPrimary) return;
          dragging = true;
          lastX = e.clientX;
          lastY = e.clientY;
        };
        const onMove = (e: PointerEvent) => {
          if (!dragging) return;
          targetRotY += (e.clientX - lastX) * 0.008;
          targetRotX += (e.clientY - lastY) * 0.005;
          targetRotX = Math.max(-0.7, Math.min(0.7, targetRotX));
          lastX = e.clientX;
          lastY = e.clientY;
        };
        const onUp = () => {
          dragging = false;
        };
        renderer.domElement.addEventListener("pointerdown", onDown);
        // Browser takes over a vertical touch scroll → pointercancel; without
        // this the chart would keep rotating from a stale drag state.
        renderer.domElement.addEventListener("pointercancel", onUp);
        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);

        let raf = 0;
        let t = 0;
        const animate = () => {
          t += 0.008;
          if (!dragging && !reduceMotion) {
            targetRotY = Math.sin(t * 0.6) * 0.35;
            targetRotX = Math.sin(t * 0.4) * 0.12;
          }
          group.rotation.y += (targetRotY - group.rotation.y) * 0.06;
          group.rotation.x += (targetRotX - group.rotation.x) * 0.06;
          group.position.y = reduceMotion ? 0 : Math.sin(t * 1.2) * 0.08;
          renderer.render(scene, camera);
          raf = requestAnimationFrame(animate);
        };
        animate();

        const onResize = () => {
          const w = mount.clientWidth;
          const h = mount.clientHeight;
          if (!w || !h) return;
          camera.aspect = w / h;
          camera.updateProjectionMatrix();
          renderer.setSize(w, h);
        };
        const observer = new ResizeObserver(onResize);
        observer.observe(mount);

        cleanup = () => {
          cancelAnimationFrame(raf);
          observer.disconnect();
          renderer.domElement.removeEventListener("pointerdown", onDown);
          renderer.domElement.removeEventListener("pointercancel", onUp);
          window.removeEventListener("pointermove", onMove);
          window.removeEventListener("pointerup", onUp);
          // Dispose every GPU resource — including Points (starfield), which
          // instanceof-Mesh checks miss.
          scene.traverse((obj) => {
            const res = obj as unknown as {
              geometry?: { dispose(): void };
              material?: { dispose(): void } | { dispose(): void }[];
            };
            res.geometry?.dispose();
            const m = res.material;
            if (Array.isArray(m)) m.forEach((x) => x.dispose());
            else m?.dispose();
          });
          renderer.dispose();
          if (renderer.domElement.parentNode === mount) {
            mount.removeChild(renderer.domElement);
          }
        };
      } catch {
        if (!disposed) setFailed(true);
      }
    })();

    return () => {
      disposed = true;
      cleanup?.();
    };
  }, [chart, reduceMotion]);

  if (failed) {
    return (
      <p className="text-center text-xs text-white/50">
        3D-режим недоступен в этом браузере.
      </p>
    );
  }

  return (
    <div className="hd-3d">
      <div ref={mountRef} className="hd-3d__canvas" />
      <p className="hd-3d__hint">Потяните, чтобы вращать · определённые центры подсвечены золотом</p>
    </div>
  );
}
