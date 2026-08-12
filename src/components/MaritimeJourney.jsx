import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { ArrowRight } from 'lucide-react';
import { createMaritimeVessel } from './three/createMaritimeVessel';
import {
  createSeaSurface,
  createVesselWaterContact,
  createStationFootprint,
  createTether,
} from './three/createSeaSurface';
import { createHorizonRig } from './three/horizonRig';

gsap.registerPlugin(ScrollTrigger);

// 船体本地坐标：艏 x=+1.92，艉 x=-1.70，吃水线 y≈-0.24（上下船体材质分界）。
const HULL_LENGTH = 3.62;
const HULL_BEAM = 1.56;
const HULL_WATERLINE = -0.24;

/**
 * 航线锚点。
 * 横坐标是"当前可见画面宽度的百分比"（1 = 最右），纵坐标是照片自身的 UV。
 * 竖屏时 cover 会把照片左右切掉一大截，用绝对 UV 定位航线会整段跑出画面，
 * 所以横向按可见窗口取、纵向锚在照片上——这样船永远落在真实海水里。
 * v 必须大于海平线 0.4883，否则船就飞到天上去了，那正是改之前的状态。
 */
const ROUTE_WIDE = [
  [0.95, 0.760],
  [0.86, 0.712],
  [0.78, 0.676],
  [0.70, 0.644],
  [0.62, 0.616],
  [0.55, 0.594],
];

// 竖屏可见区偏画面中部，水域更靠近海平线，航线相应收紧上移
const ROUTE_NARROW = [
  [0.80, 0.610],
  [0.72, 0.594],
  [0.63, 0.579],
  [0.54, 0.565],
  [0.45, 0.550],
  [0.37, 0.535],
];

// 检查站沿航线的位置（0=近处出发，1=远处抵达）
const STATION_T = { port: 0.22, gate: 0.47, evidence: 0.70, beacon: 0.94 };

// 首屏那一帧船停在 TRAVEL_START，滚到底停在 TRAVEL_END
const TRAVEL_START = 0.10;
const TRAVEL_END = 0.88;

function createContainerPort() {
  const port = new THREE.Group();
  const colors = [0x0b3653, 0x0c7596, 0xe7f4f6, 0xf48c74];
  for (let row = 0; row < 2; row += 1) {
    for (let column = 0; column < 4 - row; column += 1) {
      const container = new THREE.Mesh(
        new THREE.BoxGeometry(0.42, 0.22, 0.26),
        new THREE.MeshStandardMaterial({
          color: colors[(row + column) % colors.length],
          metalness: 0.48,
          roughness: 0.34
        })
      );
      container.position.set(column * 0.46 - 0.68 + row * 0.22, row * 0.24, 0);
      port.add(container);
    }
  }
  const platform = new THREE.Mesh(
    new THREE.BoxGeometry(2.3, 0.08, 0.72),
    new THREE.MeshStandardMaterial({ color: 0x062b45, metalness: 0.72, roughness: 0.3 })
  );
  platform.position.set(0, -0.16, 0);
  port.add(platform);
  port.scale.setScalar(0.72);
  return port;
}

function createInspectionGate() {
  const gate = new THREE.Group();
  const frameMaterial = new THREE.MeshStandardMaterial({
    color: 0xe7f7f8,
    metalness: 0.76,
    roughness: 0.22
  });
  const beamMaterial = new THREE.MeshPhysicalMaterial({
    color: 0x70e1ea,
    emissive: 0x0c7890,
    emissiveIntensity: 1.6,
    transparent: true,
    opacity: 0.45,
    transmission: 0.32
  });
  [-0.72, 0.72].forEach((x) => {
    const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.5, 0.12), frameMaterial);
    pillar.position.set(x, 0, 0);
    gate.add(pillar);
  });
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(1.56, 0.12, 0.12), frameMaterial);
  lintel.position.y = 0.7;
  gate.add(lintel);
  const scanner = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 1.22), beamMaterial);
  scanner.position.y = 0.02;
  gate.add(scanner);
  const statusRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.18, 0.035, 10, 40),
    new THREE.MeshStandardMaterial({ color: 0xff8d74, emissive: 0x7d2416, emissiveIntensity: 1.4 })
  );
  statusRing.position.set(0, 0.72, 0.08);
  gate.add(statusRing);
  gate.scale.setScalar(0.66);
  return gate;
}

function createEvidenceStack() {
  const stack = new THREE.Group();
  for (let index = 0; index < 4; index += 1) {
    const page = new THREE.Mesh(
      new THREE.BoxGeometry(0.95, 0.055, 0.68),
      new THREE.MeshPhysicalMaterial({
        color: index === 0 ? 0xffffff : 0xdceff2,
        metalness: 0.12,
        roughness: 0.28,
        transparent: true,
        opacity: 0.92
      })
    );
    page.position.set(index * 0.06, index * 0.13, index * -0.04);
    page.rotation.y = index * -0.08;
    stack.add(page);
  }
  const seal = new THREE.Mesh(
    new THREE.TorusGeometry(0.17, 0.045, 12, 42),
    new THREE.MeshStandardMaterial({ color: 0x40d0df, emissive: 0x0a6273, emissiveIntensity: 1.25 })
  );
  seal.rotation.x = Math.PI / 2;
  seal.position.set(0.28, 0.56, 0);
  stack.add(seal);
  stack.scale.setScalar(0.84);
  return stack;
}

function createDestinationBeacon() {
  const beacon = new THREE.Group();
  const core = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.28, 1),
    new THREE.MeshPhysicalMaterial({
      color: 0xeafcff,
      emissive: 0x1689a4,
      emissiveIntensity: 1,
      transmission: 0.26,
      roughness: 0.18
    })
  );
  beacon.add(core);
  [0.5, 0.72, 0.94].forEach((radius, index) => {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(radius, 0.018, 8, 64),
      new THREE.MeshBasicMaterial({ color: index === 2 ? 0xff927b : 0x9debf2, transparent: true, opacity: 0.65 })
    );
    ring.rotation.set(Math.PI / 2 + index * 0.28, index * 0.34, 0);
    beacon.add(ring);
  });
  beacon.scale.setScalar(0.7);
  return beacon;
}

export default function MaritimeJourney({ onNew }) {
  const sectionRef = useRef(null);
  const canvasRef = useRef(null);

  useEffect(() => {
    const section = sectionRef.current;
    const canvas = canvasRef.current;
    if (!section || !canvas) return undefined;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      powerPreference: 'high-performance'
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.8));
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.98;

    const scene = new THREE.Scene();
    const rig = createHorizonRig({ fov: 38 });
    const camera = rig.camera;

    // 布光对齐照片：太阳在画面左上偏后，海面反射的天光从上方补。
    scene.add(new THREE.HemisphereLight(0xe6f8fa, 0x0d3b52, 1.08));
    const keyLight = new THREE.DirectionalLight(0xfff4e4, 2.25);
    keyLight.position.set(-6, 9, -3);
    scene.add(keyLight);
    const fillLight = new THREE.DirectionalLight(0x9fdce5, 0.72);
    fillLight.position.set(5, 3, 6);
    scene.add(fillLight);
    const rimLight = new THREE.DirectionalLight(0x89dbe6, 0.7);
    rimLight.position.set(2, 5, -8);
    scene.add(rimLight);

    // 海面。吃水线以下由它做深度剔除，露出照片里的真实海水。
    const sea = createSeaSurface();
    scene.add(sea.group);

    // 航线在 resize 时按照片 UV 重新解算，先占位。
    let route = new THREE.CatmullRomCurve3([new THREE.Vector3(), new THREE.Vector3(0, 0, -1)]);
    let routePoints = [];

    const routeLine = new THREE.Line(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color: 0x9feaf2, transparent: true, opacity: 0.62, depthWrite: false })
    );
    routeLine.renderOrder = 1;
    scene.add(routeLine);

    const boat = createMaritimeVessel({ scale: 1, detail: 'hero' });
    boat.updateMatrixWorld(true);
    const vesselBounds = new THREE.Box3().setFromObject(boat);
    const vesselCorners = [];
    for (const x of [vesselBounds.min.x, vesselBounds.max.x]) {
      for (const y of [vesselBounds.min.y, vesselBounds.max.y]) {
        for (const z of [vesselBounds.min.z, vesselBounds.max.z]) {
          vesselCorners.push(new THREE.Vector3(x, y, z));
        }
      }
    }
    scene.add(boat);

    // 水面附着物单独挂在场景里而不是船下面：它们必须始终贴着 y=0 的海面，
    // 不能跟着船身的纵摇横摇一起翻。
    const water = createVesselWaterContact({ length: HULL_LENGTH, beam: HULL_BEAM });
    scene.add(water.group);

    const containerPort = createContainerPort();
    scene.add(containerPort);
    const inspectionGate = createInspectionGate();
    scene.add(inspectionGate);
    const evidenceStack = createEvidenceStack();
    evidenceStack.rotation.set(-0.2, 0.35, -0.12);
    scene.add(evidenceStack);
    const destinationBeacon = createDestinationBeacon();
    scene.add(destinationBeacon);

    // 每个检查站配一个水面足迹和一条系缆，明确它挂在哪一段航程上。
    const stations = [
      { object: containerPort, t: STATION_T.port, lift: 0.0, base: 0.72, reveal: [0.12, 0.28], footprint: 1.5 },
      { object: inspectionGate, t: STATION_T.gate, lift: 0.62, base: 0.66, reveal: [0.30, 0.46], footprint: 1.1 },
      { object: evidenceStack, t: STATION_T.evidence, lift: 0.95, base: 0.84, reveal: [0.50, 0.66], footprint: 0.85 },
      { object: destinationBeacon, t: STATION_T.beacon, lift: 0.78, base: 0.70, reveal: [0.68, 0.84], footprint: 0.8 },
    ];
    stations.forEach((station) => {
      station.footprintMesh = createStationFootprint({ radius: station.footprint });
      station.tether = createTether({ height: 1 });
      scene.add(station.footprintMesh, station.tether);
    });

    let progress = reducedMotion ? 0.14 : 0;
    let animationFrame = 0;
    // renderOnce 在后面才定义，减弱动效时由滚动回调按需调用
    const renderRef = { current: null };
    const trigger = ScrollTrigger.create({
      trigger: section,
      start: 'top top',
      end: 'bottom bottom',
      scrub: 0.8,
      onUpdate: (self) => {
        progress = self.progress;
        section.style.setProperty('--journey-progress', progress.toFixed(4));
        section.style.setProperty('--journey-scale', (1.035 + progress * 0.045).toFixed(4));
        section.style.setProperty('--journey-light-x', `${(72 - progress * 15).toFixed(2)}%`);
        if (reducedMotion) renderRef.current?.();
      }
    });

    let narrowViewport = false;
    let boatScale = 0.46;
    let lastCssScale = -1;
    let viewWidth = 1;
    let viewHeight = 1;

    const probe = new THREE.Object3D();
    const probeBow = new THREE.Vector3();
    const probeStern = new THREE.Vector3();
    const projectedCorner = new THREE.Vector3();
    /** 在给定位置/航向/缩放下，船体在屏幕上实际占多少像素 */
    const measureHullPx = (position, yaw, scale) => {
      probe.position.set(position.x, -HULL_WATERLINE * scale, position.z);
      probe.rotation.set(0, yaw + Math.PI / 2, 0, 'YXZ');
      probe.scale.setScalar(scale);
      probe.updateMatrixWorld(true);
      probeBow.set(1.92, HULL_WATERLINE, 0).applyMatrix4(probe.matrixWorld).project(camera);
      probeStern.set(-1.7, HULL_WATERLINE, 0).applyMatrix4(probe.matrixWorld).project(camera);
      return Math.hypot(
        ((probeBow.x - probeStern.x) / 2) * viewWidth,
        ((probeBow.y - probeStern.y) / 2) * viewHeight
      );
    };
    const measureVesselPx = (position, yaw, scale) => {
      probe.position.set(position.x, -HULL_WATERLINE * scale, position.z);
      probe.rotation.set(0, yaw + Math.PI / 2, 0, 'YXZ');
      probe.scale.setScalar(scale);
      probe.updateMatrixWorld(true);
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      vesselCorners.forEach((corner) => {
        projectedCorner.copy(corner).applyMatrix4(probe.matrixWorld).project(camera);
        const x = (projectedCorner.x * 0.5 + 0.5) * viewWidth;
        const y = (-projectedCorner.y * 0.5 + 0.5) * viewHeight;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      });
      return { width: maxX - minX, height: maxY - minY };
    };

    /**
     * 重建相机与航线。
     * 视口尺寸变了、或者滚动改变了照片的 CSS 缩放，海平线就会移动，
     * 相机俯仰角和航线世界坐标都必须跟着重算，否则船会重新脱离水面。
     */
    const rebuild = (cssScale) => {
      rig.update({ width: viewWidth, height: viewHeight, cssScale });
      lastCssScale = cssScale;

      const [u0, u1] = rig.visibleURange();
      const anchors = narrowViewport ? ROUTE_NARROW : ROUTE_WIDE;
      const points = anchors.map(([uFrac, v]) =>
        rig.uvToSea(u0 + (u1 - u0) * uFrac, v, new THREE.Vector3())
      );
      route = new THREE.CatmullRomCurve3(points);
      routePoints = route.getSpacedPoints(200);
      routeLine.geometry.dispose();
      routeLine.geometry = new THREE.BufferGeometry().setFromPoints(routePoints);
      routeLine.geometry.setDrawRange(0, 2);

      // 船的世界尺度由海平线定死，只能按实际距离反算，不能拍脑袋写死。
      // 以首屏位置（progress=0）为基准标定，保证最关键那一帧的构图精确。
      const anchor = route.getPointAt(TRAVEL_START);
      const targetPx = narrowViewport
        ? Math.min(viewWidth * 0.46, 190)
        : Math.min(212, viewWidth * 0.15);
      boatScale = rig.fitScaleForScreenLength(anchor, HULL_LENGTH, targetPx);
      // 船是斜着开的，投影长度会被航向压缩，直接用世界长度换算会偏小。
      // 实测一次投影长度再回修，比在这里塞一个经验系数可靠。
      const startTangent = route.getTangentAt(TRAVEL_START);
      const startYaw = Math.atan2(startTangent.x, startTangent.z);
      for (let i = 0; i < 2; i += 1) {
        const measured = measureHullPx(anchor, startYaw, boatScale);
        if (measured > 1) boatScale *= targetPx / measured;
      }
      // 船艏艉投影在近正面航向时会严重低估视觉体积。再用完整包围盒同时约束
      // 宽和高，尤其避免竖屏里驾驶舱/桅杆越过顶部、遮住标题与 CTA。
      const maxVesselWidth = narrowViewport ? Math.min(viewWidth * 0.46, 180) : Math.min(viewWidth * 0.2, 252);
      const maxVesselHeight = narrowViewport ? Math.min(viewHeight * 0.22, 186) : Math.min(viewHeight * 0.31, 228);
      for (let i = 0; i < 3; i += 1) {
        const bounds = measureVesselPx(anchor, startYaw, boatScale);
        if (bounds.width > 1 && bounds.height > 1) {
          boatScale *= Math.min(maxVesselWidth / bounds.width, maxVesselHeight / bounds.height);
        }
      }

      stations.forEach((station) => {
        const at = route.getPointAt(station.t);
        station.anchor = at.clone();
        // 检查站按各自所处的景深缩放，远的自然小
        station.scale = rig.fitScaleForScreenLength(at, 1, narrowViewport ? 52 : 78);
        station.footprintMesh.position.set(at.x, 0, at.z);
        station.footprintMesh.scale.setScalar(station.scale);
        station.tether.position.set(at.x, 0, at.z);
      });
    };

    const resize = () => {
      const rect = canvas.parentElement.getBoundingClientRect();
      viewWidth = Math.max(1, rect.width);
      viewHeight = Math.max(1, rect.height);
      renderer.setSize(viewWidth, viewHeight, false);
      narrowViewport = viewWidth < 760;
      rebuild(1.035 + progress * 0.045);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas.parentElement);
    resize();

    // 开发期自检：把海平线像素行、船体投影位置暴露出来，
    // 用来核对"船是否真的落在水面上"，不进生产包。
    if (import.meta.env.DEV) {
      window.__maritime = {
        rig, boat, water, camera, stations,
        get route() { return route; },
        get view() { return { w: viewWidth, h: viewHeight }; },
        // 手动把叙事推进到某个进度并渲染一帧，用于无头核验
        seek(value) { progress = value; renderOnce(); return value; },
      };
    }

    const heading = new THREE.Vector3();
    const clock = new THREE.Clock();
    const renderOnce = () => {
      const time = clock.getElapsedTime();

      // 照片缩放变了就重算海平线，保证水线始终对齐
      const cssScale = 1.035 + progress * 0.045;
      if (Math.abs(cssScale - lastCssScale) > 0.0008) rebuild(cssScale);

      const travel = THREE.MathUtils.clamp(
        TRAVEL_START + progress * (TRAVEL_END - TRAVEL_START),
        TRAVEL_START,
        TRAVEL_END
      );
      const point = route.getPointAt(travel);
      const tangent = route.getTangentAt(travel);
      heading.set(tangent.x, 0, tangent.z).normalize();
      const yaw = Math.atan2(heading.x, heading.z);

      // 船体：吃水线压在 y=0 上，只留一点点涌浪起伏
      const swell = reducedMotion ? 0 : Math.sin(time * 1.15) * 0.004 + Math.sin(time * 0.53 + 1.7) * 0.002;
      boat.scale.setScalar(boatScale);
      boat.position.set(point.x, -HULL_WATERLINE * boatScale + swell * boatScale, point.z);
      // 船头模型朝 +X，需要额外转 90° 才能对上航向
      boat.rotation.set(0, yaw + Math.PI / 2, 0, 'YXZ');
      boat.rotation.x = reducedMotion ? 0 : Math.sin(time * 1.45) * 0.007; // 纵摇
      boat.rotation.z = reducedMotion ? 0 : Math.sin(time * 0.87 + 0.6) * 0.009; // 横摇

      // 水面附着物只跟平面位置和航向，不跟纵横摇
      water.group.position.set(point.x, 0, point.z);
      water.group.rotation.y = yaw + Math.PI / 2;
      water.group.scale.setScalar(boatScale);
      // 尾迹随速度（滚动推进量）起伏，静止时收敛
      const speed = THREE.MathUtils.clamp(0.35 + progress * 0.65, 0.35, 1);
      water.wake.material.opacity = 0.2 + speed * 0.4;
      water.wakeCore.material.opacity = 0.12 + speed * 0.24;
      water.bowFoam.material.opacity = 0.35 + speed * 0.4;
      water.waterlineFoam.material.opacity = 0.5 + speed * 0.18;
      water.reflection.material.opacity = 0.18 + speed * 0.08;
      water.wake.material.map.offset.x = -(time * 0.16 * speed) % 1;

      const reveal = (start, end) => THREE.MathUtils.smoothstep(progress, start, end);
      stations.forEach((station) => {
        const shown = reveal(station.reveal[0], station.reveal[1]);
        const bob = Math.sin(time * 0.8 + station.t * 6) * 0.03 * station.scale;
        const lift = station.lift * station.scale + bob;
        station.object.position.set(station.anchor.x, lift, station.anchor.z);
        station.object.scale.setScalar(station.base * station.scale * shown);
        station.footprintMesh.visible = shown > 0.02;
        station.footprintMesh.children.forEach((child) => {
          child.material.opacity = child.userData.baseOpacity * shown;
        });
        station.tether.visible = shown > 0.02 && station.lift > 0.05;
        station.tether.scale.set(1, Math.max(0.001, lift), 1);
        station.tether.material.opacity = 0.3 * shown;
      });
      inspectionGate.rotation.y = Math.sin(time * 0.45) * 0.07;
      evidenceStack.rotation.y = 0.35 + time * 0.11;
      destinationBeacon.rotation.y = time * 0.16;

      const visiblePoints = Math.max(2, Math.floor(travel * routePoints.length));
      routeLine.geometry.setDrawRange(0, visiblePoints);

      renderer.render(scene, camera);
    };

    renderRef.current = renderOnce;

    if (reducedMotion) {
      // 尊重 prefers-reduced-motion：不跑逐帧循环，只在滚动改变进度时补一帧。
      // 这同时也是低性能设备的静态降级路径。
      renderOnce();
    } else {
      const render = () => {
        renderOnce();
        animationFrame = requestAnimationFrame(render);
      };
      render();
    }

    return () => {
      cancelAnimationFrame(animationFrame);
      observer.disconnect();
      trigger.kill();
      const disposedTextures = new Set();
      scene.traverse((object) => {
        object.geometry?.dispose?.();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.filter(Boolean).forEach((material) => {
          Object.values(material).forEach((value) => {
            if (value?.isTexture && !disposedTextures.has(value)) {
              disposedTextures.add(value);
              value.dispose();
            }
          });
          material.dispose?.();
        });
      });
      renderer.dispose();
    };
  }, []);

  return (
    <section className="maritime-journey" ref={sectionRef}>
      <div className="maritime-sticky">
        <img
          className="maritime-photo"
          src="/assets/brand/qingshui-cliff-ccby-v1.webp"
          alt=""
        />
        <div className="maritime-atmosphere" />
        <canvas ref={canvasRef} className="maritime-canvas" aria-hidden="true" />

        <div className="maritime-hero-copy">
          <div className="maritime-kicker"><span /> 跨境商品合规智能体</div>
          <h1>沿着证据，<br />抵达每一个市场。</h1>
          <p>提交商品资料，系统完成市场匹配、证据审查、整改与复检。</p>
          <div className="maritime-actions">
            <button className="maritime-primary" onClick={onNew}>开始审查 <ArrowRight size={16} /></button>
          </div>
        </div>

        <div className="maritime-route-ui">
          <span>CN</span>
          <i><b /></i>
          <span>EU</span>
        </div>

        <div className="maritime-credit">
          Photo: mk_is_here · CC BY 2.0
        </div>
      </div>
    </section>
  );
}
