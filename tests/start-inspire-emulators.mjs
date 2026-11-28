import {existsSync, readdirSync} from 'node:fs'
import {resolve, join, delimiter, win32, posix} from 'node:path'
import {pathToFileURL} from 'node:url'
import {superviseEmulators,requestEmulatorStop} from './inspire-emulator-persistence.mjs'

// Pure construction: platform/FS parameters permit meaningful POSIX tests here.
export function launcherEnvironment(parent, {platform=process.platform, tools=resolve('.tools.local'),
  exists=existsSync, list=readdirSync}={}) {
  const paths=platform==='win32'?win32:posix
  const separator=platform===process.platform?delimiter:paths.delimiter
  const executable=platform==='win32'?'java.exe':'java'
  const env={...parent,XDG_CONFIG_HOME:resolve('.tools.local/firebase-config'),CI:'true',METADATA_SERVER_DETECTION:'none'}
  const jdk=exists(tools)&&list(tools).find(name=>name.startsWith('jdk-21')&&exists(paths.join(tools,name,'bin',executable)))
  if(!env.JAVA_HOME&&jdk)env.JAVA_HOME=paths.join(tools,jdk)
  if(env.JAVA_HOME){
    const pathKey=platform==='win32'?Object.keys(parent).find(key=>key.toLowerCase()==='path')??'PATH':'PATH'
    env[pathKey]=paths.join(env.JAVA_HOME,'bin')+separator+(parent[pathKey]??'')
  }
  return env
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const env=launcherEnvironment(process.env)
  if(process.argv[2]==='--stop')await requestEmulatorStop()
  else await superviseEmulators(env)
}
