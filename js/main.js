(function () {
  "use strict";
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var fine = window.matchMedia("(pointer: fine)").matches;
  var hasGsap = typeof window.gsap !== "undefined" && typeof window.ScrollTrigger !== "undefined";
  // После перезагрузки начинаем сверху: браузер иначе восстанавливает старую позицию до того,
  // как JS посчитает высоты липких секций, и страницу дёргает
  if ("scrollRestoration" in history) history.scrollRestoration = "manual";
  if (!location.hash) {
    window.scrollTo(0, 0);
    window.addEventListener("load", function () { window.scrollTo(0, 0); });
  }
  if (hasGsap) {
    gsap.registerPlugin(ScrollTrigger);
    // На телефоне при прокрутке прячется адресная строка и меняется высота окна: полный пересчёт сцен тут не нужен
    ScrollTrigger.config({ ignoreMobileResize: true });
  }
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var state = { dilate: 0, scrollVel: 0 };

  // Пересчёты раскладки нужны только при смене ширины: высота на телефоне меняется от адресной строки,
  // а раскладка от этого не меняется
  var widthFns = [], lastW = innerWidth;
  function onWidth(fn) { widthFns.push(fn); }
  window.addEventListener("resize", function () {
    if (innerWidth === lastW) return;
    lastW = innerWidth;
    widthFns.forEach(function (fn) { fn(); });
  });

  // Что сейчас на экране: покадровые анимации считаются только для видимых блоков, а CSS-анимации
  // в блоках за экраном стоят на паузе (класс is-off)
  var seen = new WeakMap();
  var io = window.IntersectionObserver ? new IntersectionObserver(function (en) {
    en.forEach(function (e) { seen.set(e.target, e.isIntersecting); e.target.classList.toggle("is-off", !e.isIntersecting); });
  }, { rootMargin: "80px 0px" }) : null;
  function watch(el) { if (el && io) io.observe(el); return el; }
  function onScreen(el) { return !io || seen.get(el) !== false; }

  /* ---------- Плавный скролл ---------- */
  var lenis = null;
  // Только для мыши и тачпада: на сенсорном экране родная прокрутка плавнее и не нагружает JS
  if (!reduce && fine && typeof window.Lenis === "function") {
    try {
      lenis = new Lenis({ lerp: 0.1, smoothWheel: true });
      if (hasGsap) {
        lenis.on("scroll", ScrollTrigger.update);
        gsap.ticker.add(function (t) { lenis.raf(t * 1000); });
        gsap.ticker.lagSmoothing(0);
      } else {
        var lr = function (t) { lenis.raf(t); requestAnimationFrame(lr); };
        requestAnimationFrame(lr);
      }
      lenis.on("scroll", function (e) { state.scrollVel = e.velocity || 0; });
    } catch (err) { lenis = null; }
  }

  /* ---------- Меню на телефоне ---------- */
  var header = $("#siteHeader"), menuBtn = $("#menuBtn");
  function setMenu(open) {
    header.classList.toggle("menu-open", open);
    menuBtn.setAttribute("aria-expanded", open ? "true" : "false");
    $("span", menuBtn).textContent = open ? "Закрыть" : "Меню";
    document.documentElement.style.overflow = open ? "hidden" : "";
    if (lenis) { if (open) lenis.stop(); else lenis.start(); }
  }
  menuBtn.addEventListener("click", function () { setMenu(!header.classList.contains("menu-open")); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") setMenu(false); });

  $$('a[href^="#"]').forEach(function (a) {
    a.addEventListener("click", function (e) {
      var id = a.getAttribute("href");
      var t = id.length > 1 ? document.querySelector(id) : null;
      if (!t) return;
      e.preventDefault();
      setMenu(false);
      if (lenis) lenis.scrollTo(t, { duration: 1.4 });
      else t.scrollIntoView({ behavior: reduce ? "auto" : "smooth" });
    });
  });

  /* ---------- Прогресс сверху ---------- */
  // Высота страницы кешируется: чтение scrollHeight на каждом событии прокрутки заставляло браузер
  // пересчитывать раскладку посреди кадра
  var bar = $("#progressBar");
  var lastY = window.scrollY, maxScroll = 1;
  function onScroll() {
    var p = Math.min(1, window.scrollY / maxScroll);
    bar.style.transform = "scaleX(" + p.toFixed(4) + ")";
    if (!lenis) { state.scrollVel = window.scrollY - lastY; lastY = window.scrollY; }
  }
  function measureMax() { maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight); onScroll(); }
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", measureMax);
  window.addEventListener("load", measureMax);
  if (hasGsap) ScrollTrigger.addEventListener("refresh", measureMax);
  measureMax();

  /* ---------- Курсор и позиции ---------- */
  var pointer = { x: innerWidth / 2, y: innerHeight / 2, last: 0 };
  var trackPointer = function (e) { pointer.x = e.clientX; pointer.y = e.clientY; pointer.last = performance.now(); };
  window.addEventListener("pointermove", trackPointer, { passive: true });
  window.addEventListener("pointerdown", trackPointer, { passive: true });

  // Позиции элементов в документе кешируются и пересчитываются только при ресайзе и refresh ScrollTrigger.
  // Так в каждом кадре нет чтения раскладки (getBoundingClientRect), и скролл не подтормаживает
  var rectCache = new Map();
  function resetRects() { rectCache.clear(); }
  function rectOf(el) {
    var c = rectCache.get(el), sy = window.scrollY;
    if (!c) { var b = el.getBoundingClientRect(); c = { top: b.top + sy, left: b.left, width: b.width, height: b.height }; rectCache.set(el, c); }
    var top = c.top - sy;
    return { top: top, bottom: top + c.height, left: c.left, width: c.width, height: c.height };
  }
  onWidth(resetRects);
  window.addEventListener("load", resetRects);
  if (hasGsap) ScrollTrigger.addEventListener("refresh", resetRects);

  /* ---------- Зрачок в букве D ---------- */
  // Фигуры с логотипа лежат символами sh-* в спрайте в начале body
  var SHAPES = ["sh-eye", "sh-ring", "sh-big", "sh-cut", "sh-circle", "sh-tri", "sh-halfL", "sh-dot", "sh-halfR"];
  function makeEye(box, pupil, o) {
    var cur = { x: 0, y: 0 }, tgt = { x: 0, y: 0 }, wanderAt = 0;
    var fx = o.fx == null ? 0.5 : o.fx, fy = o.fy == null ? 0.5 : o.fy, last = "";
    function put() {
      var v = (o.cx + cur.x * o.rx).toFixed(1) + " " + (o.cy + cur.y * o.ry).toFixed(1);
      if (v !== last) { last = v; pupil.setAttribute("transform", "translate(" + v + ")"); }
    }
    put();
    return function (now, dt) {
      if (!onScreen(box)) return;
      var r = rectOf(box);
      if (r.bottom < 0 || r.top > innerHeight) return;
      if (now - pointer.last < 2600) {
        var dx = pointer.x - (r.left + r.width * fx), dy = pointer.y - (r.top + r.height * fy);
        var len = Math.hypot(dx, dy) || 1, k = Math.min(1, len / 320);
        tgt.x = dx / len * k; tgt.y = dy / len * k;
      } else if (!reduce && now > wanderAt) {
        var a = Math.random() * Math.PI * 2, m = 0.3 + Math.random() * 0.7;
        tgt.x = Math.cos(a) * m; tgt.y = Math.sin(a) * m;
        wanderAt = now + 900 + Math.random() * 1800;
      }
      var f = 1 - Math.pow(0.002, dt);
      cur.x += (tgt.x - cur.x) * f; cur.y += (tgt.y - cur.y) * f;
      put();
    };
  }
  // Моргание: фигура сплющивается по вертикали, onClosed срабатывает, пока «веко» закрыто
  function blinks(el, onClosed, min, spread) {
    (function next() {
      setTimeout(function () {
        el.classList.add("blink");
        setTimeout(function () { if (onClosed) onClosed(); el.classList.remove("blink"); next(); }, 110);
      }, min + Math.random() * spread);
    })();
  }
  var eyes = [];
  var dShape = $("#dShape");
  if (dShape) {
    eyes.push(makeEye(watch($(".party-wm")), $("#dPupil"), { cx: 206, cy: 178, rx: 7, ry: 64, fx: 206 / 750, fy: 178 / 363 }));
    var si = 0;
    var swap = function () { si = (si + 1) % SHAPES.length; dShape.setAttribute("href", "#" + SHAPES[si]); };
    if (!reduce) blinks(dShape, swap, 1800, 1400);
  }

  /* ---------- Гигантский 3D-глаз (как в первой версии) ---------- */
  // Шар с шейдером: белок с красными прожилками, лаймовая радужка, зрачок расширяется над ссылками.
  // Глаз следит за курсором (на телефоне блуждает сам), моргает, иногда «сбоит» в красный. Вокруг лаймовая пыль.
  // Рисуется на чистом WebGL без three.js (библиотека весила около 600 КБ, и на телефоне вместо глаза долго висела
  // заглушка): на весь холст один прямоугольник, шейдер для каждого пикселя пускает луч из камеры и находит точку на шаре
  var PREC = "#ifdef GL_FRAGMENT_PRECISION_HIGH\nprecision highp float;\n#else\nprecision mediump float;\n#endif\n";
  var VS = "attribute vec2 aPos; varying vec2 vNdc; void main(){ vNdc = aPos; gl_Position = vec4(aPos, 0.0, 1.0); }";
  var FS = PREC + [
    "uniform float uTime; uniform float uBlink; uniform float uDilate; uniform vec3 uAcid;",
    "uniform vec2 uTan; uniform vec3 uCenter; uniform float uR; uniform float uPx; uniform mat3 uRot;",
    "varying vec2 vNdc;",
    "float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }",
    "float noise(vec2 p){ vec2 i = floor(p); vec2 f = fract(p); vec2 u = f*f*(3.0-2.0*f);",
    "  return mix(mix(hash(i), hash(i+vec2(1.0,0.0)), u.x), mix(hash(i+vec2(0.0,1.0)), hash(i+vec2(1.0,1.0)), u.x), u.y); }",
    "float fbm(vec2 p){ float v = 0.0; float a = 0.5; for(int i=0;i<4;i++){ v += a*noise(p); p *= 2.03; a *= 0.5; } return v; }",
    "void main(){",
    // Луч из камеры (она в начале координат и смотрит вдоль -z); край шара сглажен на ширину пикселя
    "  vec3 D = normalize(vec3(vNdc * uTan, -1.0));",
    "  float b = dot(D, uCenter);",
    "  float h2 = dot(uCenter, uCenter) - b * b;",
    "  float cover = clamp((uR - sqrt(max(h2, 0.0))) / uPx + 0.5, 0.0, 1.0);",
    "  if (cover <= 0.0) { gl_FragColor = vec4(0.0); return; }",
    "  vec3 P = D * (b - sqrt(max(uR * uR - h2, 0.0)));",
    "  vec3 N = normalize(P - uCenter);",
    "  vec3 d = N * uRot;",
    "  float ang = acos(clamp(d.z, -1.0, 1.0));",
    "  float phi = atan(d.y, d.x);",
    "  vec2 polar = vec2(cos(phi), sin(phi));",
    "  vec3 sclera = vec3(0.88, 0.86, 0.82);",
    "  float v1 = fbm(vec2(d.x*2.6 + d.z*1.3, d.y*2.6 - d.z*0.7) + 4.0);",
    "  float v2 = fbm(vec2(d.x*5.0 - d.z, d.y*5.0 + d.z*1.9) + 11.0);",
    "  float vein = smoothstep(0.024, 0.0, abs(v1 - 0.5)) + 0.7*smoothstep(0.016, 0.0, abs(v2 - 0.5));",
    "  vein *= smoothstep(0.55, 1.35, ang);",
    "  sclera = mix(sclera, vec3(0.66, 0.04, 0.05), clamp(vein, 0.0, 1.0) * 0.9);",
    "  sclera *= mix(1.0, 0.55, smoothstep(0.9, 2.4, ang));",
    "  float irisR = 0.43;",
    "  float pupilR = 0.12 + 0.09 * uDilate;",
    "  float st = noise(polar * 14.0 + vec2(ang * 3.0, uTime * 0.05));",
    "  float st2 = noise(polar * 34.0 + vec2(ang * 1.5, 0.0));",
    "  vec3 iris = uAcid * (0.45 + 0.75 * st) * (0.7 + 0.4 * st2);",
    "  iris += vec3(1.0, 0.95, 0.4) * (1.0 - smoothstep(pupilR, pupilR + 0.12, ang)) * 0.2;",
    "  iris = mix(iris, vec3(0.01, 0.04, 0.0), smoothstep(irisR - 0.1, irisR, ang) * 0.9);",
    "  vec3 col = mix(sclera, iris, 1.0 - smoothstep(irisR - 0.012, irisR + 0.012, ang));",
    "  col = mix(col, vec3(0.0), 1.0 - smoothstep(pupilR - 0.012, pupilR + 0.012, ang));",
    "  vec3 n = N;",
    "  vec3 V = -D;",
    "  vec3 L = normalize(vec3(-0.45, 0.6, 0.75));",
    "  col *= 0.5 + 0.5 * max(dot(n, L), 0.0);",
    "  vec3 H = normalize(L + V);",
    "  col += vec3(1.0) * pow(max(dot(n, H), 0.0), 140.0) * 0.85;",
    "  float fres = pow(1.0 - max(dot(n, V), 0.0), 2.2);",
    "  col = mix(col, vec3(0.02, 0.0, 0.0), fres * 0.75);",
    "  col += vec3(0.86, 0.17, 0.11) * fres * 0.35;",
    "  float open = mix(1.06, -0.02, uBlink);",
    "  float e = abs(N.y);",
    "  float lid = smoothstep(open - 0.015, open + 0.015, e);",
    "  float lidLine = smoothstep(0.04, 0.0, abs(e - open)) * smoothstep(0.02, 0.15, uBlink);",
    "  col = mix(col, vec3(0.03, 0.02, 0.02), lid);",
    "  col += uAcid * lidLine * 0.8;",
    "  gl_FragColor = vec4(col * cover, cover);",
    "}"
  ].join("\n");
  // Пыль: точки поднимаются вверх и по кругу возвращаются вниз, всё считается в шейдере
  var DVS = [
    "attribute vec4 aP;",
    "uniform float uTime; uniform float uRotY; uniform vec2 uF; uniform float uSize; uniform float uSplit; uniform float uFront;",
    "void main(){",
    "  float y = mod(aP.y + aP.w * uTime * 0.25 + 3.4, 6.8) - 3.4;",
    "  float c = cos(uRotY); float s = sin(uRotY);",
    "  vec3 p = vec3(c * aP.x + s * aP.z, y, c * aP.z - s * aP.x);",
    "  float z = p.z - 6.0;",
    "  gl_Position = vec4(p.x * uF.x, p.y * uF.y, 0.0, -z);",
    "  if (abs(step(uSplit, p.z) - uFront) > 0.5) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);",
    "  gl_PointSize = max(1.0, uSize / -z);",
    "}"
  ].join("\n");
  var DFS = PREC + "uniform vec3 uAcid; void main(){ vec2 q = gl_PointCoord - 0.5; if (dot(q, q) > 0.25) discard; gl_FragColor = vec4(uAcid * 0.5, 0.5); }";

  // Нарисованный CSS-глаз .eye-fallback только запасной: он виден, если WebGL недоступен или система отняла его.
  // Если WebGL есть, у .party сразу класс eye-gl и CSS-глаз скрыт, поэтому на любом устройстве один и тот же 3D-глаз
  var party = $(".party"), eyeCanvas = $("#eye3d");
  var phone = window.matchMedia("(max-width: 899px)").matches;
  var cssEye = (function () {
    var box = $(".eye-fallback"), ball = $("#efBall"), iris = $("#efIris");
    if (!box || !ball || !iris) return null;
    var cur = { x: 0, y: 0 }, tgt = { x: 0, y: 0 }, wanderAt = 0, on = true;
    if (!reduce) blinks(ball, null, 2400, 3600);
    return {
      set: function (v) { on = v; },
      frame: function (now, dt) {
        if (!on) return;
        var r = rectOf(box);
        if (r.bottom < 0 || r.top > innerHeight) return;
        if (now - pointer.last < 2600) {
          var dx = pointer.x - (r.left + r.width / 2), dy = pointer.y - (r.top + r.height / 2);
          var len = Math.hypot(dx, dy) || 1, k = Math.min(1, len / 360);
          tgt.x = dx / len * k; tgt.y = dy / len * k;
        } else if (!reduce && now > wanderAt) {
          var a = Math.random() * Math.PI * 2, m = 0.3 + Math.random() * 0.6;
          tgt.x = Math.cos(a) * m; tgt.y = Math.sin(a) * m * 0.7;
          wanderAt = now + 900 + Math.random() * 1800;
        }
        var f = 1 - Math.pow(0.002, dt);
        cur.x += (tgt.x - cur.x) * f; cur.y += (tgt.y - cur.y) * f;
        // Радужка уходит к краю и немного сплющивается, как на шаре
        iris.style.transform = "translate(" + (cur.x * 58).toFixed(1) + "%," + (cur.y * 58).toFixed(1) + "%) scale(" +
          (1 - Math.abs(cur.x) * 0.14).toFixed(3) + "," + (1 - Math.abs(cur.y) * 0.14).toFixed(3) + ")";
      }
    };
  })();
  if (cssEye) eyes.push(cssEye.frame);

  // На телефоне глаз стоит в одном ряду с логотипом FIDELITY, поэтому верх глаза берём из положения заголовка
  // (offsetTop не учитывает анимацию появления)
  var partyTitle = $(".party-title");
  function placeEye() {
    if (!party || !partyTitle) return;
    if (innerWidth >= 900) { party.style.removeProperty("--eye-y"); return; }
    var y = 0, el = partyTitle;
    while (el && el !== party) { y += el.offsetTop; el = el.offsetParent; }
    party.style.setProperty("--eye-y", y + "px");
    resetRects();
  }
  placeEye();
  onWidth(placeEye);
  if (window.ResizeObserver && partyTitle) new ResizeObserver(placeEye).observe(partyTitle.parentNode);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(placeEye);

  function initEye() {
    var canvas = eyeCanvas, gl = null;
    var opts = { alpha: true, antialias: false, premultipliedAlpha: true, depth: false, powerPreference: "high-performance" };
    try { gl = canvas.getContext("webgl", opts) || canvas.getContext("experimental-webgl", opts); } catch (err) { gl = null; }
    if (!gl) return false;

    // Пыль: x, высота, глубина, скорость. На телефоне меньше
    var N = phone ? 110 : 280, dustData = new Float32Array(N * 4);
    for (var i = 0; i < N; i++) {
      dustData[i * 4] = (Math.random() - 0.5) * 11;
      dustData[i * 4 + 1] = (Math.random() - 0.5) * 6.5;
      dustData[i * 4 + 2] = (Math.random() - 0.5) * 4 - 1;
      dustData[i * 4 + 3] = 0.08 + Math.random() * 0.25;
    }
    var prog, dprog, quad, dbuf, aPos, aP, U = {}, DU = {};
    function compile(type, src) {
      var sh = gl.createShader(type); gl.shaderSource(sh, src); gl.compileShader(sh);
      return gl.getShaderParameter(sh, gl.COMPILE_STATUS) ? sh : null;
    }
    function link(vs, fs) {
      var a = compile(gl.VERTEX_SHADER, vs), b = compile(gl.FRAGMENT_SHADER, fs);
      if (!a || !b) return null;
      var p = gl.createProgram(); gl.attachShader(p, a); gl.attachShader(p, b); gl.linkProgram(p);
      return gl.getProgramParameter(p, gl.LINK_STATUS) ? p : null;
    }
    function setup() {
      prog = link(VS, FS); dprog = link(DVS, DFS);
      if (!prog || !dprog) return false;
      "uTime uBlink uDilate uAcid uTan uCenter uR uPx uRot".split(" ").forEach(function (k) { U[k] = gl.getUniformLocation(prog, k); });
      "uTime uRotY uF uSize uSplit uFront uAcid".split(" ").forEach(function (k) { DU[k] = gl.getUniformLocation(dprog, k); });
      aPos = gl.getAttribLocation(prog, "aPos"); aP = gl.getAttribLocation(dprog, "aP");
      quad = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, quad);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      dbuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, dbuf);
      gl.bufferData(gl.ARRAY_BUFFER, dustData, gl.STATIC_DRAW);
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      return true;
    }
    if (!setup()) return false;

    // Камера как была в three.js: угол обзора 30°, глаз в 6 единицах от неё.
    // На компьютере глаз справа целиком (диаметр около 62% высоты экрана), на телефоне холст квадратный
    // справа от FIDELITY и глаз заполняет его. CSS-глаз .eye-fallback стоит в тех же координатах
    var TAN = Math.tan(15 * Math.PI / 180), aspect = 1, ex = 0, ey = 0, R = 1, px = 0.01, f2 = [1, 1];
    function layout() {
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      var W = Math.max(1, canvas.clientWidth), H = Math.max(1, canvas.clientHeight);
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      aspect = W / H;
      var halfH = TAN * 6, halfW = halfH * aspect;
      if (innerWidth < 900) { R = Math.min(halfW, halfH) * 0.92; ex = 0; ey = 0; }
      else { R = Math.min(halfH * 0.62, halfW * 0.36); ex = halfW * 0.58; ey = 0.08; }
      px = 2 * TAN / canvas.height * Math.sqrt(ex * ex + ey * ey + 36);
      f2 = [1 / (TAN * aspect), 1 / TAN];
      resetRects();
    }
    layout();
    if (window.ResizeObserver) new ResizeObserver(layout).observe(canvas);
    else window.addEventListener("resize", layout);

    // Если система отняла WebGL (бывает на телефонах в фоне), показываем CSS-глаз, пока контекст не вернут
    var lost = false, shown = false;
    canvas.addEventListener("webglcontextlost", function (e) {
      e.preventDefault(); lost = true; party.classList.remove("eye-gl", "eye-ready"); if (cssEye) cssEye.set(true);
    });
    canvas.addEventListener("webglcontextrestored", function () {
      if (!setup()) return;
      layout(); lost = false; shown = false; party.classList.add("eye-gl"); if (cssEye) cssEye.set(false);
    });

    var visible = true;
    if (window.IntersectionObserver) new IntersectionObserver(function (en) { visible = en[0].isIntersecting; }).observe(party);

    var rot = { x: 0, y: 0 }, target = { x: 0, y: 0 }, wanderAt = 0, dilate = 0, blink = 0;
    var blinkAt = performance.now() + 2500, blinkStart = -1, glitchAt = performance.now() + 6000;
    var t0 = performance.now(), prev = t0, m = new Float32Array(9);

    function dust(t, front) {
      gl.useProgram(dprog);
      gl.uniform1f(DU.uTime, reduce ? 0 : t); gl.uniform1f(DU.uRotY, rot.y * 0.15);
      gl.uniform2f(DU.uF, f2[0], f2[1]); gl.uniform1f(DU.uSize, 0.026 * canvas.height * 0.5);
      gl.uniform1f(DU.uSplit, R); gl.uniform1f(DU.uFront, front); gl.uniform3f(DU.uAcid, 0.694, 0.859, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, dbuf);
      gl.enableVertexAttribArray(aP); gl.vertexAttribPointer(aP, 4, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.POINTS, 0, N);
    }

    function frame(now) {
      requestAnimationFrame(frame);
      var dt = Math.min(0.05, (now - prev) / 1000); prev = now;
      if (!visible || document.hidden || lost) return;
      var t = (now - t0) / 1000;

      // Взгляд: за курсором или пальцем, без них блуждает сам
      var rect = rectOf(canvas);
      if (now - pointer.last < 2600) {
        var halfH = TAN * 6, cxN = ex / (halfH * aspect), cyN = ey / halfH;
        var mx = ((pointer.x - rect.left) / rect.width) * 2 - 1;
        var my = -(((pointer.y - rect.top) / rect.height) * 2 - 1);
        target.y = Math.max(-0.95, Math.min(0.95, (mx - cxN) * aspect * 0.5));
        target.x = Math.max(-0.75, Math.min(0.75, -(my - cyN) * 0.5));
      } else if (!reduce && now > wanderAt) {
        target.y = (Math.random() - 0.5) * 1.1;
        target.x = (Math.random() - 0.5) * 0.7;
        wanderAt = now + 900 + Math.random() * 1800;
      }
      var k = 1 - Math.pow(0.0008, dt);
      rot.x += (target.x - rot.x) * k;
      rot.y += (target.y - rot.y) * k;
      // Без микродрожания: заказчику казалось, что глаз постоянно трясётся
      var ax = rot.x, ay = rot.y;
      dilate += (state.dilate - dilate) * Math.min(1, dt * 6);

      if (!reduce) {
        if (blinkStart < 0 && now > blinkAt) blinkStart = now;
        if (blinkStart >= 0) {
          var bt = (now - blinkStart) / 1000;
          blink = bt < 0.08 ? bt / 0.08 : Math.max(0, 1 - (bt - 0.08) / 0.12);
          if (bt > 0.2) { blinkStart = -1; blink = 0; blinkAt = now + 2200 + Math.random() * 4200; }
        }
        if (now > glitchAt) {
          canvas.classList.add("glitch");
          setTimeout(function () { canvas.classList.remove("glitch"); }, 140);
          glitchAt = now + 5000 + Math.random() * 6000;
        }
      }

      // Поворот шара: сначала вокруг x, потом вокруг y (как Euler XYZ в three.js), матрица по столбцам
      var ca = Math.cos(ax), sa = Math.sin(ax), cb = Math.cos(ay), sb = Math.sin(ay);
      m[0] = cb; m[1] = sa * sb; m[2] = -ca * sb; m[3] = 0; m[4] = ca; m[5] = sa; m[6] = sb; m[7] = -sa * cb; m[8] = ca * cb;

      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      dust(t, 0);
      gl.useProgram(prog);
      gl.uniform1f(U.uTime, t); gl.uniform1f(U.uBlink, blink); gl.uniform1f(U.uDilate, dilate);
      gl.uniform3f(U.uAcid, 0.694, 0.859, 0);
      gl.uniform2f(U.uTan, TAN * aspect, TAN); gl.uniform3f(U.uCenter, ex, ey, -6);
      gl.uniform1f(U.uR, R); gl.uniform1f(U.uPx, px); gl.uniformMatrix3fv(U.uRot, false, m);
      gl.bindBuffer(gl.ARRAY_BUFFER, quad);
      gl.enableVertexAttribArray(aPos); gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      dust(t, 1);

      if (!shown) { shown = true; party.classList.add("eye-ready"); }
    }
    requestAnimationFrame(frame);
    return true;
  }
  // WebGL есть: CSS-глаз сразу прячем, 3D-глаз проявляется с первым кадром
  if (party && eyeCanvas && initEye()) {
    party.classList.add("eye-gl");
    if (cssEye) cssEye.set(false);
  }

  /* ---------- Курсор-треугольник, магнит ---------- */
  var cur = { x: innerWidth / 2, y: innerHeight / 2 };
  var cursor = null;
  if (fine && !reduce) {
    document.documentElement.classList.add("has-cursor");
    cursor = document.createElement("div"); cursor.className = "cur"; cursor.setAttribute("aria-hidden", "true");
    cursor.innerHTML = '<svg class="c-tri" viewBox="0 0 32 32" fill="currentColor"><use href="#sh-tri" width="32" height="32"/></svg>';
    document.body.appendChild(cursor);
    window.addEventListener("pointerdown", function () { cursor.classList.add("down"); });
    window.addEventListener("pointerup", function () { cursor.classList.remove("down"); });
  }
  window.addEventListener("pointermove", function (e) { cur.x = e.clientX; cur.y = e.clientY; }, { passive: true });
  document.addEventListener("pointerover", function (e) {
    var t = e.target.closest ? e.target : null;
    var hov = t && t.closest("a,button");
    state.dilate = hov ? 1 : 0;
    if (cursor && t) {
      cursor.classList.toggle("is-hover", !!hov);
      // Над полями формы виден обычный текстовый курсор, треугольник прячется
      cursor.classList.toggle("is-text", !!t.closest("input,textarea"));
      // На первом экране красный; над лаймовым чёрный, а на чёрных карточках проектов снова лаймовый
      cursor.classList.toggle("red", !!t.closest(".party,.invite"));
      cursor.classList.toggle("on-acid", !!(t.closest(".btn,.marquee") || (t.closest(".projects") && !t.closest(".proj"))));
    }
  });
  if (fine && !reduce) {
    $$(".magnetic").forEach(function (m) {
      m.addEventListener("pointermove", function (e) {
        var r = m.getBoundingClientRect();
        var dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
        m.style.transform = "translate(" + dx * 0.2 + "px," + dy * 0.3 + "px)";
      });
      m.addEventListener("pointerleave", function () { m.style.transform = ""; });
    });
  }

  /* ---------- Заявка: всплывающая форма ---------- */
  // Адрес веб-приложения Google Apps Script (apps-script/leads), которое пишет заявки в таблицу
  // «Fidelity: заявки с сайта» (подключено 28.10.2026). Если адрес пустой, форма только показывает «Заявка у нас»
  // и ничего не отправляет (так собирается версия для Artifact). Если запрос не прошёл, под кнопкой появляется ошибка
  var LEADS_ENDPOINT = "https://script.google.com/macros/s/AKfycbwPLPB0e_UFg58zN42DNWq71WqOPpIgtJsV0_G8b17fid6tAG2Adm6Q4keNdqiLjaR3sw/exec";
  var lead = $("#lead");
  if (lead) (function () {
    var panel = $(".lead-panel", lead), form = $("#leadForm"), submit = $(".lead-submit", lead), submitText = $(".ls-text", lead);
    var sendErr = $("#leadSendErr"), steps = {};
    $$(".lead-step", lead).forEach(function (st) { steps[st.getAttribute("data-step")] = st; });
    var opener = null, closing = 0, settle = 0, sending = false, done = false, tried = false;
    var page = [$("main"), $(".site-header")];

    function showStep(name, base) {
      Object.keys(steps).forEach(function (k) { steps[k].hidden = k !== name; steps[k].classList.remove("is-in"); });
      var st = steps[name];
      $$(".lr", st).forEach(function (el, i) { el.style.setProperty("--i", i); });
      st.style.setProperty("--b", base + "s");
      void st.offsetWidth;
      st.classList.add("is-in");
      panel.scrollTop = 0;
    }
    function setPage(off) { page.forEach(function (el) { if (el) el.inert = off; }); }

    function open(e) {
      if (e) e.preventDefault();
      if (!lead.hidden && !closing) return;
      clearTimeout(closing); closing = 0;
      opener = document.activeElement;
      lead.hidden = false;
      lead.classList.remove("is-closing", "is-settled", "is-open");
      document.documentElement.classList.add("lead-open");
      if (lenis) lenis.stop();
      setPage(true);
      showStep("form", reduce ? 0 : 0.55);
      void lead.offsetWidth;
      lead.classList.add("is-open");
      panel.focus({ preventScroll: true });
      // Когда веко раскрылось, clip-path снимаем: окно скроллится без лишней обрезки
      settle = setTimeout(function () { lead.classList.add("is-settled"); }, reduce ? 50 : 1200);
    }
    function close() {
      if (lead.hidden || closing) return;
      clearTimeout(settle);
      lead.classList.remove("is-settled");
      void panel.offsetWidth;
      lead.classList.remove("is-open");
      lead.classList.add("is-closing");
      closing = setTimeout(function () {
        closing = 0;
        lead.hidden = true;
        lead.classList.remove("is-closing");
        document.documentElement.classList.remove("lead-open");
        if (lenis) lenis.start();
        setPage(false);
        if (opener && opener.focus) opener.focus({ preventScroll: true });
        if (done) { form.reset(); clearErrors(); sendErr.textContent = ""; tried = false; done = false; }
      }, reduce ? 200 : 700);
    }
    $$("[data-lead]").forEach(function (b) { b.addEventListener("click", open); });
    lead.addEventListener("click", function (e) { if (e.target.closest("[data-lead-close]")) close(); });
    document.addEventListener("keydown", function (e) {
      if (lead.hidden || closing) return;
      if (e.key === "Escape") { e.preventDefault(); close(); return; }
      if (e.key !== "Tab") return;
      // Фокус не уходит из окна
      var f = $$("a[href],button:not([disabled]),input:not([tabindex='-1']),textarea", panel).filter(function (el) { return !el.closest("[hidden]"); });
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1], act = document.activeElement;
      if (e.shiftKey && (act === first || act === panel)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && act === last) { e.preventDefault(); first.focus(); }
    });

    // Телефон: +998 XX XXX XX XX, иностранный номер начинается с «+»
    function formatPhone(v) {
      var intl = /^\s*\+/.test(v), d = v.replace(/\D/g, "");
      if (!d) return intl ? "+" : "";
      if (intl && d.indexOf("998") !== 0) return "+" + d.slice(0, 15);
      if (d.indexOf("998") !== 0) d = "998" + d;
      var p = d.slice(3, 12), out = "+998";
      if (p) out += " " + p.slice(0, 2);
      if (p.length > 2) out += " " + p.slice(2, 5);
      if (p.length > 5) out += " " + p.slice(5, 7);
      if (p.length > 7) out += " " + p.slice(7, 9);
      return out;
    }
    var phone = form.elements.phone;
    phone.addEventListener("focus", function () { if (!phone.value) phone.value = "+998 "; });
    phone.addEventListener("blur", function () { phone.value = /^\+?(998)?\s*$/.test(phone.value) ? "" : formatPhone(phone.value); });
    phone.addEventListener("input", function () { if (phone.selectionStart === phone.value.length) phone.value = formatPhone(phone.value); });

    function collect() {
      var el = form.elements;
      return {
        name: el.name.value.trim(), company: el.company.value.trim(), email: el.email.value.trim(),
        phone: formatPhone(el.phone.value), message: el.message.value.trim(),
        pains: $$("input[name=pain]:checked", form).map(function (c) { return c.value; })
      };
    }
    function setErr(name, msg) {
      var field = form.elements[name].closest(".lf-field");
      field.classList.toggle("has-err", !!msg);
      $(".lf-err", field).textContent = msg || "";
    }
    function clearErrors() { ["name", "phone", "company", "email"].forEach(function (n) { setErr(n, ""); }); }
    function validate(d) {
      var digits = d.phone.replace(/\D/g, "");
      var phoneOk = digits.indexOf("998") === 0 ? digits.length === 12 : (d.phone.charAt(0) === "+" && digits.length >= 8 && digits.length <= 15);
      var errs = {
        name: d.name.length < 2 ? "Как к вам обращаться?" : "",
        phone: !digits || digits === "998" ? "Нужен телефон для связи" : phoneOk ? "" : "Проверьте номер: +998 и ещё 9 цифр",
        company: d.company.length < 2 ? "Укажите компанию" : "",
        email: d.email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(d.email) ? "Проверьте адрес почты" : ""
      };
      Object.keys(errs).forEach(function (k) { setErr(k, errs[k]); });
      return !errs.name && !errs.phone && !errs.company && !errs.email;
    }
    // После первой попытки отправить ошибки обновляются сразу при вводе
    form.addEventListener("input", function () { if (tried) validate(collect()); });

    function success(real) {
      done = true;
      showStep("done", 0.05);
      if (!real) return;
      if (window.fbq) window.fbq("track", "Lead");
      (window.dataLayer = window.dataLayer || []).push({ event: "lead_submit" });
    }
    function setSending(on) {
      sending = on; submit.disabled = on;
      submit.classList.toggle("is-sending", on);
      submitText.textContent = on ? "Отправляем…" : "Отправить заявку";
    }

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (sending) return;
      if (form.elements.website.value) { success(false); return; }
      tried = true;
      sendErr.textContent = "";
      var d = collect();
      if (!validate(d)) {
        submit.classList.remove("shake"); void submit.offsetWidth; submit.classList.add("shake");
        var bad = $(".has-err input", form);
        if (bad) bad.focus();
        return;
      }
      setSending(true);
      if (!/^https:\/\//.test(LEADS_ENDPOINT)) {
        console.info("LEADS_ENDPOINT пустой: заявка никуда не отправлена");
        setTimeout(function () { setSending(false); success(false); }, 900);
        return;
      }
      var ctrl = window.AbortController ? new AbortController() : null;
      var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, 15000);
      var body = new URLSearchParams({
        name: d.name, company: d.company, phone: d.phone, email: d.email,
        pains: d.pains.join("; "), message: d.message, page: location.href
      });
      fetch(LEADS_ENDPOINT, { method: "POST", body: body, signal: ctrl ? ctrl.signal : undefined })
        .then(function (r) { if (!r.ok) throw new Error("http"); return r.json(); })
        .then(function (j) { if (!j || j.ok !== true) throw new Error("bad"); success(true); })
        .catch(function () { sendErr.textContent = "Не получилось отправить заявку. Проверьте интернет и попробуйте ещё раз."; })
        .then(function () { clearTimeout(timer); setSending(false); });
    });
  })();

  /* ---------- Место: свет фонарика на фото Nukus 89 ---------- */
  // Фото в полутьме, светлый круг идёт за курсором, когда он над фото, иначе (и на телефоне) медленно бродит сам
  // Каждый сдвиг света перерисовывает градиент, поэтому на телефоне свет обновляется не чаще 20 раз в секунду
  var venueMedia = watch($("#venueMedia"));
  if (venueMedia) {
    var lx = 0.6, ly = 0.42, ltx = lx, lty = ly, lightAt = 0, lightV = "";
    eyes.push(function (now, dt) {
      if (!onScreen(venueMedia)) return;
      var r = rectOf(venueMedia);
      var over = fine && now - pointer.last < 2600 && pointer.x >= r.left && pointer.x <= r.left + r.width && pointer.y >= r.top && pointer.y <= r.bottom;
      if (over) { ltx = (pointer.x - r.left) / r.width; lty = (pointer.y - r.top) / r.height; }
      else if (!reduce) {
        var t = now / 1000;
        ltx = 0.5 + Math.sin(t * 0.29) * 0.26 + Math.sin(t * 0.83) * 0.05;
        lty = 0.44 + Math.sin(t * 0.43 + 1.3) * 0.16;
      }
      var k = 1 - Math.pow(over ? 0.004 : 0.2, dt);
      lx += (ltx - lx) * k; ly += (lty - ly) * k;
      if (!fine && now - lightAt < 50) return;
      var v = (lx * 100).toFixed(1) + "," + (ly * 100).toFixed(1);
      if (v === lightV) return;
      lightAt = now; lightV = v;
      venueMedia.style.setProperty("--lx", (lx * 100).toFixed(1) + "%");
      venueMedia.style.setProperty("--ly", (ly * 100).toFixed(1) + "%");
    });
  }

  /* ---------- Финальный логотип: буква наклоняется под мышью, соседи раздвигаются ---------- */
  // Наклон вокруг центра: верх уходит вправо, низ влево на половину высоты × tg 6°. Соседи справа сдвигаются вправо,
  // слева влево, на сколько не хватает пробела, поэтому буквы не заходят друг на друга.
  // Наведение ловит прозрачный прямоугольник по размеру буквы: он не двигается, поэтому ничего не дрожит
  var letters = $$(".final-wm .fl");
  if (letters.length && fine && window.matchMedia("(hover: hover)").matches) {
    var TILT = Math.tan(6 * Math.PI / 180), boxes = [];
    var lean = function (k) {
      var b = boxes[k], room = k < 0 ? 0 : b.height / 2 * TILT + 8;
      var pushR = k < 0 || k === boxes.length - 1 ? 0 : Math.max(0, room - (boxes[k + 1].x - b.x - b.width));
      var pushL = k <= 0 ? 0 : Math.max(0, room - (b.x - boxes[k - 1].x - boxes[k - 1].width));
      letters.forEach(function (g, i) {
        g.classList.toggle("is-on", i === k);
        g.lastElementChild.style.transform = k < 0 ? "" : i === k ? "translateY(-3%) skewX(-6deg)" :
          "translateX(" + (i > k ? pushR : -pushL).toFixed(1) + "px)";
      });
    };
    letters.forEach(function (g, i) {
      var b = g.firstElementChild.getBBox(), r = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      boxes.push(b);
      r.setAttribute("x", b.x); r.setAttribute("y", b.y); r.setAttribute("width", b.width); r.setAttribute("height", b.height);
      r.setAttribute("fill", "transparent");
      g.insertBefore(r, g.firstChild);
      g.addEventListener("pointerenter", function () { lean(i); });
      g.addEventListener("pointerleave", function () { lean(-1); });
    });
  }

  /* ---------- Оптическое выравнивание крупных заголовков ---------- */
  // У букв в шрифте есть поле слева (у Р и Н в Big Shoulders и Oswald около 0,06 высоты шрифта), и на крупном кегле
  // заголовок визуально стоит правее мелкого текста над ним. Сдвигаем заголовок влево ровно на поле его первой буквы,
  // в em, поэтому сдвиг сам масштабируется с размером шрифта. Только для заголовков, выровненных по левому краю
  var optical = $$(".display, .lead-title, .venue-name, .proj-name, .m-name, .lost-title, .tagline");
  function alignOptical() {
    var ctx = document.createElement("canvas").getContext("2d");
    optical.forEach(function (el) {
      var cs = getComputedStyle(el), ch = (el.textContent || "").trim().charAt(0);
      if (!ch || (cs.textAlign !== "left" && cs.textAlign !== "start")) { el.style.marginLeft = ""; return; }
      if (cs.textTransform === "uppercase") ch = ch.toUpperCase();
      ctx.font = cs.fontWeight + " 100px " + cs.fontFamily;
      var lsb = -ctx.measureText(ch).actualBoundingBoxLeft / 100;
      el.style.marginLeft = lsb > 0.004 ? (-lsb).toFixed(3) + "em" : "";
    });
  }
  if (optical.length && document.fonts && document.fonts.ready) {
    document.fonts.ready.then(alignOptical);
    var oaT = 0;
    onWidth(function () { clearTimeout(oaT); oaT = setTimeout(alignOptical, 150); });
  }

  /* ---------- Покадровый цикл: зрачок в D, паук, курсор, бегущая строка ---------- */
  // Паук и бегущая строка двигаются только на экране. Ширина строки кешируется: чтение scrollWidth в каждом
  // кадре после записи стилей заставляло браузер пересчитывать раскладку 60 раз в секунду
  var spider = $(".spider"), spiderStart = 0, spiderY = 1e9;
  var marquee = $("#marquee"), marqueeWrap = watch($(".marquee-wrap")), mx = 0, mdir = -1, mHalf = 0, prevT = performance.now();
  watch(party); watch($(".invite")); watch($(".sos"));
  function measureMarquee() { mHalf = marquee ? marquee.scrollWidth / 2 : 0; }
  measureMarquee();
  onWidth(measureMarquee);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(measureMarquee);
  (function loop(now) {
    requestAnimationFrame(loop);
    now = now || performance.now();
    var dt = Math.min(0.05, Math.max(0, now - prevT) / 1000); prevT = now;
    eyes.forEach(function (fn) { fn(now, dt); });
    if (spider && onScreen(party)) {
      // Паук спускается после заставки, нить покачивается, при скролле паук уползает вверх.
      // Двигается только transform: нить длиной 400px уходит за верх экрана
      var base = innerWidth < 720 ? 50 : 64, len = base;
      if (!reduce) {
        var d = spiderStart ? Math.min(1, (now - spiderStart) / 1400) : 0;
        var e = d === 1 ? 1 : 1 - Math.pow(2, -9 * d) * Math.cos(d * 9);
        len = -60 + (base + 60) * e + Math.sin(now / 700) * 7 * d - Math.min(base + 40, window.scrollY * 0.35);
      }
      var sy = Math.round((Math.max(-40, len) - 400) * 10) / 10;
      if (sy !== spiderY) { spiderY = sy; spider.style.transform = "translateY(" + sy + "px)"; }
    }
    if (cursor) cursor.style.transform = "translate(" + cur.x + "px," + cur.y + "px)";
    if (marquee && !reduce) {
      var v = state.scrollVel;
      if (Math.abs(v) > 0.4) mdir = v > 0 ? -1 : 1;
      state.scrollVel *= 0.92;
      if (mHalf > 0 && onScreen(marqueeWrap)) {
        mx += mdir * (0.7 + Math.min(14, Math.abs(v) * 0.5));
        if (mx <= -mHalf) mx += mHalf;
        if (mx > 0) mx -= mHalf;
        marquee.style.transform = "translate3d(" + mx.toFixed(1) + "px,0,0)";
      }
    }
  })();

  /* ---------- Сцены на GSAP ---------- */
  function intro() {
    if (!hasGsap || reduce) { spiderStart = performance.now(); return; }
    // Первый экран: буквы логотипа поднимаются, надпись из пригласительного «прописывается» кистью
    gsap.from(".party-wm > use", { yPercent: 18, opacity: 0, duration: 1.1, stagger: 0.07, ease: "power4.out" });
    gsap.fromTo(".party-brush", { clipPath: "inset(0 100% 0 0)" }, { clipPath: "inset(0 0% 0 0)", duration: 1.3, delay: 0.45, ease: "power2.inOut" });
    gsap.from(".tagline, .party .tagline-ru, .party-when", { y: 26, opacity: 0, duration: 1, stagger: 0.1, delay: 0.9, ease: "power3.out" });
    spiderStart = performance.now() + 700;
  }

  // Липкая сцена без pin: секция становится выше содержимого на hold() пикселей, содержимое прилипает (position: sticky),
  // пока идёт этот скролл. Прилипает по центру экрана, а если содержимое выше экрана, то нижним краем.
  // Возвращает start/end для ScrollTrigger и функцию отписки. Без pin нет рывка при входе в блок
  function stickyScene(section, stick, hold) {
    var T = 0;
    function measure() {
      var vh = window.innerHeight, h = stick.offsetHeight;
      T = h <= vh ? Math.round((vh - h) / 2) : Math.round(vh - h);
      section.style.setProperty("--stick-top", T + "px");
      section.style.height = Math.round(h + hold()) + "px";
    }
    measure();
    ScrollTrigger.addEventListener("refreshInit", measure);
    var start = function () { return Math.round(section.getBoundingClientRect().top + window.scrollY - T); };
    return {
      start: start,
      end: function () { return start() + Math.round(hold()); },
      kill: function () {
        ScrollTrigger.removeEventListener("refreshInit", measure);
        section.style.removeProperty("--stick-top"); section.style.height = "";
      }
    };
  }

  function splitWords(el) {
    (function walk(node) {
      Array.prototype.slice.call(node.childNodes).forEach(function (ch) {
        if (ch.nodeType === 3) {
          var frag = document.createDocumentFragment();
          ch.textContent.split(/\s+/).forEach(function (w) {
            if (!w) return;
            var s = document.createElement("span"); s.className = "w"; s.textContent = w; frag.appendChild(s);
          });
          node.replaceChild(frag, ch);
        } else if (ch.nodeType === 1) walk(ch);
      });
    })(el);
  }

  function scenes() {
    var chainFill = $("#chainFill"), links = $$("#chain .link");
    var dots = $$(".final-dots use");
    function paintChain(p) {
      chainFill.style.setProperty("--p", p.toFixed(3));
      links.forEach(function (l, i) { l.classList.toggle("on", p >= i / (links.length - 1) - 0.001); });
    }
    if (!hasGsap || reduce) {
      // Без анимаций всё сразу в конечном состоянии
      paintChain(1);
      dots.forEach(function (d) { d.classList.add("on"); });
      return;
    }

    // Над лаймовым блоком проектов шапка становится чёрной
    ScrollTrigger.create({ trigger: ".projects", start: "top 48px", end: "bottom 48px", toggleClass: { targets: ".site-header", className: "on-acid" }, refreshPriority: -1 });

    // Приглашение: слова проявляются по скроллу
    var lead = $("[data-split]");
    if (lead) {
      splitWords(lead);
      gsap.fromTo(lead.querySelectorAll(".w"), { opacity: 0.15 }, {
        opacity: 1, stagger: 0.05, ease: "none",
        scrollTrigger: { trigger: lead, start: "top 85%", end: "bottom 55%", scrub: true }
      });
    }

    // Место: фото раскрывается из рамки и медленно отъезжает, подпись поднимается
    if ($(".venue")) {
      if (fine) gsap.fromTo(".venue-media", { clipPath: "inset(9% 7% 9% 7%)" }, { clipPath: "inset(0% 0% 0% 0%)", ease: "none", scrollTrigger: { trigger: ".venue", start: "top 95%", end: "top 40%", scrub: true } });
      // На телефоне рамка раскрывается масштабом: его считает видеокарта, а clip-path перерисовывал фото в каждом кадре
      else gsap.fromTo(".venue-media", { scale: 0.86 }, { scale: 1, ease: "none", scrollTrigger: { trigger: ".venue", start: "top 95%", end: "top 40%", scrub: true } });
      gsap.fromTo(".venue-img", { scale: 1.22 }, { scale: 1.02, ease: "none", scrollTrigger: { trigger: ".venue", start: "top bottom", end: "bottom top", scrub: true } });
      gsap.from(".venue-cap > *, .venue-when", { y: 26, opacity: 0, duration: 1, stagger: 0.08, ease: "power3.out", scrollTrigger: { trigger: ".venue", start: "top 62%", once: true } });
    }

    $$("[data-reveal]").forEach(function (el, i) {
      gsap.from(el, { y: 50, opacity: 0.2, duration: 1, ease: "power3.out", delay: (i % 3) * 0.08, scrollTrigger: { trigger: el, start: "top 90%", once: true } });
    });
    $$(".display, .weare-title").forEach(function (el) {
      if (el.closest(".weare-title") && el.classList.contains("display")) return;
      gsap.from(el, { y: 50, opacity: 0.2, duration: 1.1, ease: "power3.out", scrollTrigger: { trigger: el, start: "top 90%", once: true } });
    });

    // You spent a fortune: кольцо «кампании 360°» делает полный оборот и возвращается туда, где начало
    // Крутится отдельный svg целиком: его поворачивает видеокарта, а поворот группы внутри svg
    // перерисовывал текст по кругу в каждом кадре прокрутки
    gsap.to("#loopSpin", {
      rotation: 360, ease: "none",
      scrollTrigger: { trigger: ".fortune", start: "top 75%", end: "bottom 35%", scrub: true }
    });
    gsap.from(".fear", { x: -30, opacity: 0.2, duration: 1, ease: "power3.out", scrollTrigger: { trigger: ".fear", start: "top 88%", once: true } });

    // We are Fidelity: линия связывает исследование, стратегию, креатив и реализацию
    paintChain(0);
    ScrollTrigger.create({ trigger: ".chain-wrap", start: "top 82%", end: "bottom 50%", scrub: true, onUpdate: function (s) { paintChain(s.progress); } });

    var mm = gsap.matchMedia();

    // We do: на компьютере блок прилипает, а лента «монстров» едет вбок со скроллом
    var sosEl = $(".sos");
    mm.add("(min-width: 900px)", function () {
      sosEl.classList.add("pinned");
      var track = $("#sosTrack"), vp = $(".sos-viewport");
      var dist = function () { return Math.max(0, track.scrollWidth - vp.clientWidth); };
      var sc = stickyScene(sosEl, $(".sos-stick"), dist);
      gsap.to(track, { x: function () { return -dist(); }, ease: "none", scrollTrigger: { trigger: sosEl, start: sc.start, end: sc.end, scrub: true, invalidateOnRefresh: true } });
      return function () { sc.kill(); sosEl.classList.remove("pinned"); };
    });

    // Финал: заголовок, кнопка, буквы логотипа поднимаются, фигуры бренда загораются по очереди
    gsap.from(".ending-cols p, .ending-ask, .ending .btn", { y: 30, opacity: 0.2, duration: 0.9, stagger: 0.1, ease: "power3.out", scrollTrigger: { trigger: ".ending-cols", start: "top 88%", once: true } });
    // На телефоне буквы поднимаются один раз: привязка к прокрутке перерисовывала большой svg в каждом кадре
    if (fine) gsap.from(".final-wm .fl", { yPercent: 60, opacity: 0, stagger: 0.06, ease: "none", scrollTrigger: { trigger: ".wordmark", start: "top 95%", end: "top 45%", scrub: true } });
    else gsap.from(".final-wm .fl", { yPercent: 40, opacity: 0, stagger: 0.06, duration: 0.9, ease: "power3.out", scrollTrigger: { trigger: ".wordmark", start: "top 85%", once: true } });
    ScrollTrigger.create({
      trigger: ".wordmark", start: "top 80%", end: "bottom bottom", scrub: true,
      onUpdate: function (s) { dots.forEach(function (d, k) { d.classList.toggle("on", s.progress * dots.length > k + 0.3); }); }
    });
  }

  /* ---------- Прелоадер: фигуры бренда загораются по очереди ---------- */
  function preloader(done) {
    if (reduce) { done(); return; }
    var pl = document.createElement("div");
    pl.className = "preloader";
    pl.setAttribute("aria-hidden", "true");
    var row = [[13, "ring"], [94, "dot"], [176, "circle"], [255, "small"], [331, "halfL"], [411, "big"], [494, "tri"], [576, "eye"], [660, "cut"], [740, "halfR"]];
    var dots = '<svg class="pl-dots" viewBox="-3 -2 760 34" fill="currentColor">' + row.map(function (d) {
      return '<use href="#sh-' + d[1] + '" x="' + (d[0] - 16) + '" y="-1" width="32" height="32"/>';
    }).join("") + "</svg>";
    pl.innerHTML = '<div class="pl-inner"><p class="pl-count">000</p>' + dots + '<p class="cap">Fidelity Halloween Party</p></div>';
    document.body.appendChild(pl);
    if (lenis) lenis.stop();
    var num = pl.querySelector(".pl-count"), lit = $$(".pl-dots use", pl);
    var start = performance.now(), dur = 1200, finished = false;
    function finish() {
      if (finished) return; finished = true;
      pl.classList.add("out");
      done();
      setTimeout(function () { pl.remove(); if (lenis) lenis.start(); if (hasGsap) ScrollTrigger.refresh(); }, 850);
    }
    pl.addEventListener("click", finish);
    setTimeout(finish, dur + 1500); // страховка, если вкладка не рисует кадры
    (function tick(now) {
      if (finished) return;
      var p = Math.min(1, (now - start) / dur), e = 1 - Math.pow(1 - p, 3);
      num.textContent = String(Math.round(e * 100)).padStart(3, "0");
      lit.forEach(function (u, k) { u.classList.toggle("on", e * 10 > k + 0.5); });
      if (p < 1) requestAnimationFrame(tick); else setTimeout(finish, 120);
    })(start);
  }

  scenes();
  preloader(intro);
  if (hasGsap && document.fonts && document.fonts.ready) document.fonts.ready.then(function () { ScrollTrigger.refresh(); });
})();
