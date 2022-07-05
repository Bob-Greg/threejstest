import './style.css'
import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import {CustomOutlinePass} from './CustomRenderPass'
import {ShaderMaterial} from "three";
import {OrbitControls} from "three/examples/jsm/controls/OrbitControls";

const scene = new THREE.Scene()
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ canvas: document.querySelector<HTMLCanvasElement>("#bg")!! })
let pixelRatio = window.devicePixelRatio || 0
const composer = new EffectComposer(renderer)
const textureLoader = new THREE.TextureLoader()
const fourTone = textureLoader.load("src/fourTone.jpg")
fourTone.minFilter = THREE.NearestFilter
fourTone.magFilter = THREE.NearestFilter

composer.setSize(window.innerWidth * pixelRatio, window.innerWidth * pixelRatio)
{
    renderer.setPixelRatio(pixelRatio)
    renderer.setSize(window.innerWidth, window.innerHeight)
    camera.position.setZ(30)
}

const geometry = new THREE.IcosahedronGeometry(12)
const material = new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: fourTone })
const icosahedron = new THREE.Mesh(geometry, material)
scene.add(icosahedron)

const renderPass = new RenderPass(scene, camera)
composer.addPass(renderPass);

const controls = new OrbitControls(camera, document.querySelector<HTMLCanvasElement>('#bg')!!)

const outlinePass_new = new CustomOutlinePass(new THREE.Vector2(window.innerWidth * pixelRatio, window.innerHeight * pixelRatio), scene, camera)
{
    const uniforms = (outlinePass_new.fsQuad.material as ShaderMaterial).uniforms
    uniforms.outlineColor.value.set(0x000000)
    uniforms.multiplierParameters.value.x = 1;
    uniforms.multiplierParameters.value.y = 1;
    uniforms.multiplierParameters.value.z = 1;
    uniforms.multiplierParameters.value.w = 1;
    uniforms.width.value = 2;
}
composer.addPass(outlinePass_new)

const pointLight = new THREE.PointLight(0xffffff)
pointLight.translateY(16)
const ambientLight = new THREE.AmbientLight(0xfff9ff)
scene.add(pointLight, ambientLight)

scene.background = new THREE.Color(0xffffff)

function animate() {
    requestAnimationFrame(animate)
    icosahedron.rotateZ(0.01)
    icosahedron.rotateX(0.01)
    icosahedron.rotateY(0.01)
    controls.update()
    composer.render()
}

animate()