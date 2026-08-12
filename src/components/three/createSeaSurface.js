import * as THREE from 'three';

/**
 * 海面接触层。
 *
 * 此前 3D 场景里根本没有"海面"这个概念：船沿着一条在 Y 轴上下起伏的
 * 空间曲线飞行，实景照片只是背景图，两者没有任何几何关系，所以船看上去
 * 是悬空贴上去的。
 *
 * 这里补上三件事：
 *   1. occluder —— y=0 处只写深度不写颜色的平面。吃水线以下的船体被深度
 *      剔除，露出背后照片里的真实海水，等于免费得到一条正确的水线。
 *   2. contactShadow —— 船体正下方的软投影，把船"压"在水面上。
 *   3. wake / bowFoam —— 尾迹与船首破浪，给出运动方向和速度感。
 *
 * 纹理全部用 canvas 程序化生成，不额外增加请求与体积。
 */

const SEA_EXTENT = 600;

function radialTexture({ inner = 'rgba(0,0,0,0.85)', outer = 'rgba(0,0,0,0)', size = 256 } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, inner);
  gradient.addColorStop(0.55, inner.replace(/[\d.]+\)$/, '0.35)'));
  gradient.addColorStop(1, outer);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * 尾迹纹理：船在右（u=1）、尾在左（u=0）。
 * 一条中央扰流带 + 两道向外张开的艏波，整体随距离衰减。
 */
function wakeTexture(size = 512) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, size, size);

  const image = ctx.createImageData(size, size);
  const data = image.data;
  for (let y = 0; y < size; y += 1) {
    // v: 0 在中线，±1 在两侧
    const v = (y / (size - 1)) * 2 - 1;
    for (let x = 0; x < size; x += 1) {
      const u = x / (size - 1); // 1 = 船尾，0 = 最远
      // 张开角随距离增大
      const spread = 0.06 + (1 - u) * 0.72;
      const edge = Math.abs(Math.abs(v) - spread * 0.9);
      // 两道艏波
      const crest = Math.exp(-(edge * edge) / 0.0026);
      // 中央扰流
      const churn = Math.exp(-(v * v) / (0.02 + (1 - u) * 0.16)) * 0.55;
      // 沿长度方向衰减，靠近船尾最亮
      const fade = Math.pow(u, 1.35);
      // 一点点周期性碎浪，避免纯几何感
      const ripple = 0.82 + 0.18 * Math.sin(u * 46 + v * 7);
      const alpha = Math.min(1, (crest * 0.95 + churn) * fade * ripple);
      const i = (y * size + x) * 4;
      data[i] = 255;
      data[i + 1] = 255;
      data[i + 2] = 255;
      data[i + 3] = Math.round(alpha * 235);
    }
  }
  ctx.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  return texture;
}

function hullEdgeTexture(size = 512) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(size, size);

  for (let y = 0; y < size; y += 1) {
    const z = Math.abs((y / (size - 1)) * 2 - 1);
    for (let x = 0; x < size; x += 1) {
      const longitudinal = (x / (size - 1)) * 2 - 1;
      const baseBeam = Math.pow(Math.max(0, 1 - longitudinal * longitudinal), 0.38);
      const bowTaper = longitudinal > 0.35 ? 1 - (longitudinal - 0.35) * 0.42 : 1;
      const hullEdge = baseBeam * bowTaper * 0.72;
      const edgeDistance = Math.abs(z - hullEdge);
      const edge = Math.exp(-(edgeDistance * edgeDistance) / 0.0028);
      const bow = Math.exp(-((longitudinal - 0.78) ** 2) / 0.055) * Math.exp(-(z * z) / 0.18);
      const fade = THREE.MathUtils.smoothstep(baseBeam, 0.02, 0.24);
      const alpha = Math.min(1, (edge * 0.72 + bow * 0.52) * fade);
      const offset = (y * size + x) * 4;
      image.data[offset] = 210;
      image.data[offset + 1] = 249;
      image.data[offset + 2] = 250;
      image.data[offset + 3] = Math.round(alpha * 230);
    }
  }

  ctx.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function createSeaSurface() {
  const group = new THREE.Group();
  group.name = 'sea-surface';

  // 1. 吃水遮挡：不写颜色，只写深度
  const occluder = new THREE.Mesh(
    new THREE.PlaneGeometry(SEA_EXTENT, SEA_EXTENT),
    new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: true })
  );
  occluder.name = 'sea-occluder';
  occluder.rotation.x = -Math.PI / 2;
  occluder.renderOrder = 0;
  group.add(occluder);

  return { group, occluder };
}

/**
 * 一条船的水面附着物：投影 + 倒影拖尾 + 尾迹 + 艏浪。
 * 全部挂在同一个 group 下，跟随船的位置与航向。
 */
export function createVesselWaterContact({ length = 3.62, beam = 1.56 } = {}) {
  const group = new THREE.Group();
  group.name = 'vessel-water-contact';
  group.renderOrder = 1;

  const shadowTexture = radialTexture({ inner: 'rgba(3,28,42,0.9)', outer: 'rgba(3,28,42,0)' });
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(length * 1.05, beam * 1.5),
    new THREE.MeshBasicMaterial({
      map: shadowTexture,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
    })
  );
  shadow.name = 'contact-shadow';
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.set(0, 0.004, 0);
  group.add(shadow);

  // 船体在水面上的暗色拖影，模拟浅层倒影，比真倒影便宜得多
  const reflection = new THREE.Mesh(
    new THREE.PlaneGeometry(length * 0.62, beam * 2.6),
    new THREE.MeshBasicMaterial({
      map: shadowTexture,
      transparent: true,
      opacity: 0.26,
      depthWrite: false,
    })
  );
  reflection.name = 'contact-reflection';
  reflection.rotation.x = -Math.PI / 2;
  reflection.position.set(-length * 0.05, 0.003, 0);
  group.add(reflection);

  const waterlineFoam = new THREE.Mesh(
    new THREE.PlaneGeometry(length * 1.12, beam * 1.34),
    new THREE.MeshBasicMaterial({
      map: hullEdgeTexture(),
      transparent: true,
      opacity: 0.68,
      depthWrite: false,
      blending: THREE.NormalBlending,
    })
  );
  waterlineFoam.name = 'waterline-foam';
  waterlineFoam.rotation.x = -Math.PI / 2;
  waterlineFoam.position.set(0.04, 0.008, 0);
  waterlineFoam.renderOrder = 2;
  group.add(waterlineFoam);

  const foamMap = wakeTexture();
  const wake = new THREE.Mesh(
    new THREE.PlaneGeometry(length * 7.5, beam * 5.2),
    new THREE.MeshBasicMaterial({
      map: foamMap,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    })
  );
  wake.name = 'vessel-wake';
  wake.rotation.x = -Math.PI / 2;
  // 纹理里 u=1 是船尾，把整片尾迹放到船身后方
  wake.position.set(-length * 3.6, 0.006, 0);
  group.add(wake);

  const wakeCore = new THREE.Mesh(
    new THREE.PlaneGeometry(length * 4.2, beam * 1.9),
    new THREE.MeshBasicMaterial({
      map: foamMap,
      transparent: true,
      opacity: 0.3,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  );
  wakeCore.name = 'wake-turbulent-core';
  wakeCore.rotation.x = -Math.PI / 2;
  wakeCore.position.set(-length * 2.08, 0.009, 0);
  wakeCore.renderOrder = 2;
  group.add(wakeCore);

  const bowFoam = new THREE.Mesh(
    new THREE.PlaneGeometry(length * 0.42, beam * 0.62),
    new THREE.MeshBasicMaterial({
      map: radialTexture({ inner: 'rgba(255,255,255,0.95)', outer: 'rgba(255,255,255,0)' }),
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
    })
  );
  bowFoam.name = 'bow-foam';
  bowFoam.rotation.x = -Math.PI / 2;
  bowFoam.position.set(length * 0.42, 0.007, 0);
  group.add(bowFoam);

  return { group, shadow, reflection, waterlineFoam, wake, wakeCore, bowFoam };
}

/**
 * 检查站落在水面上的"足迹"。悬空的检查站本身是刻意的图示语言，
 * 但没有足迹就会和船一样显得没有依附关系。
 */
export function createStationFootprint({ radius = 0.5, color = 0xbdf0f7 } = {}) {
  const group = new THREE.Group();
  group.name = 'station-footprint';
  group.renderOrder = 1;

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(radius * 0.82, radius, 56),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5, depthWrite: false })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.005;
  group.add(ring);

  const halo = new THREE.Mesh(
    new THREE.CircleGeometry(radius * 0.95, 48),
    new THREE.MeshBasicMaterial({
      map: radialTexture({ inner: 'rgba(4,32,48,0.75)', outer: 'rgba(4,32,48,0)' }),
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
    })
  );
  halo.rotation.x = -Math.PI / 2;
  halo.position.y = 0.003;
  group.add(halo);

  // 记录初始不透明度，滚动淡入时按它做基准，避免逐帧连乘把足迹乘没了
  group.children.forEach((child) => {
    child.userData.baseOpacity = child.material.opacity;
  });

  return group;
}

/**
 * 把检查站和它在水面的足迹连起来的细缆，避免"漂浮无依"。
 */
export function createTether({ height = 1, color = 0x9feaf2 } = {}) {
  const geometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, height, 0),
  ]);
  const line = new THREE.Line(
    geometry,
    new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.34 })
  );
  line.name = 'station-tether';
  return line;
}

export const SEA = { EXTENT: SEA_EXTENT };
