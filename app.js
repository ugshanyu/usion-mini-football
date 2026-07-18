import * as THREE from '/sdk-v3-football/three.module.min.js';

const SDK_VERSION = '3.0.0-next.6';
const canvas = document.querySelector('#game');
const score = document.querySelector('#score');
const time = document.querySelector('#time');
const status = document.querySelector('#status');
const stick = document.querySelector('#stick');
const knob = document.querySelector('#knob');
const kickButton = document.querySelector('#kick');
const entities = new Map();
const targets = new Map();
const input = { x: 0, y: 0, kick: false };
const keys = new Set();
let app;
let me = '';
let matchStatus = 'waiting';
let rematchPending = false;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x07140d);
const camera = new THREE.PerspectiveCamera(48, 1, .1, 100);
camera.position.set(0, 14, 12);
camera.lookAt(0, 0, 0);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
scene.add(new THREE.HemisphereLight(0xffffff, 0x183322, 2.3));
const sun = new THREE.DirectionalLight(0xffffff, 2.2);
sun.position.set(2, 10, 4);
sun.castShadow = true;
scene.add(sun);

const field = new THREE.Mesh(
  new THREE.PlaneGeometry(18, 10),
  new THREE.MeshStandardMaterial({ color: 0x23854b, roughness: .9 }),
);
field.rotation.x = -Math.PI / 2;
field.receiveShadow = true;
scene.add(field);
const lineMaterial = new THREE.LineBasicMaterial({ color: 0xeaf6ec });
const markings = new THREE.LineSegments(
  new THREE.EdgesGeometry(new THREE.PlaneGeometry(18, 10)),
  lineMaterial,
);
markings.rotation.x = -Math.PI / 2;
markings.position.y = .012;
scene.add(markings);
const middle = new THREE.Mesh(
  new THREE.PlaneGeometry(.045, 10),
  new THREE.MeshBasicMaterial({ color: 0xeaf6ec }),
);
middle.rotation.x = -Math.PI / 2;
middle.position.y = .015;
scene.add(middle);

function resize() {
  const width = innerWidth;
  const height = innerHeight;
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.position.set(0, height > width ? 17 : 13, height > width ? 14 : 11);
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

function meshFor(id, entity) {
  if (entity.kind === 'match') return null;
  let mesh = entities.get(id);
  if (mesh) return mesh;
  if (entity.kind === 'ball') {
    mesh = new THREE.Mesh(
      new THREE.SphereGeometry(.28, 20, 14),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .65 }),
    );
    mesh.position.y = .3;
  } else {
    mesh = new THREE.Mesh(
      new THREE.CapsuleGeometry(.34, .55, 5, 10),
      new THREE.MeshStandardMaterial({
        color: entity.team === 0 ? 0x3f8cff : 0xff4b55,
        roughness: .7,
      }),
    );
    mesh.position.y = .65;
  }
  mesh.castShadow = true;
  scene.add(mesh);
  entities.set(id, mesh);
  return mesh;
}

function applySnapshot(snapshot) {
  const state = snapshot.state && typeof snapshot.state === 'object' ? snapshot.state : {};
  const next = state.entities && typeof state.entities === 'object' ? state.entities : {};
  me = typeof state.you === 'string' ? state.you : me;
  for (const [id, entity] of Object.entries(next)) {
    if (!entity || typeof entity !== 'object') continue;
    if (entity.kind === 'match') {
      matchStatus = entity.status;
      if (matchStatus === 'playing') rematchPending = false;
      score.textContent = `${entity.score?.[0] ?? 0} — ${entity.score?.[1] ?? 0}`;
      time.textContent = entity.status === 'waiting'
        ? 'Waiting' : `${Math.ceil(entity.remaining ?? 0)}s`;
      if (entity.status === 'finished') {
        status.textContent = rematchPending
          ? 'Rematch requested' : 'Tap kick to rematch';
      }
      continue;
    }
    meshFor(id, entity);
    targets.set(id, { x: Number(entity.x) || 0, y: Number(entity.y) || 0 });
  }
  for (const id of state.removed ?? []) {
    const mesh = entities.get(id);
    if (mesh) scene.remove(mesh);
    entities.delete(id);
    targets.delete(id);
  }
}

function updateKeyboard() {
  input.x = (keys.has('ArrowRight') || keys.has('KeyD') ? 1 : 0)
    - (keys.has('ArrowLeft') || keys.has('KeyA') ? 1 : 0);
  input.y = (keys.has('ArrowDown') || keys.has('KeyS') ? 1 : 0)
    - (keys.has('ArrowUp') || keys.has('KeyW') ? 1 : 0);
}
addEventListener('keydown', event => {
  keys.add(event.code);
  if (event.code === 'Space') input.kick = true;
  updateKeyboard();
});
addEventListener('keyup', event => {
  keys.delete(event.code);
  if (event.code === 'Space') input.kick = false;
  updateKeyboard();
});

function moveStick(event) {
  const rect = stick.getBoundingClientRect();
  const dx = event.clientX - rect.left - rect.width / 2;
  const dy = event.clientY - rect.top - rect.height / 2;
  const distance = Math.hypot(dx, dy) || 1;
  const radius = 34;
  const scale = Math.min(1, radius / distance);
  const x = dx * scale;
  const y = dy * scale;
  knob.style.transform = `translate(${x}px, ${y}px)`;
  input.x = x / radius;
  input.y = y / radius;
}
stick.addEventListener('pointerdown', event => {
  stick.setPointerCapture(event.pointerId);
  moveStick(event);
});
stick.addEventListener('pointermove', event => {
  if (stick.hasPointerCapture(event.pointerId)) moveStick(event);
});
function releaseStick() {
  knob.style.transform = 'translate(0, 0)';
  input.x = 0;
  input.y = 0;
}
stick.addEventListener('pointerup', releaseStick);
stick.addEventListener('pointercancel', releaseStick);
kickButton.addEventListener('pointerdown', event => {
  if (matchStatus === 'finished') {
    event.preventDefault();
    if (!rematchPending) {
      rematchPending = true;
      status.textContent = 'Rematch requested';
      void app?.game.action('rematch', {}, { queueIfOffline: true })
        .catch(() => {
          rematchPending = false;
          status.textContent = 'Tap kick to retry';
        });
    }
    return;
  }
  kickButton.setPointerCapture(event.pointerId);
  kickButton.classList.add('on');
  input.kick = true;
});
function releaseKick() {
  kickButton.classList.remove('on');
  input.kick = false;
}
kickButton.addEventListener('pointerup', releaseKick);
kickButton.addEventListener('pointercancel', releaseKick);

function animate() {
  requestAnimationFrame(animate);
  for (const [id, target] of targets) {
    const mesh = entities.get(id);
    if (!mesh) continue;
    mesh.position.x += (target.x - mesh.position.x) * .24;
    mesh.position.z += (target.y - mesh.position.z) * .24;
    if (id === me) {
      mesh.position.x += input.x * .025;
      mesh.position.z += input.y * .025;
    }
  }
  app?.game.sendInput({ ...input });
  renderer.render(scene, camera);
}
animate();

async function boot() {
  if (window.Usion?.version !== SDK_VERSION) throw new Error(`Expected SDK ${SDK_VERSION}`);
  app = await window.Usion.init({ capabilities: ['game'] });
  app.game.onStatus(game => {
    status.textContent = game.connection === 'ready' ? 'Live' : game.connection;
  });
  app.game.onSnapshot(applySnapshot);
  await app.game.join({ timeoutMs: 20_000 });
  console.info('[mini-football-v3]', { event: 'joined', roomId: app.game.status.roomId });
}
boot().catch(error => {
  status.textContent = 'Reconnect failed';
  console.error('[mini-football-v3]', { event: 'boot_failed', message: error?.message });
});
