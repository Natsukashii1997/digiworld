import { spawn } from 'node:child_process';
import {resolveExecutable,launchError} from './executable.mjs';
import { createWriteStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { filterRelayText } from '../src/relay-prompt.js';

export const REA_BOOTSTRAP_VERSION = '6.4.0';
export const REA_METADATA_BYTES = 8 * 1024 * 1024;
export const validVersion = v => typeof v === 'string' && /^\d+\.\d+\.\d+$/.test(v);
export const reaError = (kind, message, code = '') => Object.assign(new Error(message), { kind, code });
export const safeLine = (value, limit = 2000) => filterRelayText(String(value).replace(/[\x00-\x08\x0b-\x1f\x7f]/g, '')).text.slice(0, limit);
export function createReaProcess({ command = 'npx', prefix = [], spawnProcess = spawn, killGraceMs = 800, executableOptions = {} } = {}) {
  return async function execute(version, args, output, { signal, onLine = () => {}, offline = false, registry, environment, displayCommand } = {}) {
    if (!validVersion(version)) throw reaError('version', 'REA 注册版本未知或未固定，请先检查 REA');
    if (signal?.aborted) throw signal.reason;
    const argv = [...prefix, ...(registry ? ["--registry=" + registry] : []), ...(offline ? ['--offline'] : []), '-y', `rea-agents@${version}`, ...args, '--json'];
    const resolved = await resolveExecutable(command, {...executableOptions, environment: environment || process.env});
    signal?.throwIfAborted();
    const fullCommand = '$ ' + [resolved.command, ...argv].map(a => JSON.stringify(a)).join(' ');
    onLine(displayCommand || fullCommand, displayCommand ? { detail: fullCommand } : undefined);
    const child = spawnProcess(resolved.command, argv, { shell: false, detached: true, env: resolved.environment, stdio: ['ignore', 'pipe', 'pipe'] });
    let timer, killed, finishKill, last = '', stderr = '', overflow = false, ioError, spawnError;
    const kill = () => {
      try { process.kill(-child.pid, 'SIGTERM'); } catch { child.kill('SIGTERM'); }
      if (!killed) { killed = new Promise(resolve => { finishKill = resolve; });
        timer = setTimeout(() => { try { process.kill(-child.pid, 'SIGKILL'); } catch { child.kill('SIGKILL'); } finishKill(); }, killGraceMs); }
    };
    signal?.addEventListener('abort', kill, { once: true });
    const closed = new Promise(resolve => {
      child.on('error', e => { spawnError = e; });
      child.on('close', (code, sig) => resolve({ code, sig }));
    });
    child.stderr.setEncoding('utf8');
    let previousPhase = null;
    const line = value => {
      let progress;
      try { progress = JSON.parse(value).rea_progress; } catch { /* plain CLI error */ }
      let message = value, phase = null;
      if (progress && typeof progress.phase === 'string' && /^[a-z_]{1,80}$/.test(progress.phase)) {
        if (progress.phase === 'parse_javascript_source') {
          // REA 6.4 emits completed=0,total=1 here; the source index is in message.
          const match = typeof progress.message === 'string' && progress.message.match(/\((\d+)\/(\d+)\)\s*$/);
          const current = match ? Number(match[1]) : NaN, total = match ? Number(match[2]) : NaN;
          if (Number.isSafeInteger(current) && Number.isSafeInteger(total) && total > 0 && current >= 0 && current <= total) {
            phase = progress.phase; message = `解析源文件 ${current.toLocaleString('en-US')} / ${total.toLocaleString('en-US')}`;
          }
        } else {
          phase = progress.phase;
          message = `${phase} ${progress.completed ?? ''}/${progress.total ?? ''} ${progress.message || ''}`;
        }
      }
      onLine(safeLine(message), { replace: !!phase && previousPhase === phase });
      previousPhase = phase;
    };
    child.stderr.on('data', chunk => {

      for (const part of chunk.split(/(?<=\n)/)) {
        if (last.length + part.length > 8000) overflow = true;
        if (!overflow) last += part;
        if (part.endsWith('\n')) { const message = overflow ? '[REA输出行过长，已省略]' : last.trimEnd(); line(message); stderr = (stderr + safeLine(message) + '\n').slice(-16000); last = ''; overflow = false; }
      }
    });
    const written = pipeline(child.stdout, createWriteStream(output, { flags: 'wx', mode: 0o600 }))
      .catch(error => { ioError = error; kill(); });
    const exit = await closed; await written;
    if (killed) await killed;
    clearTimeout(timer); signal?.removeEventListener('abort', kill);
    if (overflow) line('[REA输出行过长，已省略]'); else if (last) { line(last); stderr += safeLine(last); }
    if (signal?.aborted) throw signal.reason;
    if (ioError) throw reaError('disk', 'REA 证据写盘失败：' + ioError.code, ioError.code);
    if (spawnError) throw launchError(command, spawnError.code);
    if (exit.code !== 0) {
      let body;
      const size = (await stat(output)).size;
      if (args[0] === 'doctor' && size > REA_METADATA_BYTES) throw reaError('version', 'REA doctor输出超过读取上限');
      if (size <= REA_METADATA_BYTES) { try { body = JSON.parse(await readFile(output, 'utf8')); } catch { /* npm diagnostics */ } }
      // doctor can report environment issues with exit 1 and still carry identity.
      if (args[0] === 'doctor' && body?.identity) return body;
      throw reaError(body?.code ? 'rea' : 'download', safeLine(body?.message || stderr || `REA 退出 ${exit.code}`), body?.code || String(exit.code));
    }
    return null;
  };
}

export function registeredVersion(doctor) {
  const registrations = ['claude_code', 'codex'].map(client => {
    const r = doctor?.identity?.registrations?.find(r => r.client === client);
    const version = r?.command?.map(String).join(' ').match(/(?:^|\s)rea-agents@(\d+\.\d+\.\d+)(?=\s|$)/)?.[1];
    return { client, version: version || null, state: ['aligned','missing','mismatch','stale','unregistered'].includes(r?.state) ? r.state : 'unknown' };
  });
  const aligned = registrations.every(r => r.version && r.state === 'aligned') && registrations[0].version === registrations[1].version;
  return { version: aligned ? registrations[0].version : null, registrations,
    skillVersion: /^[0-9.]{1,32}$/.test(String(doctor?.identity?.skill?.installed_version)) ? String(doctor.identity.skill.installed_version) : null, expectedSkillVersion: /^[0-9.]{1,32}$/.test(String(doctor?.identity?.expected_skill_version)) ? String(doctor.identity.expected_skill_version) : null };
}

// An older doctor reports newer registrations as mismatched. Re-probe their
// common pinned version offline before deciding whether they are aligned.
export async function readRegisteredDoctor(read,initialVersion=REA_BOOTSTRAP_VERSION){
 let raw=await read(initialVersion);const initial=registeredVersion(raw);
 const versions=initial.registrations.map(r=>r.version);
 if(versions[0]&&versions[0]===versions[1]&&versions[0]!==initialVersion)raw=await read(versions[0]);
 return raw;
}
