// ZIP creation uses archiver already installed by Firebase CLI. No policy change.
import {createRequire} from 'node:module'
import {createWriteStream,readFileSync,writeFileSync} from 'node:fs'
import {execFileSync} from 'node:child_process'
import {resolve,sep} from 'node:path'
import assert from 'node:assert/strict'
const require=createRequire(import.meta.url)
const archiver=require('archiver')
const root=resolve('.'),manifestPath='docs/evidence/inspire-review/package-manifest.json'
const manifest=JSON.parse(readFileSync(manifestPath,'utf8'))
const archive=archiver('zip',{zlib:{level:9}})
const output=createWriteStream('INSPIRE-review-2026-11-09.zip',{flags:'wx'})
const done=new Promise((finish,reject)=>{output.on('close',finish);output.on('error',reject);archive.on('error',reject);archive.on('warning',reject)})
archive.pipe(output)
for(const relative of [...manifest.files.map(file=>file.relativePath),manifestPath]){
  const absolute=resolve(relative)
  assert.ok(absolute.startsWith(root+sep),'Refuse path outside workspace')
  archive.file(absolute,{name:relative})
}
await archive.finalize();await done
// Independent, read-only .NET ZIP verification through normal PowerShell commands.
// No script-file execution, execution-policy bypass or security setting change.
const verify=String.raw`
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$manifestPath='docs/evidence/inspire-review/package-manifest.json'
$manifest=Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
$target='INSPIRE-review-2026-11-09.zip'
$zip=[IO.Compression.ZipFile]::OpenRead((Join-Path (Get-Location) $target))
try {
  $paths=@($manifest.files | ForEach-Object { $_.relativePath }) + @($manifestPath)
  if($zip.Entries.Count -ne $paths.Count){throw 'ZIP entry count mismatch'}
  foreach($entry in $zip.Entries){if($entry.FullName -notin $paths){throw 'Unexpected ZIP entry'}}
  foreach($relative in $paths){
    $entry=$zip.GetEntry($relative)
    if(-not $entry){throw 'Missing ZIP entry'}
    $stream=$entry.Open();$sha=[Security.Cryptography.SHA256]::Create()
    try {$digest=[BitConverter]::ToString($sha.ComputeHash($stream)).Replace('-','').ToLowerInvariant()}
    finally {$sha.Dispose();$stream.Dispose()}
    if($relative -eq $manifestPath){$expected=(Get-FileHash -LiteralPath $manifestPath -Algorithm SHA256).Hash.ToLowerInvariant()}
    else {$record=$manifest.files | Where-Object {$_.relativePath -eq $relative};$expected=$record.sha256;if($entry.Length -ne $record.bytes){throw 'ZIP byte-size mismatch'}}
    if($digest -ne $expected){throw ('ZIP hash mismatch: '+$relative)}
  }
} finally {$zip.Dispose()}
@{executed=$true;independentReader='.NET ZipArchive';entriesVerified=$paths.Count;allPayloadHashesMatch=$true;sha256=(Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLowerInvariant();archive=$target;bytes=(Get-Item -LiteralPath $target).Length} | ConvertTo-Json -Compress
`
const result=JSON.parse(execFileSync('powershell.exe',['-NoProfile','-Command',verify],{encoding:'utf8'}))
writeFileSync('docs/evidence/inspire-review/zip-audit.json',JSON.stringify(result,null,2))
console.log(JSON.stringify(result))
