"""FFmpeg-only procedural effects demo. No model/API calls; no UI/production changes.
Masks and coordinates are art-directed for the Vishnu/Ganga demo, not universal presets.
"""
from pathlib import Path
import subprocess, json, math
root=Path(__file__).resolve().parents[2]
out=root/'output/experiments/ffmpeg-effects-v2'
out.mkdir(parents=True,exist_ok=True)
source=root/'output/experiments/ffmpeg-motion-v1/03-cinematic-glide.mp4'
if not source.exists(): raise SystemExit('Generate the approved camera-motion demo first.')
def run(args): subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y',*args],check=True)
# Water-only displacement fades in below the figures; at most 1.5 pixels at 720p.
water="max(0,min(1,(Y/H-0.87)/0.08))"
xmap=f"128+1.5*{water}*sin(Y/11+T*2.2)"
ymap=f"128+1.0*{water}*sin(X/24+T*1.8)"
# Small low-resolution RGBA atmosphere plates; smooth scaling gives soft edges.
# Separate moving mist banks establish foreground depth, without cutting up faces.
mist="18*exp(-pow((Y-535)/48,2)-pow((X-(65+18*T))/155,2))+12*exp(-pow((Y-440)/30,2)-pow((X-(300-9*T))/150,2))"
glow="(8+3*sin(T*1.4))*exp(-pow((X-136)/47,2)-pow((Y-141)/57,2))"
particles=[]
for i in range(12):
 x=18+(i*79)%325; y=50+(i*137)%530
 particles.append(f"{48+i%3*12}*exp(-(pow(X-({x}+6*sin(T*0.6+{i})),2)+pow(Y-({y}-{3+i%4}*T),2))/7)")
alpha='+'.join(particles)
filters=[
 '[0:v]scale=720:1280,setsar=1,fps=30,split=2[base][original]',
 f"nullsrc=s=720x1280:r=30:d=8,geq=lum='{xmap}':cb=128:cr=128[xmap]",
 f"nullsrc=s=720x1280:r=30:d=8,geq=lum='{ymap}':cb=128:cr=128[ymap]",
 '[base][xmap][ymap]displace=edge=smear[water]',
 f"nullsrc=s=360x640:r=30:d=8,format=rgba,geq=r=245:g=248:b=255:a='{mist}',scale=720:1280[mist]",
 f"nullsrc=s=360x640:r=30:d=8,format=rgba,geq=r=255:g=222:b=142:a='{glow}',scale=720:1280[glow]",
 f"nullsrc=s=360x640:r=30:d=8,format=rgba,geq=r=255:g=228:b=165:a='{alpha}',scale=720:1280[particles]",
 '[water][glow]overlay=shortest=1[lit]',
 '[lit][mist]overlay=shortest=1[depth]',
 '[depth][particles]overlay=shortest=1,format=yuv420p[finished]',
 '[original]nullsink'
]
(out/'effects.ffgraph').write_text(';\n'.join(filters))
print('Rendering water, glow, layered mist and particles with FFmpeg only',flush=True)
run(['-i',str(source),'-filter_complex_threads','2','-filter_complex',';'.join(filters),'-map','[finished]','-t','8','-an','-c:v','libx264','-preset','fast','-crf','18','-movflags','+faststart',str(out/'effects-demo.mp4')])
run(['-i',str(source),'-i',str(out/'effects-demo.mp4'),'-filter_complex','[0:v]scale=540:960[a];[1:v]scale=540:960[b];[a][b]hstack=inputs=2[v]','-map','[v]','-an','-c:v','libx264','-crf','18','-pix_fmt','yuv420p','-movflags','+faststart',str(out/'before-after.mp4')])
run(['-i',str(out/'before-after.mp4'),'-vf','fps=1/2,scale=540:480,tile=2x2','-frames:v','1',str(out/'contact-sheet.jpg')])
(out/'notes.json').write_text(json.dumps({'source':str(source),'effects':['approved camera glide','masked foreground water displacement','localized soft glow','two drifting foreground mist banks','12 floating light particles'],'notIncluded':['character gestures or blinking','character/background cutout parallax'],'method':'FFmpeg procedural filters only; no API calls','duration':8,'resolution':'720x1280','fps':30,'scope':'Standalone demo; scene-specific effect placement; UI unchanged'},indent=2))
print('Done:',out/'effects-demo.mp4',flush=True)
