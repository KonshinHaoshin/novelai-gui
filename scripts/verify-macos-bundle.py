#!/usr/bin/env python3
"""Verify the shipped app inside a DMG, after Tauri removes its staging app."""
import pathlib
import plistlib
import subprocess
import sys

folder = pathlib.Path(sys.argv[1])
expected_version = sys.argv[2]
images = [p for p in folder.glob('*.dmg') if not p.name.startswith('._')]
if len(images) != 1:
    raise SystemExit(f'Expected one DMG in {folder}, found {len(images)}')
info = plistlib.loads(subprocess.check_output([
    'hdiutil', 'attach', '-readonly', '-nobrowse', '-plist', str(images[0])
]))
mount = next(item['mount-point'] for item in info['system-entities'] if 'mount-point' in item)
try:
    app = pathlib.Path(mount) / 'NovelAI GUI.app'
    subprocess.run(['codesign', '--verify', '--deep', '--strict', '--verbose=2', str(app)], check=True)
    with (app / 'Contents/Info.plist').open('rb') as file:
        version = plistlib.load(file)['CFBundleShortVersionString']
    if version != expected_version:
        raise SystemExit(f'Expected version {expected_version}, got {version}')
    print(f'Verified macOS app signature and version {version}', flush=True)
finally:
    subprocess.run(['hdiutil', 'detach', mount], check=True)
