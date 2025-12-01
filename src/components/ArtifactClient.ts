// src/components/ArtifactClient.ts
export async function mountArtifact(container: HTMLElement) {
  if (!container || (container as any)._mounted) return;
  (container as any)._mounted = true;

  // dynamic import to avoid bundling GL deps into main bundle
  const THREE = await import('three');
  const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
  const { DRACOLoader } = await import('three/examples/jsm/loaders/DRACOLoader.js');

  const modelUrl = container.dataset.model!;
  const width = container.clientWidth;
  const height = container.clientHeight;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, width/height, 0.1, 1000);
  camera.position.set(0,1.2,2.5);

  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  // CAP DPR for perf
  const DPR = Math.min(window.devicePixelRatio, 1.5);
  renderer.setPixelRatio(DPR);
  renderer.setSize(width, height);
  container.appendChild(renderer.domElement);

  // simple lights
  scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1.0));
  const dir = new THREE.DirectionalLight(0xffffff, 0.6);
  dir.position.set(3,10,10);
  scene.add(dir);

  // Loaders
  const dracoLoader = new DRACOLoader();
  dracoLoader.setDecoderPath('https://www.gstatic.com/draco/v1/decoders/'); // or host locally/CDN
  const loader = new GLTFLoader();
  loader.setDRACOLoader(dracoLoader);

  try {
    const gltf = await loader.loadAsync(modelUrl);
    scene.add(gltf.scene);
  } catch (err) {
    console.error('GLTF load failed', err);
    return;
  }

  // Render function (on demand)
  function render() {
    renderer.render(scene, camera);
  }
  // initial single render to replace LQIP quickly
  render();

  // only animate if necessary (rotate/interaction). keep idle otherwise to save CPU
  let animId: number | null = null;
  const needsAnimation = false; // set true if you want continuous rotation
  if (needsAnimation) {
    (function animate() {
      animId = requestAnimationFrame(animate);
      // example rotation
      scene.rotation.y += 0.002;
      render();
    })();
  }

  // Resize
  const ro = new ResizeObserver(() => {
    const w = container.clientWidth, h = container.clientHeight;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    render();
  });
  ro.observe(container);

  // expose cleanup
  (container as any)._cleanup = () => {
    ro.disconnect();
    if (animId) cancelAnimationFrame(animId);
    renderer.dispose();
    container.removeChild(renderer.domElement);
  };
}