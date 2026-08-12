import * as THREE from 'three';

const AXIS_Y = new THREE.Vector3(0, 1, 0);

function createPaintSurfaceMaps(size = 64) {
  const heights = new Float32Array(size * size);
  const roughnessData = new Uint8Array(size * size * 4);
  const normalData = new Uint8Array(size * size * 4);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const index = y * size + x;
      const grain = (
        Math.sin(x * 1.91 + y * 0.73) * 0.46 +
        Math.sin(x * 0.31 - y * 1.37) * 0.32 +
        Math.sin((x + y) * 0.17) * 0.22
      );
      heights[index] = grain;
      const roughness = Math.round(THREE.MathUtils.clamp(176 + grain * 19, 142, 206));
      const offset = index * 4;
      roughnessData.set([roughness, roughness, roughness, 255], offset);
    }
  }

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const left = heights[y * size + ((x - 1 + size) % size)];
      const right = heights[y * size + ((x + 1) % size)];
      const up = heights[((y - 1 + size) % size) * size + x];
      const down = heights[((y + 1) % size) * size + x];
      const normal = new THREE.Vector3((left - right) * 0.16, (up - down) * 0.16, 1).normalize();
      const offset = (y * size + x) * 4;
      normalData.set([
        Math.round((normal.x * 0.5 + 0.5) * 255),
        Math.round((normal.y * 0.5 + 0.5) * 255),
        Math.round((normal.z * 0.5 + 0.5) * 255),
        255,
      ], offset);
    }
  }

  const roughnessMap = new THREE.DataTexture(roughnessData, size, size, THREE.RGBAFormat);
  const normalMap = new THREE.DataTexture(normalData, size, size, THREE.RGBAFormat);
  [roughnessMap, normalMap].forEach((texture) => {
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(7, 3);
    texture.needsUpdate = true;
  });
  roughnessMap.name = 'paint-roughness-map';
  normalMap.name = 'paint-normal-map';
  return { roughnessMap, normalMap };
}

function cylinderBetween(start, end, radius, material, name) {
  const direction = end.clone().sub(start);
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, direction.length(), 10),
    material
  );
  mesh.name = name;
  mesh.position.copy(start).add(end).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(AXIS_Y, direction.clone().normalize());
  mesh.userData.explodeWithParent = true;
  return mesh;
}

function createStationHull(stations, upperMaterial, lowerMaterial) {
  const positions = [];
  const upperIndices = [];
  const lowerIndices = [];
  const ringSize = 7;

  stations.forEach(({ x, beam, deck, keel }) => {
    const shoulder = deck - (deck - keel) * 0.36;
    const chine = keel + (deck - keel) * 0.34;
    [
      [deck, beam * 0.82],
      [shoulder, beam],
      [chine, beam * 0.66],
      [keel, 0],
      [chine, -beam * 0.66],
      [shoulder, -beam],
      [deck, -beam * 0.82],
    ].forEach(([y, z]) => positions.push(x, y, z));
  });

  for (let station = 0; station < stations.length - 1; station += 1) {
    for (let point = 0; point < ringSize; point += 1) {
      const nextPoint = (point + 1) % ringSize;
      const a = station * ringSize + point;
      const b = (station + 1) * ringSize + point;
      const c = (station + 1) * ringSize + nextPoint;
      const d = station * ringSize + nextPoint;
      const averageY = (
        positions[a * 3 + 1] + positions[b * 3 + 1] +
        positions[c * 3 + 1] + positions[d * 3 + 1]
      ) / 4;
      const target = averageY > -0.24 ? upperIndices : lowerIndices;
      target.push(a, b, c, a, c, d);
    }
  }

  const bowOffset = 0;
  const sternOffset = (stations.length - 1) * ringSize;
  for (let point = 1; point < ringSize - 1; point += 1) {
    upperIndices.push(bowOffset, bowOffset + point + 1, bowOffset + point);
    upperIndices.push(sternOffset, sternOffset + point, sternOffset + point + 1);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex([...upperIndices, ...lowerIndices]);
  geometry.addGroup(0, upperIndices.length, 0);
  geometry.addGroup(upperIndices.length, lowerIndices.length, 1);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();

  const hull = new THREE.Mesh(geometry, [upperMaterial, lowerMaterial]);
  hull.name = 'station-lofted-hull';
  return hull;
}

function extrudePlan(points, depth, bevelSize, material, name) {
  const shape = new THREE.Shape();
  shape.moveTo(points[0][0], points[0][1]);
  points.slice(1).forEach(([x, y]) => shape.lineTo(x, y));
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelSegments: 3,
    bevelSize,
    bevelThickness: bevelSize,
    curveSegments: 20,
    steps: 1,
  });
  geometry.translate(0, 0, -depth / 2);
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  return mesh;
}

function createMaterials() {
  const paintMaps = createPaintSurfaceMaps();
  return {
    upper: new THREE.MeshPhysicalMaterial({
      color: 0xc5d3d2,
      metalness: 0.025,
      roughness: 0.48,
      roughnessMap: paintMaps.roughnessMap,
      normalMap: paintMaps.normalMap,
      normalScale: new THREE.Vector2(0.075, 0.075),
      clearcoat: 0.3,
      clearcoatRoughness: 0.28,
      side: THREE.DoubleSide,
    }),
    lower: new THREE.MeshPhysicalMaterial({
      color: 0x123c4b,
      metalness: 0.06,
      roughness: 0.56,
      roughnessMap: paintMaps.roughnessMap,
      normalMap: paintMaps.normalMap,
      normalScale: new THREE.Vector2(0.1, 0.1),
      clearcoat: 0.12,
      clearcoatRoughness: 0.42,
      side: THREE.DoubleSide,
    }),
    deck: new THREE.MeshPhysicalMaterial({
      color: 0xaabcbc,
      metalness: 0.02,
      roughness: 0.7,
      roughnessMap: paintMaps.roughnessMap,
      normalMap: paintMaps.normalMap,
      normalScale: new THREE.Vector2(0.12, 0.12),
      clearcoat: 0.08,
    }),
    glass: new THREE.MeshPhysicalMaterial({
      color: 0x102f3d,
      metalness: 0.02,
      roughness: 0.12,
      transmission: 0.16,
      transparent: true,
      opacity: 0.92,
      clearcoat: 0.82,
      clearcoatRoughness: 0.08,
    }),
    metal: new THREE.MeshStandardMaterial({
      color: 0x83979b,
      metalness: 0.76,
      roughness: 0.36,
    }),
    rubber: new THREE.MeshStandardMaterial({
      color: 0x12252c,
      metalness: 0,
      roughness: 0.72,
    }),
    cyan: new THREE.MeshStandardMaterial({
      color: 0x68d6dd,
      emissive: 0x0b5966,
      emissiveIntensity: 0.42,
      metalness: 0.18,
      roughness: 0.28,
    }),
    stripe: new THREE.MeshStandardMaterial({
      color: 0x2f7f88,
      metalness: 0.08,
      roughness: 0.48,
    }),
    coral: new THREE.MeshStandardMaterial({
      color: 0xf18f79,
      emissive: 0x672219,
      emissiveIntensity: 0.32,
      metalness: 0.08,
      roughness: 0.34,
    }),
  };
}

function registerRuntime(root, groups, sockets) {
  const nodes = {};
  root.traverse((object) => {
    if (object.name) nodes[object.name] = object;
  });
  root.userData.sculptRuntime = {
    nodes,
    sockets,
    colliders: [
      { id: 'hull-collider', type: 'box', size: [3.7, 0.95, 1.4], center: [0, -0.08, 0] },
      { id: 'bridge-collider', type: 'box', size: [1.5, 0.84, 0.92], center: [0.25, 0.7, 0] },
    ],
    destructionGroups: groups,
  };
}

export function createMaritimeVessel({ scale = 1, detail = 'hero' } = {}) {
  const vessel = new THREE.Group();
  vessel.name = 'SilkGuardMaritimeVessel';

  const materials = createMaterials();
  const hullAssembly = new THREE.Group();
  hullAssembly.name = 'hull-assembly';
  const bridgeAssembly = new THREE.Group();
  bridgeAssembly.name = 'bridge-assembly';
  const mastAssembly = new THREE.Group();
  mastAssembly.name = 'mast-assembly';
  const deckHardware = new THREE.Group();
  deckHardware.name = 'deck-hardware';

  const stations = [
    { x: 1.95, beam: 0.05, deck: 0.16, keel: -0.18 },
    { x: 1.58, beam: 0.44, deck: 0.27, keel: -0.52 },
    { x: 0.82, beam: 0.69, deck: 0.33, keel: -0.66 },
    { x: -0.18, beam: 0.78, deck: 0.35, keel: -0.64 },
    { x: -1.12, beam: 0.72, deck: 0.32, keel: -0.53 },
    { x: -1.72, beam: 0.53, deck: 0.25, keel: -0.4 },
  ];
  const hull = createStationHull(stations, materials.upper, materials.lower);
  hullAssembly.add(hull);

  const deck = extrudePlan([
    [-1.48, -0.48], [-1.63, 0], [-1.48, 0.48],
    [0.86, 0.62], [1.68, 0.24], [1.84, 0], [1.68, -0.24], [0.86, -0.62],
  ], 0.12, 0.035, materials.deck, 'working-deck');
  deck.rotation.x = -Math.PI / 2;
  deck.position.y = 0.27;
  hullAssembly.add(deck);

  [-1, 1].forEach((side) => {
    const path = new THREE.CatmullRomCurve3(stations.map(({ x, beam }) => (
      new THREE.Vector3(x, -0.12, side * beam * 0.96)
    )));
    const stripe = new THREE.Mesh(
      new THREE.TubeGeometry(path, 64, 0.018, 7, false),
      materials.stripe
    );
    stripe.name = side > 0 ? 'starboard-waterline-stripe' : 'port-waterline-stripe';
    stripe.userData.explodeWithParent = true;
    hullAssembly.add(stripe);
  });

  const bridge = extrudePlan([
    [-0.78, 0], [0.72, 0], [0.62, 0.42], [0.35, 0.68], [-0.38, 0.68], [-0.72, 0.34],
  ], 0.82, 0.055, materials.upper, 'bridge-shell');
  bridge.position.set(0.02, 0.39, 0);
  bridgeAssembly.add(bridge);

  const roof = extrudePlan([
    [-0.84, -0.48], [-0.9, 0], [-0.84, 0.48], [0.62, 0.48], [0.75, 0], [0.62, -0.48],
  ], 0.1, 0.035, materials.upper, 'bridge-roof');
  roof.rotation.x = -Math.PI / 2;
  roof.position.set(-0.03, 1.12, 0);
  bridgeAssembly.add(roof);

  [-1, 1].forEach((side) => {
    const z = side * 0.421;
    const sideWindow = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.27, 0.025), materials.glass);
    sideWindow.name = side > 0 ? 'starboard-window-band' : 'port-window-band';
    sideWindow.position.set(-0.04, 0.85, z);
    sideWindow.userData.explodeWithParent = true;
    bridgeAssembly.add(sideWindow);
    [0.28, -0.2, -0.5].forEach((x, index) => {
      const mullion = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.3, 0.035), materials.rubber);
      mullion.name = `${side > 0 ? 'starboard' : 'port'}-window-mullion-${index + 1}`;
      mullion.position.set(x, 0.85, z + side * 0.003);
      mullion.userData.explodeWithParent = true;
      bridgeAssembly.add(mullion);
    });
  });

  const windshield = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.31, 0.62), materials.glass);
  windshield.name = 'forward-windshield';
  windshield.position.set(0.685, 0.82, 0);
  windshield.rotation.z = -0.18;
  bridgeAssembly.add(windshield);

  const mastBase = new THREE.Object3D();
  mastBase.name = 'mast-base-socket';
  mastBase.position.set(-0.18, 1.15, 0);
  mastAssembly.add(mastBase);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 0.72, 12), materials.metal);
  mast.name = 'radar-mast';
  mast.position.set(-0.18, 1.48, 0);
  mastAssembly.add(mast);
  mastAssembly.add(cylinderBetween(
    new THREE.Vector3(-0.48, 1.63, 0),
    new THREE.Vector3(0.12, 1.63, 0),
    0.024,
    materials.metal,
    'radar-crossbar'
  ));

  const radarPedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.12, 14), materials.metal);
  radarPedestal.name = 'radar-pedestal';
  radarPedestal.position.set(-0.18, 1.72, 0);
  mastAssembly.add(radarPedestal);
  const radarDome = new THREE.Mesh(new THREE.SphereGeometry(0.16, 20, 14), materials.upper);
  radarDome.name = 'radar-dome';
  radarDome.scale.y = 0.62;
  radarDome.position.set(-0.18, 1.82, 0);
  mastAssembly.add(radarDome);

  [-1, 1].forEach((side) => {
    const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.018, 0.55, 8), materials.metal);
    antenna.name = side > 0 ? 'starboard-aerial' : 'port-aerial';
    antenna.position.set(-0.18, 1.9, side * 0.22);
    antenna.rotation.x = side * -0.08;
    mastAssembly.add(antenna);

    const navLight = new THREE.Mesh(
      new THREE.SphereGeometry(0.045, 14, 10),
      side > 0 ? materials.coral : materials.cyan
    );
    navLight.name = side > 0 ? 'starboard-navigation-light' : 'port-navigation-light';
    navLight.position.set(-0.18, 1.64, side * 0.31);
    mastAssembly.add(navLight);
  });

  if (detail === 'hero') {
    [-1, 1].forEach((side) => {
      const z = side * 0.61;
      const railY = 0.72;
      const railPath = [
        new THREE.Vector3(1.5, railY, z * 0.52),
        new THREE.Vector3(0.95, railY, z),
        new THREE.Vector3(-1.24, railY, z * 0.94),
      ];
      for (let index = 0; index < railPath.length - 1; index += 1) {
        deckHardware.add(cylinderBetween(
          railPath[index], railPath[index + 1], 0.014, materials.metal,
          `${side > 0 ? 'starboard' : 'port'}-rail-${index + 1}`
        ));
      }
      [1.44, 0.94, 0.25, -0.45, -1.18].forEach((x, index) => {
        const beam = x > 1.2 ? 0.34 : x > 0.7 ? 0.61 : x > -0.8 ? 0.7 : 0.62;
        deckHardware.add(cylinderBetween(
          new THREE.Vector3(x, 0.38, side * beam),
          new THREE.Vector3(x, railY, side * beam),
          0.012,
          materials.metal,
          `${side > 0 ? 'starboard' : 'port'}-stanchion-${index + 1}`
        ));
      });
    });

    [-1.08, -0.76, 0.82, 1.08].forEach((x, index) => {
      const bollard = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 0.13, 12), materials.metal);
      bollard.name = `deck-bollard-${index + 1}`;
      bollard.position.set(x, 0.49, index % 2 ? 0.48 : -0.48);
      deckHardware.add(bollard);
    });

    [-1, 1].forEach((side) => {
      const lifeRing = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.028, 10, 28), materials.coral);
      lifeRing.name = side > 0 ? 'starboard-life-ring' : 'port-life-ring';
      lifeRing.rotation.x = Math.PI / 2;
      lifeRing.position.set(-0.72, 0.77, side * 0.71);
      lifeRing.userData.explodeWithParent = true;
      deckHardware.add(lifeRing);
    });
  }

  vessel.add(hullAssembly, bridgeAssembly, mastAssembly, deckHardware);
  vessel.scale.setScalar(scale);

  const sockets = {
    bow: new THREE.Vector3(1.92, 0.2, 0),
    stern: new THREE.Vector3(-1.7, 0.28, 0),
    mastBase: new THREE.Vector3(-0.18, 1.15, 0),
    portLight: new THREE.Vector3(-0.18, 1.64, -0.31),
    starboardLight: new THREE.Vector3(-0.18, 1.64, 0.31),
  };
  registerRuntime(vessel, {
    hull: ['hull-assembly'],
    bridge: ['bridge-assembly'],
    mast: ['mast-assembly'],
    hardware: ['deck-hardware'],
  }, sockets);

  return vessel;
}
