import * as THREE from "three";
import { Pass } from "three/examples/jsm/postprocessing/Pass.js";
import {
    MeshNormalMaterial,
    PerspectiveCamera,
    Scene,
    ShaderMaterial,
    Vector2,
    WebGLRenderer,
    WebGLRenderTarget
} from "three";
import { FullScreenQuad } from "three/examples/jsm/postprocessing/Pass";

// Follows the structure of
// 		https://github.com/mrdoob/three.js/blob/master/examples/jsm/postprocessing/OutlinePass.js
export class CustomOutlinePass extends Pass {
    renderScene: Scene
    renderCamera: PerspectiveCamera
    resolution: Vector2
    fsQuad: FullScreenQuad
    normalTarget: WebGLRenderTarget
    normalOverrideMaterial: MeshNormalMaterial

    constructor(resolution: Vector2, scene: Scene, camera: PerspectiveCamera) {
        super();

        this.renderScene = scene;
        this.renderCamera = camera;
        this.resolution = new THREE.Vector2(resolution.x, resolution.y);

        this.fsQuad = new FullScreenQuad(undefined);
        this.fsQuad.material = this.createOutlinePostProcessMaterial();

        // Create a buffer to store the normals of the scene onto
        const normalTarget = new THREE.WebGLRenderTarget(
            this.resolution.x,
            this.resolution.y
        );
        normalTarget.texture.format = THREE.RGBFormat;
        normalTarget.texture.minFilter = THREE.NearestFilter;
        normalTarget.texture.magFilter = THREE.NearestFilter;
        normalTarget.texture.generateMipmaps = false;
        normalTarget.stencilBuffer = false;
        this.normalTarget = normalTarget;

        this.normalOverrideMaterial = new THREE.MeshNormalMaterial();
    }

    dispose() {
        this.normalTarget.dispose();
        this.fsQuad.dispose();
    }

    setSize(width: number, height: number) {
        this.normalTarget.setSize(width, height);
        this.resolution.set(width, height);

        (this.fsQuad.material as ShaderMaterial).uniforms.screenSize.value.set(
            this.resolution.x,
            this.resolution.y,
            1 / this.resolution.x,
            1 / this.resolution.y
        );
    }

    render(renderer: WebGLRenderer, writeBuffer: WebGLRenderTarget, readBuffer: WebGLRenderTarget) {
        // Turn off writing to the depth buffer
        // because we need to read from it in the subsequent passes.
        const depthBufferValue = writeBuffer.depthBuffer;
        writeBuffer.depthBuffer = false;

        // 1. Re-render the scene to capture all normals in texture.
        // Ideally we could capture this in the first render pass along with
        // the depth texture.
        renderer.setRenderTarget(this.normalTarget);

        const overrideMaterialValue = this.renderScene.overrideMaterial;
        this.renderScene.overrideMaterial = this.normalOverrideMaterial;
        renderer.render(this.renderScene, this.renderCamera);
        this.renderScene.overrideMaterial = overrideMaterialValue;

        (this.fsQuad.material as ShaderMaterial).uniforms["depthBuffer"].value =
            readBuffer.depthTexture;
        (this.fsQuad.material as ShaderMaterial).uniforms[
            "normalBuffer"
            ].value = this.normalTarget.texture;
        (this.fsQuad.material as ShaderMaterial).uniforms["sceneColorBuffer"].value =
            readBuffer.texture;

        // 2. Draw the outlines using the depth texture and normal texture
        // and combine it with the scene color
        if (this.renderToScreen) {
            // If this is the last effect, then renderToScreen is true.
            // So we should render to the screen by setting target null
            // Otherwise, just render into the writeBuffer that the next effect will use as its read buffer.
            renderer.setRenderTarget(null);
            this.fsQuad.render(renderer);
        } else {
            renderer.setRenderTarget(writeBuffer);
            this.fsQuad.render(renderer);
        }

        // Reset the depthBuffer value so we continue writing to it in the next render.
        writeBuffer.depthBuffer = depthBufferValue;
    }

    get vertexShader() {
        return `
			varying vec2 vUv;
			void main() {
				vUv = uv;
				gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
			}
			`;
    }
    get fragmentShader() {
        return `
			#include <packing>
			// The above include imports "perspectiveDepthToViewZ"
			// and other GLSL functions from ThreeJS we need for reading depth.
			uniform sampler2D sceneColorBuffer;
			uniform sampler2D depthBuffer;
			uniform sampler2D normalBuffer;
			uniform float cameraNear;
			uniform float cameraFar;
			uniform vec4 screenSize;
			uniform vec3 outlineColor;
			uniform vec4 multiplierParameters;
			uniform int width;
			uniform int debugVisualize;
			varying vec2 vUv;
			// Helper functions for reading from depth buffer.
			float readDepth (sampler2D depthSampler, vec2 coord) {
				float fragCoordZ = texture2D(depthSampler, coord).x;
				float viewZ = perspectiveDepthToViewZ( fragCoordZ, cameraNear, cameraFar );
				return viewZToOrthographicDepth( viewZ, cameraNear, cameraFar );
			}
			float getLinearDepth(vec3 pos) {
				return -(viewMatrix * vec4(pos, 1.0)).z;
			}
			float getLinearScreenDepth(sampler2D map) {
					vec2 uv = gl_FragCoord.xy * screenSize.zw;
					return readDepth(map,uv);
			}
			// Helper functions for reading normals and depth of neighboring pixels.
			float getPixelDepth(int x, int y) {
				// screenSize.zw is pixel size 
				// vUv is current position
				return readDepth(depthBuffer, vUv + screenSize.zw * vec2(x, y));
			}
			vec3 getPixelNormal(int x, int y) {
				return texture2D(normalBuffer, vUv + screenSize.zw * vec2(x, y)).rgb;
			}
			float saturate(float num) {
				return clamp(num, 0.0, 1.0);
			}
			void main() {
				vec4 sceneColor = texture2D(sceneColorBuffer, vUv);
				float depth = getPixelDepth(0, 0);
				vec3 normal = getPixelNormal(0, 0);
				// Get the difference between depth of neighboring pixels and current.
				float depthDiff = 0.0;
				float d1 = depth - getPixelDepth(width, 0);
                float d2 = depth - getPixelDepth(-width, 0);
                float d3 = depth - getPixelDepth(0, width);
                float d4 = depth - getPixelDepth(0, -width);
                float d5 = depth - getPixelDepth(width, width);
                float d6 = depth - getPixelDepth(-width, -width);
                float d7 = depth - getPixelDepth(width, width);
                float d8 = depth - getPixelDepth(-width, -width);
				depthDiff += d1 > 0.0 ? d1 : 0.0;
				depthDiff += d2 > 0.0 ? d2 : 0.0;
				depthDiff += d3 > 0.0 ? d3 : 0.0;
				depthDiff += d4 > 0.0 ? d4 : 0.0;
				// Get the difference between normals of neighboring pixels and current
				float normalDiff = 0.0;
				normalDiff += distance(normal, getPixelNormal(width, 0));
				normalDiff += distance(normal, getPixelNormal(0, width));
				normalDiff += distance(normal, getPixelNormal(0, width));
				normalDiff += distance(normal, getPixelNormal(0, -width));
				normalDiff += distance(normal, getPixelNormal(width, width));
				normalDiff += distance(normal, getPixelNormal(width, -width));
				normalDiff += distance(normal, getPixelNormal(-width, width));
				normalDiff += distance(normal, getPixelNormal(-width, -width));
				// Apply multiplier & bias to each 
				float depthBias = multiplierParameters.x;
				float depthMultiplier = multiplierParameters.y;
				float normalBias = multiplierParameters.z;
				float normalMultiplier = multiplierParameters.w;
				depthDiff = depthDiff * depthMultiplier;
				depthDiff = saturate(depthDiff);
				depthDiff = pow(depthDiff, depthBias);
				normalDiff = normalDiff * normalMultiplier;
				normalDiff = saturate(normalDiff);
				normalDiff = pow(normalDiff, normalBias);
				float outline = normalDiff + depthDiff;
			
				// Combine outline with scene color.
				vec4 outlineColor = vec4(outlineColor, 1.0);
				gl_FragColor = vec4(mix(sceneColor, outlineColor, outline));
				// For debug visualization of the different inputs to this shader.
				if (debugVisualize == 1) {
					gl_FragColor = sceneColor;
				}
				if (debugVisualize == 2) {
					gl_FragColor = vec4(vec3(depth), 1.0);
				}
				if (debugVisualize == 3) {
					gl_FragColor = vec4(normal, 1.0);
				}
				if (debugVisualize == 4) {
					gl_FragColor = vec4(vec3(outline * outlineColor), 1.0);
				}
			}
			`;
    }

    createOutlinePostProcessMaterial() {
        return new THREE.ShaderMaterial({
            uniforms: {
                debugVisualize: { value: 0 },
                sceneColorBuffer: { value: 0 },
                depthBuffer: { value: 0 },
                normalBuffer: { value: 0 },
                outlineColor: { value: new THREE.Color(0xffffff) },
                //4 scalar values packed in one uniform: depth multiplier, depth bias, and same for normals.
                multiplierParameters: { value: new THREE.Vector4(1, 1, 1, 1) },
                cameraNear: { value: this.renderCamera.near },
                cameraFar: { value: this.renderCamera.far },
                screenSize: {
                    value: new THREE.Vector4(
                        this.resolution.x,
                        this.resolution.y,
                        1 / this.resolution.x,
                        1 / this.resolution.y
                    ),
                },
                width: { value: 1 }
            },
            vertexShader: this.vertexShader,
            fragmentShader: this.fragmentShader,
        });
    }
}
