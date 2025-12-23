import * as THREE from "../lib/three.module.js";
import { OrbitControls } from "../lib/OrbitControls.js";
import { GLTFLoader } from "../lib/GLTFLoader.js";

const app = document.getElementById("app");
const modelModal = document.getElementById("modelModal");
const themeToggle = document.getElementById("themeToggle");
const themeIcon = document.getElementById("themeIcon");
const brand = document.getElementById("brand");

const modelSelectA = document.getElementById("modelSelectA");
const chooseA = document.getElementById("chooseA");
const modelNameA = document.getElementById("modelNameA");
const viewA = document.getElementById("viewA");

const modelSelectB = document.getElementById("modelSelectB");
const chooseB = document.getElementById("chooseB");
const modelNameB = document.getElementById("modelNameB");
const viewB = document.getElementById("viewB");
const addCompareBtn = document.getElementById("addCompare");
const resetCompareBtn = document.getElementById("resetCompare");

const progressA = {
  overlay: document.getElementById("progressA"),
  fill: document.getElementById("progressFillA"),
  label: document.getElementById("progressLabelA"),
};

const progressB = {
  overlay: document.getElementById("progressB"),
  fill: document.getElementById("progressFillB"),
  label: document.getElementById("progressLabelB"),
};

const onboarding = document.getElementById("onboarding");
const closeOnboarding = document.getElementById("closeOnboarding");
const tipOrbit = document.getElementById("tipOrbit");
const tipCompare = document.getElementById("tipCompare");

const DEFAULT_A = "models/Nap/scene.gltf";
const DEFAULT_B = "models/rome_helmet.glb";

const viewers = [];

class Viewer {
  constructor({ container, selectEl, statusEl, defaultModel, target }) {
    this.container = container;
    this.selectEl = selectEl;
    this.statusEl = statusEl;
    this.defaultModel = defaultModel;
    this.target = target;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(55, 1, 0.01, 200);
    this.camera.position.set(0.9, 0.6, 1.2);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;
    this.renderer.setClearColor("#ffffff", 1);
    this.container.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.06;
    this.controls.target.set(0, 0.15, 0);
    this.controls.autoRotate = true;
    this.controls.autoRotateSpeed = 0.8;
    this.controls.zoomSpeed = 1.6;
    this.controls.zoomToCursor = true;

    const hemi = new THREE.HemisphereLight(0xffffff, 0xffffff, 1.05);
    this.scene.add(hemi);

    const dir = new THREE.DirectionalLight(0xffffff, 1.25);
    dir.position.set(2, 4, 2.5);
    this.scene.add(dir);

    // Zachte opvullight om schaduwen aan de zijkanten te verminderen.
    const fill = new THREE.DirectionalLight(0xffffff, 0.65);
    fill.position.set(-3, 2, -3);
    this.scene.add(fill);

    const ambient = new THREE.AmbientLight(0xffffff, 0.35);
    this.scene.add(ambient);

    this.loader = new GLTFLoader();
    this.currentRoot = null;
    this.hasInteracted = false;

    this.progressOverlay = null;
    this.progressFill = null;
    this.progressLabel = null;

    this.resize();
    this.renderer.domElement.addEventListener("pointerdown", () => this.stopAutoRotate());
    this.renderer.domElement.addEventListener("touchstart", () => this.stopAutoRotate());

    if (this.selectEl) {
      this.selectEl.addEventListener("change", async () => {
        try {
          await this.loadModel(this.selectEl.value);
        } catch (e) {
          console.error(e);
        }
      });
    }
  }

  setStatus(text) {
    if (this.statusEl) this.statusEl.textContent = text;
  }

  setBackground(color) {
    this.renderer.setClearColor(color, 1);
  }

  fitToView(object3D) {
    const box = new THREE.Box3().setFromObject(object3D);
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);

    object3D.position.sub(center);

    const maxDim = Math.max(size.x, size.y, size.z);
    const fov = THREE.MathUtils.degToRad(this.camera.fov);
    let dist = (maxDim / 2) / Math.tan(fov / 2);
    dist *= 1.35;

    const radius = Math.max(sphere.radius, 0.001);
    this.camera.near = Math.max(0.001, radius / 500);
    this.camera.far = radius * 100;
    this.camera.updateProjectionMatrix();

    this.controls.minDistance = radius * 0.25;
    this.controls.maxDistance = radius * 25;

    this.camera.position.set(dist, dist * 0.6, dist);
    this.controls.target.set(0, 0, 0);
    this.controls.update();
  }

  async loadModel(url = this.defaultModel) {
    const label = url.split("/").pop() || "model";
    this.setStatus(`Model laden… (${label})`);
    this.showProgress(0);
    if (this.currentRoot) {
      this.scene.remove(this.currentRoot);
      this.currentRoot.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) {
          if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
          else o.material.dispose();
        }
      });
      this.currentRoot = null;
    }

    return new Promise((resolve, reject) => {
      this.loader.load(
        url,
        (gltf) => {
          this.currentRoot = gltf.scene;
          this.scene.add(this.currentRoot);
          this.fitToView(this.currentRoot);
          this.hasInteracted = false;
          this.controls.autoRotate = true;
          this.setStatus("Gereed");
          setModelName(this.target, url);
          this.showProgress(100);
          setTimeout(() => this.hideProgress(), 400);
          resolve();
        },
        (ev) => {
          const pct = ev.total ? Math.round((ev.loaded / ev.total) * 100) : null;
          if (pct !== null) {
            this.setStatus(`Download… ${pct}%`);
            this.showProgress(pct);
          } else {
            this.setStatus("Download…");
            this.showProgress(15);
          }
        },
        (err) => {
          console.error("GLTF load error", err);
          this.setStatus("Fout: model kan niet laden");
          this.showProgress(0, true);
          reject(err);
        }
      );
    });
  }

  resize() {
    const w = this.container.clientWidth || app.clientWidth;
    const h = this.container.clientHeight || app.clientHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
  }

  stopAutoRotate() {
    if (this.hasInteracted) return;
    this.hasInteracted = true;
    this.controls.autoRotate = false;
    markOrbitTipUsed();
  }

  update() {
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  attachProgress({ overlay, fill, label }) {
    this.progressOverlay = overlay;
    this.progressFill = fill;
    this.progressLabel = label;
  }

  showProgress(percent = 0, isError = false) {
    if (!this.progressOverlay || !this.progressFill) return;
    this.progressOverlay.classList.remove("hidden");
    const pct = Math.max(0, Math.min(100, percent));
    this.progressFill.style.width = `${pct}%`;
    if (isError) {
      this.progressFill.style.background = "linear-gradient(135deg, #ff5f6d, #ffc371)";
    }
  }

  hideProgress() {
    if (!this.progressOverlay) return;
    this.progressOverlay.classList.add("hidden");
  }
}

function applyTheme(theme) {
  const body = document.body;
  const isDark = theme === "dark";
  body.classList.toggle("theme-dark", isDark);
  if (themeIcon) themeIcon.textContent = isDark ? "☀" : "☾";
  const bg = getComputedStyle(body).getPropertyValue("--bg-color").trim() || "#ffffff";
  viewers.forEach((v) => v.setBackground(bg));
  localStorage.setItem("viewer-theme", theme);
}

function toggleTheme() {
  const current = document.body.classList.contains("theme-dark") ? "dark" : "light";
  applyTheme(current === "dark" ? "light" : "dark");
}

function showHome() {
  if (modelModal) modelModal.classList.remove("hidden");
  setOverlayMode(true, { hideBrand: true });
  currentTarget = "A";
  viewerA.setStatus("Kies een model om te starten");
}

function handleModelPick(url) {
  if (modelModal) modelModal.classList.add("hidden");
  if (brand) brand.classList.remove("hidden");
  setOverlayMode(false);

  if (currentTarget === "B" && viewB && !compareEnabled) {
    compareEnabled = true;
    viewB.classList.remove("hidden");
    resizeAll();
    if (resetCompareBtn) resetCompareBtn.classList.remove("hidden");
  }

  if (currentTarget === "B" && modelSelectB) modelSelectB.value = url;
  if (currentTarget !== "B" && modelSelectA) modelSelectA.value = url;

  if (currentTarget === "B") {
    viewerB.loadModel(url).catch((err) => console.error(err));
    markCompareTipUsed();
  } else {
    viewerA.loadModel(url).catch((err) => console.error(err));
  }

  if (!orbitTipShown) {
    showTip(tipOrbit);
  }

  setModelName(currentTarget, url);
}

function resizeAll() {
  viewers.forEach((v) => v.resize());
}

const viewerA = new Viewer({
  container: viewA,
  selectEl: modelSelectA,
  statusEl: null,
  defaultModel: DEFAULT_A,
  target: "A",
});

const viewerB = new Viewer({
  container: viewB,
  selectEl: modelSelectB,
  statusEl: null,
  defaultModel: DEFAULT_B,
  target: "B",
});

viewers.push(viewerA, viewerB);

viewerA.attachProgress(progressA);
viewerB.attachProgress(progressB);

let compareEnabled = false;
let currentTarget = "A";
let orbitTipShown = false;
let compareTipShown = false;

function setOverlayMode(active, { hideBrand = false } = {}) {
  const toggle = !!active;
  setTitleBlur(toggle);
  if (viewA) viewA.classList.toggle("blur", toggle);
  if (viewB) viewB.classList.toggle("blur", toggle);
  if (brand) {
    if (hideBrand && toggle) {
      brand.style.display = "none";
      brand.classList.remove("blur");
    } else {
      brand.style.display = "";
      brand.classList.toggle("blur", toggle);
    }
  }
}

function setTitleBlur(active) {
  const toggle = !!active;
  if (modelNameA) modelNameA.classList.toggle("blur", toggle);
  if (modelNameB) modelNameB.classList.toggle("blur", toggle);
}

function markOrbitTipUsed() {
  if (orbitTipShown) return;
  orbitTipShown = true;
  hideTip(tipOrbit);
}

function markCompareTipUsed() {
  if (compareTipShown) return;
  compareTipShown = true;
  hideTip(tipCompare);
}

function setModelName(target, url, customLabel) {
  const getLabelFromSelect = (selectEl) => {
    if (!selectEl) return null;
    const opt = Array.from(selectEl.options).find((o) => o.value === url);
    return opt ? (opt.textContent || opt.value) : null;
  };

  let name = customLabel || getLabelFromSelect(target === "B" ? modelSelectB : modelSelectA);
  if (!name) {
    const label = url.split("/").pop() || "Model";
    name = label.replace(/\.(gltf|glb)$/i, "").replace(/[_-]/g, " ");
  }
  if (target === "A" && modelNameA) modelNameA.textContent = name;
  if (target === "B" && modelNameB) modelNameB.textContent = name;
}

function openModelModal(target = "A") {
  currentTarget = target;
  if (modelModal) modelModal.classList.remove("hidden");
  setOverlayMode(true);
}

function showTip(el) {
  if (!el) return;
  el.classList.remove("hidden");
}

function hideTip(el) {
  if (!el) return;
  el.classList.add("hidden");
}

function resetComparison() {
  compareEnabled = false;
  currentTarget = "A";
  if (viewB) viewB.classList.add("hidden");
  if (resetCompareBtn) resetCompareBtn.classList.add("hidden");
  if (tipCompare) hideTip(tipCompare);
  if (modelSelectB) modelSelectB.value = DEFAULT_B;
  setModelName("B", DEFAULT_B, "Kies model");
  resizeAll();
  const resetUrl = modelSelectA && modelSelectA.value ? modelSelectA.value : DEFAULT_A;
  viewerA.loadModel(resetUrl).catch((err) => console.error(err));
  setModelName("A", resetUrl);
  setTitleBlur(false);
}

async function init() {
  const savedTheme = localStorage.getItem("viewer-theme");
  applyTheme(savedTheme === "dark" ? "dark" : "light");
  if (onboarding) {
    onboarding.classList.add("hidden");
    localStorage.setItem("viewer-onboarded", "1");
  }
  // reset tip flags each load so they reappear until de actie gedaan is
  orbitTipShown = false;
  compareTipShown = false;

  resizeAll();

  // Prompt viewer A to choose a model via modal.
  viewerA.setStatus("Kies een model om te starten");

  if (modelModal) {
    setOverlayMode(true, { hideBrand: true });
    modelModal.querySelectorAll(".option").forEach((btn) => {
      if (btn.disabled || !btn.dataset.model) return;
      btn.addEventListener("click", () => handleModelPick(btn.dataset.model));
    });
  } else {
    if (brand) brand.classList.remove("hidden");
    viewerA.loadModel(DEFAULT_A).catch((err) => console.error(err));
  }

  if (brand) {
    brand.addEventListener("click", showHome);
  }

  if (closeOnboarding) {
    closeOnboarding.addEventListener("click", () => {
      if (onboarding) onboarding.classList.add("hidden");
      localStorage.setItem("viewer-onboarded", "1");
    });
  }

  if (chooseA) {
    chooseA.addEventListener("click", () => openModelModal("A"));
  }

  if (chooseB) {
    chooseB.addEventListener("click", () => openModelModal("B"));
  }

  if (modelNameA) {
    modelNameA.addEventListener("click", () => openModelModal("A"));
  }

  if (modelNameB) {
    modelNameB.addEventListener("click", () => openModelModal("B"));
  }

  if (modelSelectA) {
    modelSelectA.addEventListener("change", () => setModelName("A", modelSelectA.value));
  }

  if (modelSelectB) {
    modelSelectB.addEventListener("change", () => setModelName("B", modelSelectB.value));
  }

  if (themeToggle) {
    themeToggle.addEventListener("click", toggleTheme);
  }

  // Start met home/keuzescherm zichtbaar, geen model geladen.
  if (modelModal) {
    modelModal.classList.remove("hidden");
    setOverlayMode(true);
  }

  if (addCompareBtn) {
    addCompareBtn.addEventListener("click", () => {
      if (compareEnabled) return;
      compareEnabled = true;
      viewB.classList.remove("hidden");
      resizeAll();
      openModelModal("B");
      if (!compareTipShown) {
        showTip(tipCompare);
      }
      if (resetCompareBtn) resetCompareBtn.classList.remove("hidden");
    });
  }

  if (resetCompareBtn) {
    resetCompareBtn.addEventListener("click", () => {
      resetComparison();
    });
  }

  window.addEventListener("resize", resizeAll);

  function animate() {
    requestAnimationFrame(animate);
    viewerA.update();
    if (compareEnabled) viewerB.update();
  }
  animate();
}

init();
