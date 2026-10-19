// Package the already installed Electron runtime; no dependency on Cindy.
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
const root = resolve(import.meta.dirname, '..');
if (process.platform !== 'darwin') throw new Error('此打包入口当前仅验证过macOS。Windows请用npm run desktop启动，尚未提供经过验证的安装包。');
const runtime = createRequire(import.meta.url)('electron');
const version = JSON.parse(await readFile(join(root,'package.json'),'utf8')).version;
const name = '极心许愿-' + version + '-mac-' + process.arch;
const destination = join(root,'desktop-builds',name + '.app');
await mkdir(dirname(destination), { recursive: true });
await mkdir(destination, { recursive: false });
await cp(resolve(dirname(runtime),'../..'),destination,{recursive:true,verbatimSymlinks:true});
const resources = join(destination,'Contents/Resources/app');
await mkdir(resources,{recursive:true});
for (const directory of ['desktop','plugin']) await cp(join(root,directory),join(resources,directory),{recursive:true,filter:source=>!source.endsWith('.cindy')});
await writeFile(join(resources,'package.json'),JSON.stringify({name:'jixin-make-a-wish',productName:'极心许愿',version,type:'module',main:'desktop/main.cjs'}));
execFileSync('/usr/libexec/PlistBuddy',['-c','Set :CFBundleDisplayName 极心许愿',join(destination,'Contents/Info.plist')]);
execFileSync('/usr/libexec/PlistBuddy',['-c','Set :CFBundleName 极心许愿',join(destination,'Contents/Info.plist')]);
execFileSync('/usr/libexec/PlistBuddy',['-c','Set :CFBundleIdentifier com.jixin.makeawish',join(destination,'Contents/Info.plist')]);
execFileSync('/usr/libexec/PlistBuddy',['-c','Set :CFBundleShortVersionString ' + version,join(destination,'Contents/Info.plist')]);
// Modified bundle must receive a new ad-hoc signature; this is not notarization.
execFileSync('/usr/bin/codesign',['--force','--deep','--sign','-',destination],{stdio:'inherit'});
execFileSync('/usr/bin/codesign',['--verify','--deep','--strict',destination],{stdio:'inherit'});
const archive = join(root,'desktop-builds',name + '.zip');
execFileSync('/usr/bin/ditto',['-c','-k','--sequesterRsrc','--keepParent',destination,archive]);
console.log(archive);
