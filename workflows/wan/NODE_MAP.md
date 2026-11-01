# Wan ComfyUI API workflow — node mapping

## Required file

Working export (already in repo when present):

```text
workflows/wan/wan22-i2v-a14b-api.json
```

## EpicAstra Wan2.2 I2V — this export’s node IDs

Confirmed from the live Vast export. Frame count is **not** set directly:
node `129:163` computes `floor(duration * fps + 1)`.

| Role | Node id | class_type | title | Patched field |
|------|---------|------------|-------|----------------|
| Load Image | `97` | `LoadImage` | Load Image | `inputs.image` |
| Positive / video prompt | `129:93` | `CLIPTextEncode` | CLIP Text Encode (Positive Prompt) | `inputs.text` |
| Negative video prompt | `129:89` | `CLIPTextEncode` | CLIP Text Encode (Negative Prompt) | `inputs.text` |
| Wan dimensions | `129:98` | `WanImageToVideo` | WanImageToVideo | `inputs.width`, `inputs.height` only — **do not overwrite `length`** (linked) |
| Generation seed (primary) | `129:86` | `KSamplerAdvanced` | KSampler (Advanced) | `inputs.noise_seed` |
| Generation seed (secondary) | `129:85` | `KSamplerAdvanced` | KSampler (Advanced) | `inputs.noise_seed` (kept in sync) |
| Duration (seconds) | `129:161` | `PrimitiveFloat` | Float (Duration) | `inputs.value` |
| FPS | `129:162` | `PrimitiveFloat` | Float (FPS) | `inputs.value` |
| Frame formula | `129:163` | `ComfyMathExpression` | Math Expression | `floor(a * b + 1)` — **never patched** |
| Output filename | `108` | `SaveVideo` | Save Video | `inputs.filename_prefix` |
| LightX2V toggle | `129:131` | `PrimitiveBoolean` | Enable 4steps LoRA? | `inputs.value` — `false`=20-step quality, `true`=4-step fast |

**Never patched:** CLIP/VAE/UNET loaders, sampler architecture (steps/CFG come from switches driven by `129:131`).

Runtime size comes from env (overrides manual-test leftovers like `804.0625×880`):

```env
WAN_COMFY_WIDTH=704
WAN_COMFY_HEIGHT=1280
WAN_COMFY_FPS=16
WAN_COMFY_QUALITY_MODE=quality   # or fast (LightX2V 4-step)
```

UI **Sampler mode** select overrides this per generate job. Use `fast` on one scene to A/B before batching an episode.

Duration comes from each scene’s narration `durationSeconds`, snapped so
`floor(duration × fps + 1)` lands on a Wan-friendly **4n+1** frame count
(`src/lib/wanTiming.ts`). Cap with `WAN_COMFY_MAX_FRAMES` (default 129 ≈ 8s @ 16fps).

## Vast port / SSH tunnel

On this Vast template:

- Real ComfyUI: `127.0.0.1:18188`
- Host `8188` is often **Caddy** (not the API)

Tunnel (Mac → Vast):

```bash
npm run wan:tunnel:comfy -- root@HOST -p PORT
# = ssh -N -L 8188:127.0.0.1:18188 -p PORT root@HOST
```

Configurable:

```env
WAN_COMFY_LOCAL_PORT=8188
WAN_COMFY_REMOTE_PORT=18188
```

App still uses:

```env
WAN_COMFY_URL=http://127.0.0.1:8188
```

## Code

`src/providers/wan-comfy.ts` → `WAN22_I2V_NODE_MAP` + `patchEpicAstraWan22Workflow()`.
