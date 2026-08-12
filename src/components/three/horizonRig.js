import * as THREE from 'three';

/**
 * 把 3D 相机锁死到背景照片的海平线上。
 *
 * 背景图用 object-fit: cover + object-position: center 48% 铺满容器，
 * 再叠一层 transform: scale()。所以照片里的海平线落在屏幕哪一行，
 * 取决于容器尺寸、图片比例和当前缩放，随视口和滚动持续变化。
 *
 * 只要先算出海平线的屏幕行号，就能反解出相机俯仰角：
 * 无限远地平面的地平线在屏幕上的位置只由相机朝向决定，与位置无关。
 *
 *   y_px = ch/2 · (1 + tan(rx) / tan(vfov/2))
 *   =>  rx = atan( tan(vfov/2) · (2·y_px/ch − 1) )
 *
 * 这样 y=0 的海面平面就会精确投影到照片的海平线上，船才可能真正"在水里"。
 */

// 源图 public/assets/brand/qingshui-cliff-ccby-v1.webp 实测：
// 1920×1280，天空/海面分界在第 625 行。
const PHOTO_W = 1920;
const PHOTO_H = 1280;
const PHOTO_HORIZON_V = 625 / PHOTO_H; // 0.4883
// 与 globals.css 里 .maritime-photo 的 object-position: center 48% 保持一致
const PHOTO_FOCUS_Y = 0.48;

export function createHorizonRig({ fov = 42 } = {}) {
  // near 取 1：相机离海面 7.4，没有更近的东西，
  // 把近平面拉远能显著提升远处水面与接触面之间的深度精度，避免 z-fighting。
  const camera = new THREE.PerspectiveCamera(fov, 1, 1, 2000);
  camera.rotation.order = 'YXZ';

  const state = {
    width: 1,
    height: 1,
    cssScale: 1,
    horizonPx: 0.5,
    // 相机离海面的高度。照片是从清水断崖俯拍，视点明显高于海面，
    // 原来那台 y=0.25 的平视相机是船体透视对不上的根因之一。
    height3d: 7.4,
  };

  const raycaster = new THREE.Raycaster();
  const seaPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const hit = new THREE.Vector3();

  /** 照片 UV → 屏幕像素（复刻 cover + object-position + scale 的全过程） */
  function uvToScreen(u, v) {
    const { width: cw, height: ch, cssScale } = state;
    const k = Math.max(cw / PHOTO_W, ch / PHOTO_H);
    const rw = PHOTO_W * k;
    const rh = PHOTO_H * k;
    const left = (cw - rw) * 0.5;
    const top = (ch - rh) * PHOTO_FOCUS_Y;
    const x = left + u * rw;
    const y = top + v * rh;
    return {
      x: cw / 2 + (x - cw / 2) * cssScale,
      y: ch / 2 + (y - ch / 2) * cssScale,
    };
  }

  function horizonPx() {
    return uvToScreen(0.5, PHOTO_HORIZON_V).y;
  }

  /**
   * 当前裁切下照片横向真正可见的 UV 区间。
   * 竖屏时 cover 会把照片左右各切掉一大块，用绝对 UV 定位的航线会整段跑到屏幕外，
   * 所以航线的横向位置要按这个可见窗口来取。
   */
  function visibleURange() {
    const { width: cw, height: ch, cssScale } = state;
    const k = Math.max(cw / PHOTO_W, ch / PHOTO_H);
    const rw = PHOTO_W * k * cssScale;
    const left = cw / 2 - rw / 2;
    const u0 = THREE.MathUtils.clamp(-left / rw, 0, 1);
    const u1 = THREE.MathUtils.clamp((cw - left) / rw, 0, 1);
    return [u0, u1];
  }

  /** 屏幕像素 → y=0 海面上的世界坐标 */
  function screenToSea(px, py, target = new THREE.Vector3()) {
    const ndc = new THREE.Vector2(
      (px / state.width) * 2 - 1,
      -((py / state.height) * 2 - 1)
    );
    raycaster.setFromCamera(ndc, camera);
    const point = raycaster.ray.intersectPlane(seaPlane, hit);
    if (!point) {
      // 射线平行或指向天空：退回到一个很远的点，避免 NaN
      return target.set(0, 0, -400);
    }
    return target.copy(point);
  }

  /** 照片 UV → 海面世界坐标 */
  function uvToSea(u, v, target) {
    const s = uvToScreen(u, v);
    return screenToSea(s.x, s.y, target);
  }

  function update({ width, height, cssScale }) {
    state.width = Math.max(1, width);
    state.height = Math.max(1, height);
    state.cssScale = cssScale;

    camera.aspect = state.width / state.height;

    const target = horizonPx();
    state.horizonPx = target;

    const halfFov = THREE.MathUtils.degToRad(camera.fov) / 2;
    const rx = Math.atan(Math.tan(halfFov) * ((2 * target) / state.height - 1));

    camera.position.y = state.height3d;
    camera.rotation.x = rx;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
  }

  /**
   * 让船在屏幕上占到指定像素长度。
   * 世界尺度由海平线和相机高度定死了，所以船的缩放不能再拍脑袋写死，
   * 必须按它到相机的实际距离反算，否则换个视口比例就穿帮。
   */
  function fitScaleForScreenLength(worldPoint, unitLength, targetPx) {
    const distance = camera.position.distanceTo(worldPoint);
    const halfFov = THREE.MathUtils.degToRad(camera.fov) / 2;
    const worldPerPx = (2 * Math.tan(halfFov) * distance) / state.height;
    return (targetPx * worldPerPx) / unitLength;
  }

  return {
    camera,
    state,
    update,
    uvToScreen,
    uvToSea,
    screenToSea,
    horizonPx,
    visibleURange,
    fitScaleForScreenLength,
    PHOTO_HORIZON_V,
  };
}
