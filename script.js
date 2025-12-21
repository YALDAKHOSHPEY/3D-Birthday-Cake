import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import tableMatImage from "./table.png";

// SECTION constants
const candleRadius = 0.35;
const candleHeight = 3.5;
const candleCount = 5;

const baseRadius = 2.5;
const baseHeight = 2;
const middleRadius = 2;
const middleHeight = 1.25;
const topRadius = 1.5;
const topHeight = 1;

const tableHeightOffset = 1;

// Audio detection constants - با حساسیت بیشتر
const BLOW_LOW_FREQ_THRESHOLD = 0.1; // آستانه فرکانس پایین (برای صدای فوت)
const BLOW_HIGH_FREQ_THRESHOLD = 0.05; // آستانه فرکانس بالا (برای نویز محیط)
const BLOW_DURATION = 800; // مدت زمان تشخیص (میلی‌ثانیه)
const BLOW_PEAK_THRESHOLD = 0.15; // آستانه پیک صدا
const MIN_BLOW_INTENSITY = 0.2; // حداقل شدت صدا برای تشخیص فوت
const SMOOTHING_FACTOR = 0.7; // فاکتور هموارسازی برای کاهش نویز

// Smoke constants - تنظیمات بهینه‌شده برای دود طبیعی
const GENTLE_SMOKE_ENABLED = true; // فعال کردن دود آرام
const GENTLE_SMOKE_INTERVAL = 2000; // فاصله بین تولید دود آرام (میلی‌ثانیه) - کاهش یافت
const GENTLE_SMOKE_PARTICLES = 2; // تعداد ذرات دود آرام در هر بار - افزایش یافت
const EXTINGUISH_SMOKE_PARTICLES = 8; // تعداد ذرات دود هنگام خاموش شدن - افزایش یافت
const SMOKE_MIN_SIZE = 3; // حداقل اندازه دود (پیکسل)
const SMOKE_MAX_SIZE = 12; // حداکثر اندازه دود (پیکسل)
const SMOKE_RISE_DISTANCE = 60; // مسیر بالا رفتن دود (پیکسل) - افزایش یافت
const SMOKE_LIFETIME = 3000; // طول عمر دود (میلی‌ثانیه) - افزایش یافت
const SMOKE_OPACITY_START = 0.6; // شفافیت اولیه دود - افزایش یافت
const SMOKE_OPACITY_END = 0; // شفافیت نهایی دود
const SMOKE_DRIFT_RANGE = 20; // محدوده حرکت افقی دود (پیکسل) - افزایش یافت
const SMOKE_TURBULENCE = 0.5; // تلاطم دود برای طبیعی‌تر شدن

// Scene setup
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 1, 1000);
camera.position.set(3, 5, 8).setLength(15);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x101005);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

// Orbit controls
const controls = new OrbitControls(camera, renderer.domElement);
controls.enablePan = false;
controls.minPolarAngle = THREE.MathUtils.degToRad(60);
controls.maxPolarAngle = THREE.MathUtils.degToRad(95);
controls.minDistance = 4;
controls.maxDistance = 20;
controls.autoRotate = true;
controls.autoRotateSpeed = 1;
controls.target.set(0, 2, 0);
controls.update();

// Lighting
const directionalLight = new THREE.DirectionalLight(0xffffff, 0.025);
directionalLight.position.setScalar(10);
scene.add(directionalLight);
scene.add(new THREE.AmbientLight(0xffffff, 0.05));

// Audio context for blow detection
let audioContext;
let analyser;
let microphone;
let dataArray;
let isAudioEnabled = false;
let isBlowing = false;
let blowStartTime = 0;
let blowIntensity = 0;
let lastVolume = 0;
let blowPeakDetected = false;
let blowPeakValue = 0;
let blowSamples = [];
const BLOW_SAMPLE_SIZE = 10;

// Visual feedback for blow detection
let blowIndicator;
let blowIntensityBar;

// Gentle smoke system
let gentleSmokeIntervals = [];

// Initialize audio for blow detection
async function initAudio() {
    try {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 2048; // افزایش دقت فرکانس
        analyser.smoothingTimeConstant = 0.2; // کاهش هموارسازی برای پاسخ سریع
        analyser.minDecibels = -90;
        analyser.maxDecibels = -10;
        
        const stream = await navigator.mediaDevices.getUserMedia({ 
            audio: {
                echoCancellation: false,
                noiseSuppression: false,
                autoGainControl: false,
                sampleRate: 44100,
                channelCount: 1
            } 
        });
        
        // Create gain node for sensitivity control
        const gainNode = audioContext.createGain();
        gainNode.gain.value = 2.0; // افزایش حساسیت
        
        microphone = audioContext.createMediaStreamSource(stream);
        microphone.connect(gainNode);
        gainNode.connect(analyser);
        
        dataArray = new Uint8Array(analyser.frequencyBinCount);
        isAudioEnabled = true;
        
        console.log('Audio initialized for blow detection with enhanced sensitivity');
        
        // Create visual feedback elements
        createBlowFeedbackUI();
        
        startBlowDetection();
    } catch (error) {
        console.error('Error initializing audio:', error);
        document.getElementById('hold-reminder').innerHTML += '<br>(Microphone access denied - using touch only)';
    }
}

// Create visual feedback for blow detection
function createBlowFeedbackUI() {
    blowIndicator = document.createElement('div');
    blowIndicator.id = 'blow-indicator';
    blowIndicator.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        width: 100px;
        height: 20px;
        background: rgba(0, 0, 0, 0.7);
        border-radius: 10px;
        border: 2px solid #ffaa33;
        overflow: hidden;
        display: none;
        z-index: 1000;
    `;
    
    blowIntensityBar = document.createElement('div');
    blowIntensityBar.id = 'blow-intensity-bar';
    blowIntensityBar.style.cssText = `
        width: 0%;
        height: 100%;
        background: linear-gradient(90deg, #4CAF50, #FFC107, #F44336);
        transition: width 0.1s ease;
    `;
    
    blowIndicator.appendChild(blowIntensityBar);
    document.body.appendChild(blowIndicator);
}

// Advanced blow detection with frequency analysis
function startBlowDetection() {
    if (!isAudioEnabled || !analyser) return;
    
    function analyzeAudio() {
        if (!analyser || !dataArray) return;
        
        analyser.getByteFrequencyData(dataArray);
        
        // Analyze frequency spectrum
        const totalBins = dataArray.length;
        const lowFreqBins = Math.floor(totalBins * 0.1); // 10% پایین (فرکانس‌های پایین برای فوت)
        const midFreqBins = Math.floor(totalBins * 0.3); // 30% میانی
        const highFreqBins = Math.floor(totalBins * 0.1); // 10% بالا (نویز)
        
        let lowFreqSum = 0;
        let midFreqSum = 0;
        let highFreqSum = 0;
        let peakValue = 0;
        
        for (let i = 0; i < totalBins; i++) {
            const value = dataArray[i] / 255;
            
            if (i < lowFreqBins) {
                lowFreqSum += value;
            } else if (i < lowFreqBins + midFreqBins) {
                midFreqSum += value;
            } else if (i > totalBins - highFreqBins) {
                highFreqSum += value;
            }
            
            if (value > peakValue) {
                peakValue = value;
            }
        }
        
        const lowFreqAvg = lowFreqSum / lowFreqBins;
        const midFreqAvg = midFreqSum / midFreqBins;
        const highFreqAvg = highFreqSum / highFreqBins;
        
        // تشخیص الگوی صدای فوت: فرکانس پایین بالا، فرکانس بالا پایین
        const isBlowPattern = lowFreqAvg > BLOW_LOW_FREQ_THRESHOLD && 
                             highFreqAvg < BLOW_HIGH_FREQ_THRESHOLD &&
                             lowFreqAvg > midFreqAvg * 1.5; // فرکانس پایین باید از میانی بیشتر باشد
        
        // Calculate blow intensity
        const currentVolume = lowFreqAvg;
        const smoothedVolume = lastVolume * SMOOTHING_FACTOR + currentVolume * (1 - SMOOTHING_FACTOR);
        lastVolume = smoothedVolume;
        
        // Store samples for trend analysis
        blowSamples.push(smoothedVolume);
        if (blowSamples.length > BLOW_SAMPLE_SIZE) {
            blowSamples.shift();
        }
        
        // Calculate trend (افزایش سریع در شدت صدا)
        let trend = 0;
        if (blowSamples.length >= 3) {
            const recentAvg = blowSamples.slice(-3).reduce((a, b) => a + b) / 3;
            const olderAvg = blowSamples.length >= 6 ? 
                blowSamples.slice(-6, -3).reduce((a, b) => a + b) / 3 : recentAvg;
            trend = recentAvg - olderAvg;
        }
        
        // Update blow intensity
        blowIntensity = Math.max(0, smoothedVolume * 2 + trend * 3);
        
        // Detect blow peak
        if (peakValue > BLOW_PEAK_THRESHOLD && !blowPeakDetected) {
            blowPeakDetected = true;
            blowPeakValue = peakValue;
        }
        
        // Check if user is blowing
        if (isBlowPattern && blowIntensity > MIN_BLOW_INTENSITY) {
            if (!isBlowing) {
                isBlowing = true;
                blowStartTime = Date.now();
                blowPeakDetected = false;
                blowPeakValue = 0;
            } else {
                const blowDuration = Date.now() - blowStartTime;
                
                // اگر پیک صدا تشخیص داده شد یا مدت زمان کافی گذشت
                if ((blowPeakDetected && blowPeakValue > 0.2) || blowDuration > BLOW_DURATION) {
                    if (blowIntensity > 0.3) { // حداقل شدت برای فوت کردن
                        blowOutCandles(blowIntensity);
                        isBlowing = false;
                        blowPeakDetected = false;
                    }
                }
            }
        } else {
            isBlowing = false;
            blowPeakDetected = false;
        }
        
        // Update visual feedback
        updateBlowFeedback(blowIntensity);
        
        requestAnimationFrame(analyzeAudio);
    }
    
    analyzeAudio();
}

// Update visual feedback for blow detection
function updateBlowFeedback(intensity) {
    if (!blowIndicator || !blowIntensityBar) return;
    
    const normalizedIntensity = Math.min(intensity * 2, 1);
    blowIntensityBar.style.width = `${normalizedIntensity * 100}%`;
    
    if (intensity > MIN_BLOW_INTENSITY) {
        blowIndicator.style.display = 'block';
        blowIndicator.style.borderColor = intensity > 0.4 ? '#F44336' : 
                                         intensity > 0.25 ? '#FFC107' : '#4CAF50';
    } else {
        blowIndicator.style.display = 'none';
    }
}

// Flame material shader
function getFlameMaterial(isFrontSide) {
    const side = isFrontSide ? THREE.FrontSide : THREE.BackSide;
    return new THREE.ShaderMaterial({
        uniforms: {
            time: { value: 0 },
            isExtinguished: { value: 0 },
            windStrength: { value: 0 } // اضافه کردن وزش باد برای اثر فوت
        },
        vertexShader: `
uniform float time;
uniform float isExtinguished;
uniform float windStrength;
varying vec2 vUv;
varying float hValue;

float random(in vec2 st) {
    return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);
}

float noise(in vec2 st) {
    vec2 i = floor(st);
    vec2 f = fract(st);
    
    float a = random(i);
    float b = random(i + vec2(1.0, 0.0));
    float c = random(i + vec2(0.0, 1.0));
    float d = random(i + vec2(1.0, 1.0));
    
    vec2 u = f*f*(3.0-2.0*f);
    
    return mix(a, b, u.x) + (c - a)* u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}

void main() {
    vUv = uv;
    vec3 pos = position;
    
    // Reduce flame effect when extinguished
    float flameStrength = 1.0 - isExtinguished * 0.8;
    
    pos *= vec3(0.8, 2.0 * flameStrength, 0.725);
    hValue = position.y;
    
    float posXZlen = length(position.xz);
    float timeOffset = time * (1.0 + windStrength * 2.0); // سرعت بیشتر با وزش باد
    
    pos.y *= 1.0 + (cos((posXZlen + 0.25) * 3.1415926) * 0.25 + 
                   noise(vec2(0.0, timeOffset)) * 0.125 + 
                   noise(vec2(position.x + timeOffset, position.z + timeOffset)) * 0.5) * 
                   position.y * flameStrength;
    
    // Add wind effect when blowing
    float windEffect = windStrength * (1.0 - hValue) * 0.5;
    pos.x += (noise(vec2(timeOffset * 2.0, (position.y - timeOffset) * 4.0)) * 0.0312 + windEffect) * hValue * flameStrength;
    pos.z += (noise(vec2((position.y - timeOffset) * 4.0, timeOffset * 2.0)) * 0.0312 + windEffect) * hValue * flameStrength;
    
    // Flame bending with wind
    pos.x += windStrength * hValue * 0.3;
    
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}
`,
        fragmentShader: `
varying float hValue;
varying vec2 vUv;

vec3 heatmapGradient(float t) {
    return clamp((pow(t, 1.5) * 0.8 + 0.2) * vec3(
        smoothstep(0.0, 0.35, t) + t * 0.5,
        smoothstep(0.5, 1.0, t),
        max(1.0 - t * 1.7, t * 7.0 - 6.0)
    ), 0.0, 1.0);
}

void main() {
    float v = abs(smoothstep(0.0, 0.4, hValue) - 1.0);
    float alpha = (1.0 - v) * 0.99;
    alpha -= 1.0 - smoothstep(1.0, 0.97, hValue);
    
    vec3 flameColor = heatmapGradient(smoothstep(0.0, 0.3, hValue)) * vec3(0.95, 0.95, 0.4);
    flameColor = mix(vec3(0.0, 0.0, 1.0), flameColor, smoothstep(0.0, 0.3, hValue));
    flameColor += vec3(1.0, 0.9, 0.5) * (1.25 - vUv.y);
    flameColor = mix(flameColor, vec3(0.66, 0.32, 0.03), smoothstep(0.95, 1.0, hValue));
    
    gl_FragColor = vec4(flameColor, alpha);
}
`,
        transparent: true,
        side: side
    });
}

const flameMaterials = [];

function createFlame() {
    const flameGeo = new THREE.SphereGeometry(0.5, 32, 32);
    flameGeo.translate(0, 0.5, 0);
    const flameMat = getFlameMaterial(true);
    flameMaterials.push(flameMat);
    const flame = new THREE.Mesh(flameGeo, flameMat);
    flame.position.set(0.06, candleHeight, 0.06);
    flame.rotation.y = THREE.MathUtils.degToRad(-45);
    return flame;
}

// Create candle body
function createCandle() {
    const casePath = new THREE.Path();
    casePath.moveTo(0, 0);
    casePath.lineTo(0, 0);
    casePath.absarc(0, 0, candleRadius, Math.PI * 1.5, Math.PI * 2);
    casePath.lineTo(candleRadius, candleHeight);
    
    const caseGeo = new THREE.LatheGeometry(casePath.getPoints(), 64);
    const caseMat = new THREE.MeshStandardMaterial({ color: 0xff4500 });
    const caseMesh = new THREE.Mesh(caseGeo, caseMat);
    caseMesh.castShadow = true;
    
    // Candle top
    const topGeometry = new THREE.CylinderGeometry(0.2, candleRadius, 0.1, 32);
    const topMaterial = new THREE.MeshStandardMaterial({ color: 0xff4500 });
    const topMesh = new THREE.Mesh(topGeometry, topMaterial);
    topMesh.position.y = candleHeight;
    caseMesh.add(topMesh);
    
    // Candle wick
    const candlewickProfile = new THREE.Shape();
    candlewickProfile.absarc(0, 0, 0.0625, 0, Math.PI * 2);
    
    const candlewickCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, candleHeight - 1, 0),
        new THREE.Vector3(0, candleHeight - 0.5, -0.0625),
        new THREE.Vector3(0.25, candleHeight - 0.5, 0.125)
    ]);
    
    const candlewickGeo = new THREE.ExtrudeGeometry(candlewickProfile, {
        steps: 8,
        bevelEnabled: false,
        extrudePath: candlewickCurve
    });
    
    const colors = [];
    const color1 = new THREE.Color("black");
    const color2 = new THREE.Color(0x994411);
    const color3 = new THREE.Color(0xffff44);
    
    for (let i = 0; i < candlewickGeo.attributes.position.count; i++) {
        if (candlewickGeo.attributes.position.getY(i) < 0.4) {
            color1.toArray(colors, i * 3);
        } else {
            color2.toArray(colors, i * 3);
        }
        if (candlewickGeo.attributes.position.getY(i) < 0.15) {
            color3.toArray(colors, i * 3);
        }
    }
    
    candlewickGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    candlewickGeo.translate(0, 0.95, 0);
    const candlewickMat = new THREE.MeshBasicMaterial({ vertexColors: true });
    const candlewickMesh = new THREE.Mesh(candlewickGeo, candlewickMat);
    caseMesh.add(candlewickMesh);
    
    return caseMesh;
}

const candleTemplate = createCandle();

// Candle lights with flicker effect
function addCandleLights(candle) {
    const candleLight = new THREE.PointLight(0xffaa33, 1, 5, 2);
    candleLight.position.set(0, candleHeight, 0);
    candleLight.castShadow = true;
    candle.add(candleLight);
    
    const candleLight2 = new THREE.PointLight(0xffaa33, 1, 10, 2);
    candleLight2.position.set(0, candleHeight + 1, 0);
    candleLight2.castShadow = true;
    candle.add(candleLight2);
    
    return [candleLight, candleLight2];
}

// Table
const tableGeo = new THREE.CylinderGeometry(14, 14, 0.5, 64);
tableGeo.translate(0, -tableHeightOffset, 0);
const textureLoader = new THREE.TextureLoader();
const tableTexture = textureLoader.load(tableMatImage);
const tableMat = new THREE.MeshStandardMaterial({ map: tableTexture, metalness: 0, roughness: 0.75 });
const tableMesh = new THREE.Mesh(tableGeo, tableMat);
tableMesh.receiveShadow = true;
scene.add(tableMesh);

// Cake creation
function createCake() {
    const cakeGroup = new THREE.Group();
    
    // Base layer
    const baseGeometry = new THREE.CylinderGeometry(baseRadius, baseRadius, baseHeight, 32);
    const baseMaterial = new THREE.MeshPhongMaterial({ color: 0xfff5ee });
    const baseMesh = new THREE.Mesh(baseGeometry, baseMaterial);
    baseMesh.castShadow = true;
    
    // Middle layer
    const middleGeometry = new THREE.CylinderGeometry(middleRadius, middleRadius, middleHeight, 32);
    const middleMaterial = new THREE.MeshPhongMaterial({ color: 0xfffafa });
    const middleMesh = new THREE.Mesh(middleGeometry, middleMaterial);
    middleMesh.position.y = baseHeight / 2 + middleHeight / 2;
    middleMesh.castShadow = true;
    
    // Top layer
    const topGeometry = new THREE.CylinderGeometry(topRadius, topRadius, topHeight, 32);
    const topMaterial = new THREE.MeshPhongMaterial({ color: 0xf0ffff });
    const topMesh = new THREE.Mesh(topGeometry, topMaterial);
    topMesh.position.y = baseHeight / 2 + middleHeight + topHeight / 2;
    topMesh.castShadow = true;
    
    cakeGroup.add(baseMesh);
    cakeGroup.add(middleMesh);
    cakeGroup.add(topMesh);
    
    return cakeGroup;
}

const cake = createCake();
scene.add(cake);

// Create multiple candles
const candles = new THREE.Group();
const extinguishedCandles = new Set();

function createCandles(count) {
    const radius = 1;
    for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2;
        const candle = candleTemplate.clone();
        
        // Scale and position
        candle.scale.set(0.3, 0.3, 0.3);
        candle.position.x = Math.cos(angle) * radius;
        candle.position.z = Math.sin(angle) * radius;
        candle.position.y = baseHeight / 2 + middleHeight + topHeight;
        
        // Add lights
        const lights = addCandleLights(candle);
        
        // Add flames
        const flame1 = createFlame();
        const flame2 = createFlame();
        candle.add(flame1);
        candle.add(flame2);
        
        // Store references for later access
        candle.userData = {
            lights: lights,
            flames: [flame1, flame2],
            flameMaterials: [flame1.material, flame2.material],
            isExtinguished: false,
            windEffect: 0,
            gentleSmokeInterval: null,
            smokeParticles: [] // ذخیره ذرات دود برای مدیریت بهتر
        };
        
        candles.add(candle);
    }
    return candles;
}

const allCandles = createCandles(candleCount);
cake.add(allCandles);

// Ambient light for the scene
const ambientLight = new THREE.AmbientLight(0xffffff, 0.05);
scene.add(ambientLight);

// Adjust camera
camera.position.set(0, 5, 10);
camera.lookAt(cake.position);

// Hold event variables
let holdTimeout;
let allowBlowout = false;
const holdReminder = document.getElementById('hold-reminder');
const audio = document.getElementById("happy-birthday-audio");

// Enable blowout after song plays
audio.addEventListener('ended', function() {
    holdReminder.style.display = 'flex';
    setTimeout(function() {
        holdReminder.classList.add('show');
        // Initialize audio for blow detection
        initAudio();
        // Start gentle smoke effects
        if (GENTLE_SMOKE_ENABLED) {
            startGentleSmokeEffects();
        }
    }, 10);
    allowBlowout = true;
});

// Hold events
function handleHoldStart() {
    if (!allowBlowout) return;
    holdTimeout = setTimeout(() => {
        blowOutCandles(1.0);
    }, 500);
}

function handleHoldEnd() {
    clearTimeout(holdTimeout);
}

document.addEventListener('mousedown', handleHoldStart);
document.addEventListener('touchstart', handleHoldStart);
document.addEventListener('mouseup', handleHoldEnd);
document.addEventListener('touchend', handleHoldEnd);

// Congratulation overlay
function showCongratulation() {
    const overlay = document.getElementById('congratulation-overlay');
    overlay.style.pointerEvents = 'auto';
    overlay.style.background = 'rgba(0, 0, 0, 0.8)';
    overlay.style.opacity = '1';
    
    // Add confetti effect
    createConfetti();
}

// Create confetti effect
function createConfetti() {
    const confettiCount = 150;
    const confettiColors = ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff'];
    
    for (let i = 0; i < confettiCount; i++) {
        const confetti = document.createElement('div');
        confetti.style.cssText = `
            position: fixed;
            width: 10px;
            height: 10px;
            background: ${confettiColors[Math.floor(Math.random() * confettiColors.length)]};
            top: -20px;
            left: ${Math.random() * 100}vw;
            border-radius: 2px;
            transform: rotate(${Math.random() * 360}deg);
            animation: confetti-fall ${1 + Math.random() * 2}s linear forwards;
            z-index: 9999;
        `;
        
        document.body.appendChild(confetti);
        
        // Remove confetti after animation
        setTimeout(() => {
            confetti.remove();
        }, 3000);
    }
    
    // Add CSS animation
    if (!document.getElementById('confetti-style')) {
        const style = document.createElement('style');
        style.id = 'confetti-style';
        style.textContent = `
            @keyframes confetti-fall {
                0% {
                    transform: translateY(0) rotate(0deg);
                    opacity: 1;
                }
                100% {
                    transform: translateY(100vh) rotate(${360 + Math.random() * 360}deg);
                    opacity: 0;
                }
            }
        `;
        document.head.appendChild(style);
    }
}

// Simulate wind effect on candles when blowing
function applyWindEffect(intensity) {
    allCandles.children.forEach(candle => {
        if (!candle.userData.isExtinguished) {
            candle.userData.windEffect = intensity;
            candle.userData.flameMaterials.forEach(mat => {
                if (mat.uniforms && mat.uniforms.windStrength) {
                    mat.uniforms.windStrength.value = intensity * 0.5;
                }
            });
            
            // Slightly move candles with wind
            const windAngle = Math.random() * Math.PI * 2;
            const windStrength = intensity * 0.1;
            candle.position.x += Math.cos(windAngle) * windStrength;
            candle.position.z += Math.sin(windAngle) * windStrength;
        }
    });
}

// Create natural gentle smoke effect above candle - بهبود یافته
function createNaturalSmoke(candlePosition, intensity = 1, isExtinguishing = false) {
    // Convert 3D position to screen position
    const screenPosition = new THREE.Vector3();
    candlePosition.clone().add(new THREE.Vector3(0, 0.5, 0)); // کمی بالاتر از شعله
    screenPosition.project(camera);
    
    const x = (screenPosition.x * 0.5 + 0.5) * window.innerWidth;
    const y = (-screenPosition.y * 0.5 + 0.5) * window.innerHeight;
    
    const smokeCount = isExtinguishing ? 
        Math.max(3, Math.floor(EXTINGUISH_SMOKE_PARTICLES * intensity)) : 
        GENTLE_SMOKE_PARTICLES;
    
    // Generate smoke particles with natural variation
    for (let i = 0; i < smokeCount; i++) {
        const delay = i * (isExtinguishing ? 80 : 200); // تأخیر بین ذرات
        setTimeout(() => {
            const smoke = document.createElement('div');
            const size = SMOKE_MIN_SIZE + Math.random() * (SMOKE_MAX_SIZE - SMOKE_MIN_SIZE);
            const drift = (Math.random() - 0.5) * SMOKE_DRIFT_RANGE * intensity;
            const riseDistance = SMOKE_RISE_DISTANCE * (0.8 + Math.random() * 0.4) * intensity;
            const lifetime = SMOKE_LIFETIME * (0.7 + Math.random() * 0.6);
            const turbulence = SMOKE_TURBULENCE * (0.5 + Math.random() * 0.5);
            
            // Create more natural smoke gradient
            const smokeColor = isExtinguishing ? 
                `rgba(90, 90, 90, ${SMOKE_OPACITY_START * intensity})` : 
                `rgba(180, 180, 180, ${SMOKE_OPACITY_START * 0.7})`;
            
            smoke.style.cssText = `
                position: fixed;
                width: ${size}px;
                height: ${size}px;
                background: radial-gradient(circle at 30% 30%, 
                    ${smokeColor} 0%, 
                    rgba(140, 140, 140, ${SMOKE_OPACITY_START * 0.5}) 40%,
                    rgba(100, 100, 100, ${SMOKE_OPACITY_START * 0.2}) 70%,
                    transparent 100%);
                border-radius: 50%;
                left: ${x + (Math.random() - 0.5) * 8}px;
                top: ${y + (Math.random() - 0.5) * 6}px;
                transform: translate(-50%, -50%);
                animation: natural-smoke-${Date.now()}-${i} ${lifetime}ms ease-out forwards;
                pointer-events: none;
                z-index: 899;
                filter: blur(${1 + Math.random() * 1.5}px);
                opacity: ${SMOKE_OPACITY_START * intensity};
            `;
            
            // Create more complex natural animation
            const animationId = `natural-smoke-${Date.now()}-${i}`;
            const style = document.createElement('style');
            style.textContent = `
                @keyframes ${animationId} {
                    0% {
                        transform: translate(-50%, -50%) scale(0.5);
                        opacity: ${SMOKE_OPACITY_START * intensity};
                        filter: blur(${0.5 + Math.random()}px);
                    }
                    15% {
                        transform: translate(${drift * 0.2 + Math.sin(0) * turbulence}px, 
                                            -${riseDistance * 0.15}px) scale(1);
                        opacity: ${SMOKE_OPACITY_START * 0.9 * intensity};
                    }
                    35% {
                        transform: translate(${drift * 0.4 + Math.sin(0.5) * turbulence}px, 
                                            -${riseDistance * 0.35}px) scale(1.1);
                        opacity: ${SMOKE_OPACITY_START * 0.7 * intensity};
                    }
                    55% {
                        transform: translate(${drift * 0.6 + Math.sin(1) * turbulence}px, 
                                            -${riseDistance * 0.55}px) scale(1.2);
                        opacity: ${SMOKE_OPACITY_START * 0.5 * intensity};
                    }
                    75% {
                        transform: translate(${drift * 0.8 + Math.sin(1.5) * turbulence}px, 
                                            -${riseDistance * 0.75}px) scale(1.25);
                        opacity: ${SMOKE_OPACITY_START * 0.3 * intensity};
                    }
                    100% {
                        transform: translate(${drift + Math.sin(2) * turbulence}px, 
                                            -${riseDistance}px) scale(1.3);
                        opacity: ${SMOKE_OPACITY_END};
                        filter: blur(${2 + Math.random()}px);
                    }
                }
            `;
            
            document.head.appendChild(style);
            document.body.appendChild(smoke);
            
            // Remove after animation
            setTimeout(() => {
                if (smoke.parentNode) {
                    smoke.remove();
                }
                if (style.parentNode) {
                    style.remove();
                }
            }, lifetime + 200);
            
        }, delay);
    }
}

// Start gentle smoke effects for burning candles
function startGentleSmokeEffects() {
    if (!GENTLE_SMOKE_ENABLED) return;
    
    allCandles.children.forEach(candle => {
        if (!candle.userData.isExtinguished) {
            // Create gentle smoke at random intervals
            candle.userData.gentleSmokeInterval = setInterval(() => {
                if (!candle.userData.isExtinguished) {
                    createNaturalSmoke(candle.position, 0.3 + Math.random() * 0.3, false);
                }
            }, GENTLE_SMOKE_INTERVAL + Math.random() * 1500);
            
            gentleSmokeIntervals.push(candle.userData.gentleSmokeInterval);
        }
    });
}

// Stop all gentle smoke effects
function stopGentleSmokeEffects() {
    gentleSmokeIntervals.forEach(interval => {
        clearInterval(interval);
    });
    gentleSmokeIntervals = [];
    
    allCandles.children.forEach(candle => {
        if (candle.userData.gentleSmokeInterval) {
            clearInterval(candle.userData.gentleSmokeInterval);
            candle.userData.gentleSmokeInterval = null;
        }
    });
}

// Extinguish single candle with realistic smoke effect
function extinguishCandle(candle, speed, intensity = 1) {
    if (candle.userData.isExtinguished) return;
    
    candle.userData.isExtinguished = true;
    extinguishedCandles.add(candle);
    
    // Stop gentle smoke for this candle
    if (candle.userData.gentleSmokeInterval) {
        clearInterval(candle.userData.gentleSmokeInterval);
        candle.userData.gentleSmokeInterval = null;
    }
    
    const lights = candle.userData.lights;
    const flames = candle.userData.flames;
    const flameMats = candle.userData.flameMaterials;
    
    // Create initial extinguishing smoke burst
    createNaturalSmoke(candle.position, intensity * 0.8, true);
    
    // Create secondary smoke after a short delay
    setTimeout(() => {
        createNaturalSmoke(candle.position, intensity * 0.5, true);
    }, 200);
    
    let progress = 0;
    const extinguishInterval = setInterval(() => {
        progress += 0.02 * speed * intensity;
        
        if (progress >= 1) {
            clearInterval(extinguishInterval);
            flames.forEach(flame => {
                flame.visible = false;
            });
            lights.forEach(light => {
                light.intensity = 0;
                light.distance = 0;
            });
            
            // Create final subtle smoke after complete extinguishing
            setTimeout(() => {
                createNaturalSmoke(candle.position, intensity * 0.3, true);
            }, 300);
            
            // Continue occasional smoke for a few seconds after extinguishing
            const smokeAftermath = setInterval(() => {
                if (Math.random() < 0.3) {
                    createNaturalSmoke(candle.position, intensity * 0.1, true);
                }
            }, 500);
            
            setTimeout(() => {
                clearInterval(smokeAftermath);
            }, 3000);
            
        } else {
            // Animate flame extinguishing with wind effect
            flames.forEach((flame, index) => {
                const windEffect = (1 - progress) * candle.userData.windEffect;
                flame.material.opacity = 1 - progress;
                flame.material.uniforms.isExtinguished.value = progress;
                flame.material.uniforms.windStrength.value = windEffect;
                
                // Realistic shrinking with slight asymmetry
                const scale = 1 - progress * (0.7 + intensity * 0.3);
                flame.scale.set(scale, scale * (0.9 + Math.sin(progress * 10) * 0.1), scale);
                
                // Flame bending away from wind
                const bendAmount = windEffect * 0.15 * progress;
                flame.position.x += bendAmount;
                flame.position.z += bendAmount;
                
                // Create smoke during extinguishing process
                if (progress > 0.3 && progress < 0.9) {
                    if (Math.random() < 0.15) {
                        const smokeIntensity = intensity * (1 - progress) * 0.6;
                        createNaturalSmoke(candle.position, smokeIntensity, true);
                    }
                }
            });
            
            // Reduce light intensity with realistic flicker
            lights.forEach(light => {
                const flicker = 1 + Math.sin(progress * 30) * 0.15 * (1 - progress);
                const finalIntensity = Math.max(0, (1 - progress) * flicker);
                light.intensity = finalIntensity;
                light.distance = 5 * (1 - progress);
                
                // Make light dim in a natural way
                if (progress > 0.7) {
                    light.power = 100 * (1 - progress);
                }
            });
        }
    }, 20);
}

// Blow out all candles with intensity-based effect
function blowOutCandles(intensity = 1) {
    if (extinguishedCandles.size >= candleCount) return;
    
    // Stop gentle smoke effects
    stopGentleSmokeEffects();
    
    // Play blow sound with volume based on intensity
    try {
        const blowSound = new Audio('/blow-sound.mp3');
        blowSound.volume = Math.min(0.3 + intensity * 0.7, 1);
        blowSound.play().catch(e => console.log('Blow sound not available'));
    } catch (e) {
        console.log('Audio error:', e);
    }
    
    // Apply wind effect based on blow intensity
    applyWindEffect(intensity);
    
    // Extinguish candles with realistic sequence
    let delay = 0;
    allCandles.children.forEach(candle => {
        if (!candle.userData.isExtinguished) {
            setTimeout(() => {
                const speed = 0.8 + Math.random() * 1.2 + intensity * 0.5;
                extinguishCandle(candle, speed, intensity);
                
                // Additional smoke burst for candles blown out later
                if (delay > 300) {
                    setTimeout(() => {
                        createNaturalSmoke(candle.position, intensity * 0.4, true);
                    }, 150);
                }
            }, delay);
            
            // Variable delay based on intensity and position
            delay += 60 + Math.random() * 100 + (1 - intensity) * 50;
        }
    });
    
    // Create ambient smoke cloud above all candles
    setTimeout(() => {
        for (let i = 0; i < 5; i++) {
            setTimeout(() => {
                const center = new THREE.Vector3(0, baseHeight / 2 + middleHeight + topHeight + 0.5, 0);
                createNaturalSmoke(center, intensity * 0.2, true);
            }, i * 200);
        }
    }, 500);
    
    // Gradually increase ambient light
    let ambientLightIntensity = ambientLight.intensity;
    const targetIntensity = 0.1 + intensity * 0.1;
    const ambientInterval = setInterval(() => {
        ambientLightIntensity += 0.005;
        if (ambientLightIntensity >= targetIntensity) {
            clearInterval(ambientInterval);
            ambientLight.intensity = targetIntensity;
            // Wait a bit before showing congratulation to let smoke effects play
            setTimeout(() => {
                showCongratulation();
            }, 1500);
        } else {
            ambientLight.intensity = ambientLightIntensity;
        }
    }, 40);
    
    // Hide reminder and blow indicator
    holdReminder.style.display = 'none';
    if (blowIndicator) {
        blowIndicator.style.display = 'none';
    }
    
    // Stop audio analysis
    if (microphone) {
        microphone.disconnect();
    }
}

// Animation loop
const clock = new THREE.Clock();
let time = 0;

function render() {
    requestAnimationFrame(render);
    time += clock.getDelta();
    
    // Update flame materials
    flameMaterials.forEach((material, index) => {
        if (material.uniforms && material.uniforms.time) {
            material.uniforms.time.value = time;
        }
    });
    
    // Update candle lights animation with flicker
    allCandles.children.forEach(candle => {
        if (!candle.userData.isExtinguished && candle.userData.lights && candle.userData.lights[1]) {
            const light = candle.userData.lights[1];
            const flicker = Math.sin(time * Math.PI * 4) * 0.1 + 
                          Math.cos(time * Math.PI * 1.7) * 0.05;
            
            light.position.x = Math.sin(time * Math.PI + flicker) * 0.25;
            light.position.z = Math.cos(time * Math.PI * 0.75 + flicker) * 0.25;
            light.intensity = 2 + flicker * 0.5;
            
            // Add subtle wind effect if blowing is detected
            if (isBlowing && blowIntensity > 0.3) {
                const windEffect = blowIntensity * 0.3;
                light.position.x += Math.sin(time * 10) * windEffect;
                light.position.z += Math.cos(time * 8) * windEffect;
            }
        }
    });
    
    // Create occasional random gentle smoke (backup system)
    if (GENTLE_SMOKE_ENABLED && allowBlowout && Math.random() < 0.003 && extinguishedCandles.size < candleCount) {
        const burningCandles = allCandles.children.filter(c => !c.userData.isExtinguished);
        if (burningCandles.length > 0) {
            const randomCandle = burningCandles[Math.floor(Math.random() * burningCandles.length)];
            createNaturalSmoke(randomCandle.position, 0.2 + Math.random() * 0.3, false);
        }
    }
    
    controls.update();
    renderer.render(scene, camera);
}

render();

// Handle window resize
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// Add CSS for smoke particles
if (!document.getElementById('smoke-styles')) {
    const smokeStyles = document.createElement('style');
    smokeStyles.id = 'smoke-styles';
    smokeStyles.textContent = `
        @keyframes smoke-float {
            0% {
                transform: translate(-50%, -50%) scale(0.8);
                opacity: 0.6;
                filter: blur(1px);
            }
            100% {
                transform: translate(calc(-50% + var(--drift-x, 0px)), calc(-50% - var(--rise-distance, 40px))) scale(1.3);
                opacity: 0;
                filter: blur(3px);
            }
        }
        
        .smoke-particle {
            position: fixed;
            border-radius: 50%;
            pointer-events: none;
            z-index: 899;
            animation-timing-function: ease-out;
        }
    `;
    document.head.appendChild(smokeStyles);
}

// Initialize
console.log('Birthday cake scene initialized with enhanced natural smoke effects');