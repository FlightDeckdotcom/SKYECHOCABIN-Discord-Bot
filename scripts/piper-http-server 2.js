import 'dotenv/config';
import express from 'express';
import { spawn } from 'child_process';
import fs from 'fs/promises';
import { randomUUID } from 'crypto';
const app=express(); app.use(express.json({limit:'2mb'}));
function runPiper(text, model){return new Promise((resolve,reject)=>{const out=`/tmp/piper-${randomUUID()}.wav`; const bin=process.env.PIPER_BINARY||'python3'; const args=bin.includes('python')?['-m','piper','--model',model,'--output_file',out]:['--model',model,'--output_file',out]; const p=spawn(bin,args,{stdio:['pipe','pipe','pipe']}); let err=''; p.stderr.on('data',d=>err+=d); p.on('close',async code=>{if(code!==0)return reject(new Error(err||`piper exited ${code}`)); resolve(await fs.readFile(out));}); p.stdin.write(text); p.stdin.end();});}
app.post('/api/tts',async(req,res)=>{try{const {text,voice}=req.body||{}; const model=voice==='traffic'?(process.env.PIPER_MODEL_TRAFFIC||process.env.PIPER_MODEL):(process.env.PIPER_MODEL_ATC||process.env.PIPER_MODEL); if(!model) throw new Error('No PIPER_MODEL_ATC/PIPER_MODEL configured'); const audio=await runPiper(text||'SkyEcho test.',model); res.setHeader('content-type','audio/wav'); res.send(audio);}catch(e){console.error('[PiperHTTP]',e.message); res.status(500).json({error:e.message});}});
const host=process.env.PIPER_HTTP_HOST||'127.0.0.1'; const port=Number(process.env.PIPER_HTTP_PORT||5000); app.listen(port,host,()=>console.log(`[PiperHTTP] listening at http://${host}:${port}/api/tts model=${process.env.PIPER_MODEL_ATC||process.env.PIPER_MODEL}`));
