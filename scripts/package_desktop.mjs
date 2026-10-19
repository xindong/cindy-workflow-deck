// Package the already installed Electron runtime; no dependency on Cindy.
import { cp, mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
const root = resolve(import.meta.dirname, '..');
if (!['darwin','win32'].includes(process.platform)) throw new Error('桌面打包支持 macOS 和 Windows，请在目标平台运行此入口。');
const runtime = createRequire(import.meta.url)('electron');
const version = JSON.parse(await readFile(join(root,'package.json'),'utf8')).version;
const name = '极心许愿-' + version + '-' + (process.platform === 'darwin' ? 'mac' : 'windows') + '-' + process.arch;
const destination = join(root,'desktop-builds',name + (process.platform === 'darwin' ? '.app' : ''));
await mkdir(dirname(destination), { recursive: true });
await mkdir(destination, { recursive: false });
await cp(process.platform === 'darwin' ? resolve(dirname(runtime),'../..') : dirname(runtime),destination,{recursive:true,verbatimSymlinks:true});
if (process.platform === 'win32') await rename(join(destination,'electron.exe'),join(destination,'极心许愿.exe'));
const resources = join(destination,process.platform === 'darwin' ? 'Contents/Resources/app' : 'resources/app');
await mkdir(resources,{recursive:true});
for (const directory of ['desktop','plugin']) await cp(join(root,directory),join(resources,directory),{recursive:true,filter:source=>!source.endsWith('.cindy')});
await writeFile(join(resources,'package.json'),JSON.stringify({name:'jixin-make-a-wish',productName:'极心许愿',version,type:'module',main:'desktop/main.cjs'}));
if (process.platform === 'darwin') {
await rename(join(destination,'Contents/MacOS/Electron'),join(destination,'Contents/MacOS/极心许愿'));
execFileSync('/usr/libexec/PlistBuddy',['-c','Set :CFBundleExecutable 极心许愿',join(destination,'Contents/Info.plist')]);
execFileSync('/usr/libexec/PlistBuddy',['-c','Set :CFBundleDisplayName 极心许愿',join(destination,'Contents/Info.plist')]);
execFileSync('/usr/libexec/PlistBuddy',['-c','Set :CFBundleName 极心许愿',join(destination,'Contents/Info.plist')]);
execFileSync('/usr/libexec/PlistBuddy',['-c','Set :CFBundleIdentifier com.jixin.makeawish',join(destination,'Contents/Info.plist')]);
execFileSync('/usr/libexec/PlistBuddy',['-c','Set :CFBundleShortVersionString ' + version,join(destination,'Contents/Info.plist')]);
// Modified bundle must receive a new ad-hoc signature; this is not notarization.
execFileSync('/usr/bin/codesign',['--force','--deep','--sign','-',destination],{stdio:'inherit'});
execFileSync('/usr/bin/codesign',['--verify','--deep','--strict',destination],{stdio:'inherit'});
}
const archive = join(root,'desktop-builds',name + '.zip');
if (process.platform === 'darwin') execFileSync('/usr/bin/ditto',['-c','-k','--sequesterRsrc','--keepParent',destination,archive]);
else execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',"$ErrorActionPreference = 'Stop'; Compress-Archive -LiteralPath $env:JIXIN_ARCHIVE_SOURCE -DestinationPath $env:JIXIN_ARCHIVE_DESTINATION"],{stdio:'inherit',env:{...process.env,JIXIN_ARCHIVE_SOURCE:destination,JIXIN_ARCHIVE_DESTINATION:archive}});
console.log(archive);
