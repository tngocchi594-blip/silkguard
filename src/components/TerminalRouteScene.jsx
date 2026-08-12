import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { createMaritimeVessel } from './three/createMaritimeVessel';

function createAtmosphereMaterial() {
  return new THREE.ShaderMaterial({
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vViewPosition;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
        vViewPosition = viewPosition.xyz;
        gl_Position = projectionMatrix * viewPosition;
      }
    `,
    fragmentShader: `
      varying vec3 vNormal;
      varying vec3 vViewPosition;
      void main() {
        float fresnel = pow(1.0 - max(0.0, dot(vNormal, normalize(-vViewPosition))), 2.6);
        vec3 color = vec3(0.36, 0.79, 0.84);
        gl_FragColor = vec4(color, fresnel * 0.12);
      }
    `,
    transparent: true,
    side: THREE.BackSide,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
}

function latLonToVector(latitude, longitude) {
  const phi = THREE.MathUtils.degToRad(90 - latitude);
  const theta = THREE.MathUtils.degToRad(longitude + 180);
  return new THREE.Vector3(
    -Math.sin(phi) * Math.cos(theta),
    Math.cos(phi),
    Math.sin(phi) * Math.sin(theta)
  ).normalize();
}

function createSurfaceRoute(radius) {
  const start = latLonToVector(31.23, 121.47);
  const end = latLonToVector(51.92, 4.48);
  const points = [];
  for (let index = 0; index <= 96; index += 1) {
    const progress = index / 96;
    const surface = start.clone().lerp(end, progress).normalize();
    const altitude = Math.sin(progress * Math.PI) * 0.34;
    points.push(surface.multiplyScalar(radius + 0.035 + altitude));
  }
  return new THREE.CatmullRomCurve3(points);
}

function orientToSurface(object, curve, progress) {
  const point = curve.getPointAt(progress);
  const tangent = curve.getTangentAt(progress).normalize();
  const normal = point.clone().normalize();
  const binormal = tangent.clone().cross(normal).normalize();
  const correctedNormal = binormal.clone().cross(tangent).normalize();
  const matrix = new THREE.Matrix4().makeBasis(tangent, correctedNormal, binormal);
  object.position.copy(point);
  object.quaternion.setFromRotationMatrix(matrix);
}

function createBeacon(position, color, name) {
  const group = new THREE.Group();
  group.name = name;
  group.position.copy(position);
  const normal = position.clone().normalize();
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.105, 0.018, 10, 48),
    new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.28,
      metalness: 0.18,
      roughness: 0.32,
    })
  );
  ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
  group.add(ring);
  const core = new THREE.Mesh(
    new THREE.SphereGeometry(0.035, 16, 12),
    new THREE.MeshBasicMaterial({ color })
  );
  core.position.copy(normal).multiplyScalar(0.025);
  group.add(core);
  return group;
}

export default function TerminalRouteScene({ active = false }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.7));
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.02;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    camera.position.set(0, 0.2, 6.4);

    scene.add(new THREE.HemisphereLight(0xdff5f3, 0x031523, 1.15));
    const key = new THREE.DirectionalLight(0xf5fbfa, 2.8);
    key.position.set(4, 5, 6);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0x5ca8b8, 0.72);
    fill.position.set(-4, 1, 4);
    scene.add(fill);
    const rim = new THREE.PointLight(active ? 0x79d7c0 : 0x5ebec9, 1.55, 12);
    rim.position.set(-3, 2, 3);
    scene.add(rim);

    const globeGroup = new THREE.Group();
    globeGroup.name = 'physical-compliance-globe';
    globeGroup.position.set(0.38, -0.02, -0.3);
    scene.add(globeGroup);

    const radius = 1.42;
    const textureLoader = new THREE.TextureLoader();
    // 三张贴图原本是 JPEG 共 1.0MB。颜色图保留 2048（是唯一肉眼直接看到的），
    // 法线与高光遮罩都是低频信息，降到 1024 看不出差别。合计 326KB。
    const earthTexture = textureLoader.load('/assets/brand/earth-atmos-2048.webp');
    const earthSpecular = textureLoader.load('/assets/brand/earth-specular-1024.webp');
    const earthNormal = textureLoader.load('/assets/brand/earth-normal-1024.webp');
    earthTexture.colorSpace = THREE.SRGBColorSpace;
    [earthTexture, earthSpecular, earthNormal].forEach((texture) => {
      texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    });
    const globe = new THREE.Mesh(
      new THREE.SphereGeometry(radius, 72, 48),
      new THREE.MeshPhongMaterial({
        map: earthTexture,
        specularMap: earthSpecular,
        normalMap: earthNormal,
        normalScale: new THREE.Vector2(0.62, 0.62),
        specular: 0x5c8390,
        shininess: 18,
      })
    );
    globe.name = 'ocean-and-land-sphere';
    globeGroup.add(globe);

    const atmosphere = new THREE.Mesh(
      new THREE.SphereGeometry(radius * 1.035, 64, 40),
      createAtmosphereMaterial()
    );
    atmosphere.name = 'fresnel-atmosphere';
    globeGroup.add(atmosphere);

    const route = createSurfaceRoute(radius);
    const routeTube = new THREE.Mesh(
      new THREE.TubeGeometry(route, 128, 0.012, 8, false),
      new THREE.MeshStandardMaterial({
        color: 0xa6e6e4,
        emissive: 0x1f6770,
        emissiveIntensity: 0.56,
        metalness: 0.28,
        roughness: 0.26,
      })
    );
    routeTube.name = 'china-europe-route';
    globeGroup.add(routeTube);

    const startPoint = route.getPointAt(0);
    const endPoint = route.getPointAt(1);
    globeGroup.add(
      createBeacon(startPoint, 0xa7e4e3, 'china-route-beacon'),
      createBeacon(endPoint, 0xf18f79, 'europe-route-beacon')
    );

    const vessel = createMaritimeVessel({ scale: 0.105, detail: 'compact' });
    vessel.name = 'route-vessel';
    globeGroup.add(vessel);

    const routeCenter = startPoint.clone().normalize().add(endPoint.clone().normalize()).normalize();
    const localUp = new THREE.Vector3(0, 1, 0)
      .sub(routeCenter.clone().multiplyScalar(routeCenter.y))
      .normalize();
    const localRight = localUp.clone().cross(routeCenter).normalize();
    const orientationMatrix = new THREE.Matrix4()
      .makeBasis(localRight, localUp, routeCenter)
      .invert();
    const baseQuaternion = new THREE.Quaternion().setFromRotationMatrix(orientationMatrix);
    const motionQuaternion = new THREE.Quaternion();

    let frame = 0;
    const clock = new THREE.Clock();
    const render = () => {
      const elapsed = clock.getElapsedTime();
      const travel = active ? 0.84 : 0.28 + ((elapsed * 0.045) % 0.48);
      orientToSurface(vessel, route, travel);
      if (!reducedMotion) {
        motionQuaternion.setFromEuler(new THREE.Euler(
          Math.sin(elapsed * 0.08) * 0.012,
          Math.sin(elapsed * 0.12) * 0.035,
          -0.05
        ));
        globeGroup.quaternion.copy(baseQuaternion).multiply(motionQuaternion);
      } else {
        globeGroup.quaternion.copy(baseQuaternion);
      }
      camera.lookAt(0.2, 0, -0.2);
      renderer.render(scene, camera);
      if (!reducedMotion) frame = requestAnimationFrame(render);
    };

    const resize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      const { width, height } = parent.getBoundingClientRect();
      renderer.setSize(Math.max(1, width), Math.max(1, height), false);
      camera.aspect = Math.max(1, width) / Math.max(1, height);
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas.parentElement);
    resize();
    render();

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      scene.traverse((object) => {
        object.geometry?.dispose?.();
        if (Array.isArray(object.material)) object.material.forEach((item) => item.dispose?.());
        else object.material?.dispose?.();
      });
      earthTexture.dispose();
      earthSpecular.dispose();
      earthNormal.dispose();
      renderer.dispose();
    };
  }, [active]);

  return <canvas ref={canvasRef} className="terminal-route-canvas" aria-hidden="true" />;
}
