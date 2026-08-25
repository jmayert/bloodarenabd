<?php /* assets/fx-3d.js.php — Immersive 3D / animation layer.
   Loaded after app.js.php. Three.js (global THREE) is loaded `defer` in head,
   so it is guaranteed available by DOMContentLoaded. Everything here is gated:
   heavy FX run only under body.fx-on; body.fx-lite is the safe static mode. */ ?>
(function () {
  'use strict';

  // ────────────────────────────────────────────────────────────────
  // Capability gate
  // ────────────────────────────────────────────────────────────────
  function _prefersReduced() {
    try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
    catch (e) { return false; }
  }
  function _saveData() {
    try { return !!(navigator.connection && navigator.connection.saveData); }
    catch (e) { return false; }
  }
  function _userOptedIn() {
    // 3D / animation is OFF by default — enabled only when the user opts in.
    try { return localStorage.getItem('fx_on') === '1'; }
    catch (e) { return false; }
  }
  // Device is "capable" of the rich experience (independent of the user toggle)
  function _deviceCapable() {
    if (_prefersReduced()) return false;
    if (_saveData()) return false;
    var cores = navigator.hardwareConcurrency || 4;
    if (cores < 4) return false;
    if (typeof navigator.deviceMemory === 'number' && navigator.deviceMemory < 4) return false;
    return true;
  }
  function _fxEnabled() { return _deviceCapable() && _userOptedIn(); }

  function _finePointer() {
    try { return window.matchMedia('(hover: hover) and (pointer: fine)').matches; }
    catch (e) { return false; }
  }

  // Apply the resolved mode to <body> as a class (CSS keys off these).
  function _applyMode() {
    var on = _fxEnabled();
    document.body.classList.toggle('fx-on', on);
    document.body.classList.toggle('fx-lite', !on);
    return on;
  }

  // ────────────────────────────────────────────────────────────────
  // Scroll-reveal — one shared IntersectionObserver
  // ────────────────────────────────────────────────────────────────
  var REVEAL_SEL = '.home-hero-bar,.emergency-banner,.app-page-header,.tab-header,' +
                   '.stat-card,.nearby-card,.faq-item,.settings-item,.section-header-row';
  var _revealObs = null;

  function _ensureRevealObs() {
    if (_revealObs || !('IntersectionObserver' in window)) return _revealObs;
    _revealObs = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) {
          en.target.classList.add('in-view');
          _revealObs.unobserve(en.target);
        }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.06 });
    return _revealObs;
  }

  function _tagReveals(root) {
    if (!document.body.classList.contains('fx-on')) return;
    var obs = _ensureRevealObs();
    if (!obs) return;
    var nodes = (root || document).querySelectorAll(REVEAL_SEL);
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (el.classList.contains('reveal')) continue;
      el.classList.add('reveal');
      obs.observe(el);
    }
  }
  window._tagReveals = _tagReveals; // expose for other code if needed

  function _clearReveals() {
    var nodes = document.querySelectorAll('.reveal');
    for (var i = 0; i < nodes.length; i++) {
      nodes[i].classList.remove('reveal', 'in-view');
    }
    if (_revealObs) { _revealObs.disconnect(); _revealObs = null; }
  }

  // ────────────────────────────────────────────────────────────────
  // 3D pointer tilt — event-delegated, fine-pointer only
  // ────────────────────────────────────────────────────────────────
  var TILT_SEL = '.dc,.stat-card,.nearby-card,.settings-item,.faq-item';
  var _tiltEl = null, _tiltRAF = 0, _tiltEvt = null, _tiltBound = false;

  function _resetTilt(el) { if (el) { el.style.transform = ''; el.classList.remove('tilt-live'); } }

  function _onTiltMove(e) {
    if (!document.body.classList.contains('fx-on')) return;
    _tiltEvt = e;
    if (_tiltRAF) return;
    _tiltRAF = requestAnimationFrame(function () {
      _tiltRAF = 0;
      var e2 = _tiltEvt;
      var el = (e2 && e2.target && e2.target.closest) ? e2.target.closest(TILT_SEL) : null;
      if (_tiltEl && _tiltEl !== el) _resetTilt(_tiltEl);
      if (!el) { _tiltEl = null; return; }
      _tiltEl = el;
      var r = el.getBoundingClientRect();
      if (!r.width || !r.height) return;
      var px = (e2.clientX - r.left) / r.width - 0.5;   // -0.5 .. 0.5
      var py = (e2.clientY - r.top) / r.height - 0.5;
      var MAX = 6;
      el.style.transition = 'transform .12s ease-out';
      el.style.transform = 'perspective(700px) translateZ(14px) rotateY(' + (px * MAX).toFixed(2) +
                           'deg) rotateX(' + (-py * MAX).toFixed(2) + 'deg)';
      el.classList.add('tilt-live');
    });
  }
  function _bindTilt() {
    if (_tiltBound || !_finePointer()) return;
    _tiltBound = true;
    document.addEventListener('pointermove', _onTiltMove, { passive: true });
    document.addEventListener('mouseleave', function () { if (_tiltEl) { _resetTilt(_tiltEl); _tiltEl = null; } });
  }

  // ────────────────────────────────────────────────────────────────
  // Three.js blood-drop hero
  // ────────────────────────────────────────────────────────────────
  var _hero = {
    raf: 0, running: false, inView: true, built: false,
    renderer: null, scene: null, camera: null, pivot: null, spinner: null,
    mesh: null, rim: null, particles: null, geo: null, mat: null, t: 0,
    tx: 0, ty: 0, io: null
  };

  function _webglOK() {
    try {
      var c = document.createElement('canvas');
      return !!(window.WebGLRenderingContext &&
        (c.getContext('webgl') || c.getContext('experimental-webgl')));
    } catch (e) { return false; }
  }

  // Teardrop silhouette → surface of revolution (LatheGeometry).
  function _dropProfile() {
    var p = [
      [0.00, -1.00], [0.32, -0.95], [0.55, -0.80], [0.70, -0.60],
      [0.78, -0.35], [0.78, -0.10], [0.72, 0.15], [0.60, 0.40],
      [0.45, 0.65], [0.28, 0.90], [0.14, 1.10], [0.04, 1.30], [0.00, 1.42]
    ];
    return p.map(function (a) { return new THREE.Vector2(a[0], a[1]); });
  }

  function _brandColor() {
    try {
      var c = getComputedStyle(document.documentElement).getPropertyValue('--primary-red').trim();
      if (c) return new THREE.Color(c);
    } catch (e) {}
    return new THREE.Color(0xf2555a);
  }

  function _buildHero() {
    var stage = document.getElementById('heroFx');
    var canvas = document.getElementById('heroCanvas');
    if (!stage || !canvas || !window.THREE || !_webglOK()) return false;

    var w = stage.clientWidth || 320, h = stage.clientHeight || 240;
    var renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas: canvas, alpha: true, antialias: true });
    } catch (e) { return false; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h, false);

    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 100);
    camera.position.set(0, 0, 4.2);
    camera.lookAt(0, 0, 0);

    // pivot (pointer tilt) → spinner (auto Y-spin) → drop
    var pivot = new THREE.Group();
    var spinner = new THREE.Group();
    pivot.add(spinner);
    scene.add(pivot);

    var col = _brandColor();
    var geo = new THREE.LatheGeometry(_dropProfile(), 64);
    geo.computeVertexNormals();
    var mat = new THREE.MeshStandardMaterial({
      color: col, metalness: 0.15, roughness: 0.22,
      emissive: col.clone().multiplyScalar(0.12)
    });
    var mesh = new THREE.Mesh(geo, mat);
    mesh.position.y = -0.2;          // centre the drop in view
    spinner.add(mesh);

    // soft halo / rim
    var rim = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      color: 0xff8a90, transparent: true, opacity: 0.12, side: THREE.BackSide
    }));
    rim.scale.setScalar(1.07);
    rim.position.y = -0.2;
    spinner.add(rim);

    // lights
    scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    var key = new THREE.DirectionalLight(0xffffff, 1.1); key.position.set(2, 3, 4); scene.add(key);
    var rimL = new THREE.PointLight(0xff5a66, 0.9, 20); rimL.position.set(-3, 1, 2); scene.add(rimL);
    var fill = new THREE.PointLight(0x6aa3ff, 0.5, 20); fill.position.set(3, -2, 1); scene.add(fill);

    // floating particles
    var N = 110, pos = new Float32Array(N * 3);
    for (var i = 0; i < N; i++) {
      pos[i * 3]     = (Math.random() - 0.5) * 4.2;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 4.0;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 2.5;
    }
    var pgeo = new THREE.BufferGeometry();
    pgeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    var particles = new THREE.Points(pgeo, new THREE.PointsMaterial({
      color: 0xff6b73, size: 0.045, transparent: true, opacity: 0.75,
      sizeAttenuation: true, depthWrite: false
    }));
    scene.add(particles);

    _hero.renderer = renderer; _hero.scene = scene; _hero.camera = camera;
    _hero.pivot = pivot; _hero.spinner = spinner; _hero.mesh = mesh; _hero.rim = rim;
    _hero.particles = particles; _hero.geo = geo; _hero.mat = mat; _hero.built = true;

    stage.classList.add('webgl-live');
    return true;
  }

  function _renderHero() {
    if (!_hero.built) return;
    _hero.t += 0.016;
    _hero.spinner.rotation.y += 0.006;
    _hero.pivot.position.y = Math.sin(_hero.t) * 0.06;
    // ease pointer/gyro tilt
    _hero.pivot.rotation.x += (_hero.ty - _hero.pivot.rotation.x) * 0.06;
    _hero.pivot.rotation.z += (_hero.tx - _hero.pivot.rotation.z) * 0.06;
    // drift particles upward, wrap
    var arr = _hero.particles.geometry.attributes.position.array;
    for (var i = 1; i < arr.length; i += 3) {
      arr[i] += 0.004;
      if (arr[i] > 2.2) arr[i] = -2.2;
    }
    _hero.particles.geometry.attributes.position.needsUpdate = true;
    _hero.particles.rotation.y += 0.0008;
    _hero.renderer.render(_hero.scene, _hero.camera);
  }

  function _loop() {
    _hero.raf = 0;
    if (!_hero.running) return;
    if (!document.hidden && _hero.inView) _renderHero();
    _hero.raf = requestAnimationFrame(_loop);
  }
  function _startLoop() {
    if (_hero.running) return;
    _hero.running = true;
    _hero.raf = requestAnimationFrame(_loop);
  }
  function _stopLoop() {
    _hero.running = false;
    if (_hero.raf) { cancelAnimationFrame(_hero.raf); _hero.raf = 0; }
  }

  function _resizeHero() {
    if (!_hero.built) return;
    var stage = document.getElementById('heroFx');
    if (!stage) return;
    var w = stage.clientWidth || 320, h = stage.clientHeight || 240;
    _hero.camera.aspect = w / h;
    _hero.camera.updateProjectionMatrix();
    _hero.renderer.setSize(w, h, false);
  }

  function _heroPointer(e) {
    if (!_hero.built) return;
    var nx = (e.clientX / window.innerWidth) - 0.5;
    var ny = (e.clientY / window.innerHeight) - 0.5;
    _hero.tx = -nx * 0.5;   // z-tilt (left/right)
    _hero.ty =  ny * 0.4;   // x-tilt (up/down)
  }
  function _heroOrient(e) {
    if (!_hero.built || e.gamma == null) return;
    _hero.tx = Math.max(-0.5, Math.min(0.5, (e.gamma || 0) / 60));
    _hero.ty = Math.max(-0.4, Math.min(0.4, ((e.beta || 0) - 45) / 90));
  }

  function startHero() {
    if (_hero.built) { _startLoop(); return; }
    if (!document.body.classList.contains('fx-on')) return;
    if (!_buildHero()) return;          // leaves CSS fallback drop visible on failure

    // pause when off-screen
    if ('IntersectionObserver' in window) {
      _hero.io = new IntersectionObserver(function (en) {
        _hero.inView = en[0].isIntersecting;
      }, { threshold: 0.05 });
      _hero.io.observe(document.getElementById('heroFx'));
    }
    window.addEventListener('resize', _resizeHero, { passive: true });
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden && _hero.running) _hero.raf = _hero.raf || requestAnimationFrame(_loop);
    });
    if (_finePointer()) window.addEventListener('pointermove', _heroPointer, { passive: true });
    else window.addEventListener('deviceorientation', _heroOrient, { passive: true });

    _startLoop();
  }

  function destroyHero() {
    _stopLoop();
    if (_hero.io) { try { _hero.io.disconnect(); } catch (e) {} _hero.io = null; }
    window.removeEventListener('resize', _resizeHero);
    window.removeEventListener('pointermove', _heroPointer);
    window.removeEventListener('deviceorientation', _heroOrient);
    try {
      if (_hero.geo) _hero.geo.dispose();
      if (_hero.mat) _hero.mat.dispose();
      if (_hero.rim) _hero.rim.material.dispose();
      if (_hero.particles) { _hero.particles.geometry.dispose(); _hero.particles.material.dispose(); }
      if (_hero.renderer) _hero.renderer.dispose();
    } catch (e) {}
    var stage = document.getElementById('heroFx');
    if (stage) stage.classList.remove('webgl-live');
    _hero = { raf: 0, running: false, inView: true, built: false, renderer: null, scene: null,
      camera: null, pivot: null, spinner: null, mesh: null, rim: null, particles: null,
      geo: null, mat: null, t: 0, tx: 0, ty: 0, io: null };
  }

  // Wait for THREE (it loads `defer`); poll briefly, else keep CSS fallback.
  function _startHeroWhenReady(triesLeft) {
    if (!document.body.classList.contains('fx-on')) return;
    if (window.THREE) { startHero(); return; }
    if (triesLeft <= 0) return; // CSS fallback drop stays
    setTimeout(function () { _startHeroWhenReady(triesLeft - 1); }, 120);
  }

  // ────────────────────────────────────────────────────────────────
  // Public toggle (Settings item) + full apply
  // ────────────────────────────────────────────────────────────────
  function applyFx() {
    var on = _applyMode();
    if (on) {
      _bindTilt();
      _tagReveals(document);
      _startHeroWhenReady(25);   // ~3s budget for THREE to arrive
    } else {
      _clearReveals();
      destroyHero();
    }
  }

  window.toggleFx = function () {
    try {
      if (localStorage.getItem('fx_on') === '1') localStorage.removeItem('fx_on');
      else localStorage.setItem('fx_on', '1');
    } catch (e) {}
    applyFx();
  };

  // Re-tag reveals after page switches (catches async-rendered content too).
  if (typeof window.appSwitchPage === 'function') {
    var _origASP = window.appSwitchPage;
    window.appSwitchPage = function () {
      var r = _origASP.apply(this, arguments);
      if (document.body.classList.contains('fx-on')) {
        setTimeout(function () { _tagReveals(document); }, 80);
        setTimeout(function () { _tagReveals(document); }, 600);
      }
      return r;
    };
  }

  // ────────────────────────────────────────────────────────────────
  // Boot
  // ────────────────────────────────────────────────────────────────
  function _boot() { try { applyFx(); } catch (e) { /* never break the app */ } }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', _boot);
  else _boot();
})();
