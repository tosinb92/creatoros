import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import fs from 'node:fs/promises';
const exec = promisify(execFile);
export async function renderNativeClip({source,output,start,end,watermark=false,captionFile,ffmpeg='ffmpeg',width=1080,height=1920}) {
  if (!source || !output || !Number.isFinite(start) || !Number.isFinite(end) || start<0 || end<=start || end-start>180) throw Error('Invalid render input');
  if (!Number.isInteger(width)||!Number.isInteger(height)||width<128||height<128||width%2||height%2) throw Error('Invalid dimensions');
  const filters=[`scale=${width}:${height}:force_original_aspect_ratio=increase`,`crop=${width}:${height}`,'setsar=1'];
  if (captionFile) { await fs.access(captionFile); filters.push(`ass=${captionFile.replace(/\\/g,'/').replace(/:/g,'\\:').replace(/,/g,'\\,')}`); }
  if (watermark) filters.push(`drawtext=text=CREATOROS:fontcolor=white@0.75:fontsize=${Math.max(18,Math.round(width/22))}:x=w-tw-24:y=24:box=1:boxcolor=black@0.3:boxborderw=8`);
  await exec(ffmpeg,['-hide_banner','-loglevel','error','-y','-ss',String(start),'-i',source,'-t',String(end-start),'-vf',filters.join(','),'-c:v','libx264','-preset','veryfast','-crf','23','-c:a','aac','-movflags','+faststart',output],{maxBuffer:8*1024*1024});
  const stat=await fs.stat(output);
  if (stat.size<1000) throw Error('Rendered MP4 is empty');
  return {path:output,bytes:stat.size,mimeType:'video/mp4'};
}
