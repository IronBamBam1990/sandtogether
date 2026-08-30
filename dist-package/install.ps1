# ============================================================
# SandTogether - co-op multiplayer mod for Sandustry
# Author / Autor: KAMIL PADULA
# Self-contained installer: no Node.js, no internet required.
# Run install.bat (recommended) or right-click -> Run with PowerShell
# ============================================================

$ErrorActionPreference = "Stop"
Write-Host ""
Write-Host "=== SandTogether installer (by Kamil Padula) ===" -ForegroundColor Yellow
Write-Host ""

function Fail($msg) {
    Write-Host ""
    Write-Host "ERROR: $msg" -ForegroundColor Red
    Write-Host "Send a screenshot of this window to the mod author for help." -ForegroundColor Yellow
    if ($Host.Name -eq "ConsoleHost") { Read-Host "Press Enter to close" }
    exit 1
}

# --- 1. Locate Steam (registry) + all libraries -----------------------------
$steamRoot = $null
try { $steamRoot = (Get-ItemProperty "HKCU:\Software\Valve\Steam" -ErrorAction Stop).SteamPath -replace '/', '\' } catch {}
if (-not $steamRoot -or -not (Test-Path $steamRoot)) { $steamRoot = "C:\Program Files (x86)\Steam" }
Write-Host "Steam: $steamRoot"

$candidates = @("$steamRoot\steamapps\common\Sandustry")
$vdf = "$steamRoot\steamapps\libraryfolders.vdf"
if (Test-Path $vdf) {
    foreach ($m in (Select-String '"path"\s+"(.+?)"' $vdf -AllMatches).Matches) {
        $lib = $m.Groups[1].Value.Replace('\\', '\')
        $candidates += "$lib\steamapps\common\Sandustry"
    }
}
$gamePath = $null
foreach ($c in $candidates) { if (Test-Path "$c\Sandustry.exe") { $gamePath = $c; break } }
if (-not $gamePath) {
    Write-Host "Game not found automatically. Checked:" -ForegroundColor Yellow
    $candidates | ForEach-Object { Write-Host "  $_" }
    $gamePath = Read-Host "Enter the Sandustry folder path (the one with Sandustry.exe)"
    if (-not (Test-Path "$gamePath\Sandustry.exe")) { Fail "No Sandustry.exe in '$gamePath'" }
}
Write-Host "Game: $gamePath" -ForegroundColor Green

# --- 2. Close the game ------------------------------------------------------
Get-Process Sandustry -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue

$res = "$gamePath\resources"

# --- 3. Extract app.asar (pure PowerShell asar reader) ----------------------
function Extract-Asar($asarPath, $outDir, $unpackedDir) {
    Write-Host "Unpacking game code (1-2 minutes)..." -ForegroundColor Yellow
    $bytes = [System.IO.File]::ReadAllBytes($asarPath)
    $headerSize = [System.BitConverter]::ToUInt32($bytes, 4)
    $jsonLen = [System.BitConverter]::ToUInt32($bytes, 12)
    $json = [System.Text.Encoding]::UTF8.GetString($bytes, 16, $jsonLen)
    $index = $json | ConvertFrom-Json
    $base = 8 + $headerSize
    $script:extracted = 0

    function Walk($node, $rel) {
        foreach ($prop in $node.files.PSObject.Properties) {
            $name = $prop.Name
            $child = $prop.Value
            $childRel = if ($rel) { "$rel\$name" } else { $name }
            if ($child.PSObject.Properties['files']) {
                $dir = Join-Path $outDir $childRel
                if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
                Walk $child $childRel
            } else {
                $dest = Join-Path $outDir $childRel
                $destDir = Split-Path $dest -Parent
                if (-not (Test-Path $destDir)) { New-Item -ItemType Directory -Path $destDir -Force | Out-Null }
                if ($child.PSObject.Properties['unpacked'] -and $child.unpacked) {
                    $src = Join-Path $unpackedDir $childRel
                    if (Test-Path $src) { Copy-Item $src $dest -Force }
                } else {
                    $off = $base + [int64]$child.offset
                    $size = [int]$child.size
                    $fs = [System.IO.File]::Open($dest, 'Create', 'Write')
                    $fs.Write($bytes, $off, $size)
                    $fs.Close()
                }
                $script:extracted++
                if ($script:extracted % 200 -eq 0) { Write-Host "  ... $script:extracted files" }
            }
        }
    }
    Walk $index ""
    Write-Host "Unpacked $script:extracted files." -ForegroundColor Green
}

# app.asar PRESENT = Steam (re)placed it — fresh install OR Steam auto-updated the game.
# In both cases re-extract fresh so the unpacked "app" folder matches the CURRENT game build,
# then sideline app.asar so the game loads our patched folder (not the untouched asar).
# (This is the fix for "after install the game is standard/unmodded" — Steam restoring app.asar.)
if (Test-Path "$res\app.asar") {
    if (Test-Path "$res\app") { Write-Host "Steam replaced app.asar - re-extracting fresh to match current build..." -ForegroundColor Yellow; Remove-Item "$res\app" -Recurse -Force }
    Extract-Asar "$res\app.asar" "$res\app" "$res\app.asar.unpacked"
    if (Test-Path "$res\app.asar.bak") { Remove-Item "$res\app.asar.bak" -Force }
    Rename-Item "$res\app.asar" "app.asar.bak"
} elseif (-not (Test-Path "$res\app\main.js")) {
    # no live app.asar and no unpacked folder -> fall back to our backup
    if (Test-Path "$res\app.asar.bak") { Extract-Asar "$res\app.asar.bak" "$res\app" "$res\app.asar.unpacked" }
    else { Fail "app.asar not found in $res (Steam: verify integrity of game files first)" }
}

# --- 4. Version check -------------------------------------------------------
$patches = Get-Content "$PSScriptRoot\src\patches.json" -Raw -Encoding UTF8 | ConvertFrom-Json
try {
    $gv = (Get-Content "$res\app\package.json" -Raw | ConvertFrom-Json).version
    Write-Host "Game build: $gv (mod supports: $($patches.supportedVersions -join ', '))"
} catch {}

# --- 5. Copy mod files ------------------------------------------------------
Copy-Item "$PSScriptRoot\src\sandtogether.js" "$res\app\dist\js\sandtogether.js" -Force
Copy-Item "$PSScriptRoot\src\st-main.js" "$res\app\st-main.js" -Force
Write-Host "[+] mod files copied"

# --- 6. index.html ----------------------------------------------------------
$p = "$res\app\dist\index.html"
$s = [System.IO.File]::ReadAllText($p)
if ($s.Contains("js/sandtogether.js")) { Write-Host "[=] index.html (already patched)" }
else {
    $s = $s.Replace('<script type="module" src="js/bundle.js"></script>', "<script src=""js/sandtogether.js""></script>`n    <script type=""module"" src=""js/bundle.js""></script>")
    if (-not $s.Contains("js/sandtogether.js")) { Fail "index.html anchor not found" }
    [System.IO.File]::WriteAllText($p, $s)
    Write-Host "[+] index.html"
}

# --- 7. preload.js ----------------------------------------------------------
$p = "$res\app\preload.js"
$s = [System.IO.File]::ReadAllText($p)
if ($s.Contains("sandtogetherNet")) { Write-Host "[=] preload.js (already patched)" }
else {
    $s += "`n" + [System.IO.File]::ReadAllText("$PSScriptRoot\src\st-preload-append.js")
    [System.IO.File]::WriteAllText($p, $s)
    Write-Host "[+] preload.js"
}

# --- 8. main.js -------------------------------------------------------------
$p = "$res\app\main.js"
$s = [System.IO.File]::ReadAllText($p)
$MARK_A = "// --- SandTogether init ---"
$MARK_B = "// --- /SandTogether init ---"
$block = @"


$MARK_A
try {
  const _stUd = process.argv.find((a) => a.startsWith('--st-userdata='));
  if (_stUd) { app.setPath('userData', _stUd.split('=')[1]); console.log('[SandTogether] userData override:', _stUd.split('=')[1]); }
} catch (e) { console.error('[SandTogether] userdata error:', e); }
try {
  app.whenReady().then(() => {
    try { require('./st-main.js').init({ getMainWindow: () => mainWindow }); }
    catch (e) { console.error('[SandTogether] init error:', e); }
  });
} catch (e) { console.error('[SandTogether] bootstrap error:', e); }
$MARK_B
"@
$ia = $s.IndexOf($MARK_A)
if ($ia -ge 0) { $ib = $s.IndexOf($MARK_B); $s = $s.Substring(0, $ia).TrimEnd() + $s.Substring($ib + $MARK_B.Length) }
$s += $block
$anchor = $patches.mainJs.singleInstanceAnchor
if ($s.Contains($anchor)) { $s = $s.Replace($anchor, $patches.mainJs.singleInstancePatched) }
[System.IO.File]::WriteAllText($p, $s)
Write-Host "[+] main.js"

# --- 9. bundle.js anchor patches (multi-version: tries each variant) --------
$p = "$res\app\dist\js\bundle.js"
$s = [System.IO.File]::ReadAllText($p)

# Steam sometimes ships a RE-MINIFIED bundle for the same game version: identical code,
# but the FH module alias is renamed (e.g. "ie.FH" -> "se.FH") so every literal anchor
# misses and the installer wrongly says "NOT supported". Detect the alias from the bundle
# itself; when the literal anchor misses, retry with "ie.FH" rewritten to the real alias.
$fhAlias = $null
$mFH = [regex]::Match($s, '([A-Za-z_$][A-Za-z0-9_$]{0,3})\.FH\.events\.emit\(e,"frame:update"')
if ($mFH.Success) { $fhAlias = $mFH.Groups[1].Value }
$adaptAlias = [bool]($fhAlias -and $fhAlias -ne 'ie')
if ($adaptAlias) { Write-Host "[i] FH module alias in this build: '$fhAlias' (re-minified bundle - anchors rewritten from 'ie.FH')" -ForegroundColor Yellow }

$dirty = $false
$criticalFail = $false
$featureMiss = 0
foreach ($pt in $patches.bundle) {
    $applied = $false
    $already = $false
    foreach ($v in $pt.variants) {
        $pairs = @(,@($v.anchor, $v.patched))
        if ($adaptAlias) { $pairs += ,@($v.anchor.Replace('ie.FH', "$fhAlias.FH"), $v.patched.Replace('ie.FH', "$fhAlias.FH")) }
        foreach ($pair in $pairs) {
            $anch = $pair[0]; $patched = $pair[1]
            if ($s.IndexOf($patched, [System.StringComparison]::Ordinal) -ge 0) { $already = $true; break }
            $i1 = $s.IndexOf($anch, [System.StringComparison]::Ordinal)
            if ($i1 -lt 0) { continue }
            $i2 = $s.IndexOf($anch, $i1 + 1, [System.StringComparison]::Ordinal)
            if ($i2 -ge 0) { continue }  # not unique, try next pair/variant
            $s = $s.Substring(0, $i1) + $patched + $s.Substring($i1 + $anch.Length)
            $dirty = $true; $applied = $true
            break
        }
        if ($applied -or $already) { break }
    }
    if ($applied) { Write-Host "[+] bundle: $($pt.name)" }
    elseif ($already) { Write-Host "[=] bundle: $($pt.name) (already patched)" }
    else {
        if ($pt.critical) { Write-Host "[X] bundle: $($pt.name) - NO MATCHING VARIANT (critical)" -ForegroundColor Red; $criticalFail = $true }
        else { Write-Host "[!] bundle: $($pt.name) - not found, feature disabled on this build" -ForegroundColor Yellow; $featureMiss++ }
    }
}
if ($dirty) { [System.IO.File]::WriteAllText($p, $s) }
if ($criticalFail) {
    $aliasInfo = if ($fhAlias) { $fhAlias } else { "?" }
    Fail "This game version is NOT supported by the mod yet (core hook didn't match, even after alias adaptation '$aliasInfo'). Supported: $($patches.supportedVersions -join ', '). Your game may have auto-updated to a newer build. Watch the Workshop page for an update, or opt into a supported version via Steam betas."
}
if ($featureMiss -gt 0) { Write-Host "Note: $featureMiss optional feature(s) not available on this game build, but co-op will work." -ForegroundColor Yellow }

Write-Host ""
Write-Host "=== DONE! SandTogether installed. ===" -ForegroundColor Green
Write-Host "Launch Sandustry from Steam. The SandTogether panel appears top-right (click its header or Ctrl+Shift+H to hide)."
Write-Host "TIP: if Steam keeps updating the game and reverting the mod, set Steam -> Sandustry -> Properties -> Updates -> 'Only update on launch', and launch via SandTogether-START.bat."
Write-Host "Uninstall: Steam -> Sandustry -> Properties -> Installed Files -> Verify integrity, then delete resources\app."
if ($Host.Name -eq "ConsoleHost") { Read-Host "Press Enter to close" }
