# ============================================================
# SandTogether - co-op multiplayer mod for Sandustry
# Author / Autor: KAMIL PADULA
# Self-contained installer: no Node.js, no internet required (uses the game's own
# runtime for the shared patcher, else its built-in PowerShell patcher).
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

# --- 3b. start from a pristine bundle.js ------------------------------------
# The installer patches bundle.js IN PLACE, so every subsequent run used to find its own earlier
# patches already there. Until now that was worked around with extra anchor variants "from one mod
# version to the next", which had to be added on EVERY hook change and carry no meaning beyond the
# history of our own testing. Instead we keep a pristine copy of bundle.js next to it and start from
# that copy every time, which leaves patches.json with variants for DIFFERENT GAME VERSIONS only.
# When Steam replaces app.asar the "app" folder is deleted and unpacked again, so the pristine copy
# disappears with it and is recreated from the current build - no extra handling needed.
$bjs  = "$res\app\dist\js\bundle.js"
$borig = "$res\app\dist\js\bundle.js.orig"
if (Test-Path $bjs) {
    if (Test-Path $borig) {
        Copy-Item $borig $bjs -Force
        Write-Host "[i] bundle.js restored from the pristine copy"
    } else {
        $probe = [System.IO.File]::ReadAllText($bjs)
        if ($probe.Contains('window.SandTogether')) {
            # the state from before this change: bundle already patched, no pristine copy yet.
            # We restore the clean file from the app.asar backup the installer sets aside on its first run.
            if (Test-Path "$res\app.asar.bak") {
                Write-Host "[i] bundle.js was already patched and there is no pristine copy - unpacking a clean one from app.asar.bak..." -ForegroundColor Yellow
                Extract-Asar "$res\app.asar.bak" "$res\app" "$res\app.asar.unpacked"
                Copy-Item $bjs $borig -Force
            } else {
                Write-Host "[!] bundle.js is patched, no pristine copy and no app.asar.bak - verify the game files in Steam and run the installer again" -ForegroundColor Red
            }
        } else {
            Copy-Item $bjs $borig -Force
            Write-Host "[i] pristine bundle.js copy saved"
        }
    }
}

# --- 4. Version check -------------------------------------------------------
$patches = Get-Content "$PSScriptRoot\src\patches.json" -Raw -Encoding UTF8 | ConvertFrom-Json
try {
    $gv = (Get-Content "$res\app\package.json" -Raw | ConvertFrom-Json).version
    Write-Host "Game build: $gv (mod supports: $($patches.supportedVersions -join ', '))"
    # the MOD version we are installing: without it a stale Steam Workshop copy is invisible
    try {
        $head = (Get-Content "$PSScriptRoot\src\sandtogether.js" -TotalCount 40) -join "`n"   # -Raw and -TotalCount are mutually exclusive
        $mv = [regex]::Match($head, 'const VER = "([^"]+)"')
        if ($mv.Success) { Write-Host "Mod version: $($mv.Groups[1].Value)   (installing from $PSScriptRoot)" -ForegroundColor Cyan }
    } catch {}
} catch {}

# --- 5. Shared patcher: src\patch.js, the engine the other installers and the auto-updater use ---
# Runs under the game's own Electron as Node, else a node on PATH. patch.js writes its report file
# as soon as it starts; no report means it never ran, and steps 6-10 below do the work instead.
function Show-Done {
    Write-Host ""
    Write-Host "=== DONE! SandTogether installed. ===" -ForegroundColor Green
    Write-Host "Launch Sandustry from Steam. The SandTogether panel appears top-right (click its header or Ctrl+Shift+H to hide)."
    Write-Host "TIP: if Steam keeps updating the game and reverting the mod, set Steam -> Sandustry -> Properties -> Updates -> 'Only update on launch', and launch via SandTogether-START.bat."
    Write-Host "Uninstall: Steam -> Sandustry -> Properties -> Installed Files -> Verify integrity, then delete resources\app."
    if ($Host.Name -eq "ConsoleHost") { Read-Host "Press Enter to close" }
}

# Electron fuse wire: sentinel, version byte (1), length byte, then one byte per fuse.
# Fuse 0 is RunAsNode: '1' = the exe runs scripts with ELECTRON_RUN_AS_NODE, anything else = it would start the game.
function Test-RunAsNode($exe) {
    if (-not (Test-Path $exe)) { return $false }
    $sentinel = 'dL7pKGdnNz796PbbjQWNKmHXBZaB9tsX'
    $enc = [System.Text.Encoding]::GetEncoding(28591)
    $fs = [System.IO.File]::OpenRead($exe)
    try {
        $buf = New-Object byte[] (8MB)
        $carry = ''
        while (($n = $fs.Read($buf, 0, $buf.Length)) -gt 0) {
            $text = $carry + $enc.GetString($buf, 0, $n)
            $i = $text.IndexOf($sentinel, [System.StringComparison]::Ordinal)
            if ($i -ge 0 -and $i + $sentinel.Length + 2 -lt $text.Length) {
                $w = $i + $sentinel.Length
                return (([int]$text[$w] -eq 1) -and ([int]$text[$w + 2] -eq 0x31))
            }
            $carry = $text.Substring([Math]::Max(0, $text.Length - 64))
        }
    } finally { $fs.Close() }
    return $false
}

function Invoke-SharedPatcher($runtime, $asNode) {
    $report = Join-Path $env:TEMP ("sandtogether-patch-" + $PID + ".json")
    Remove-Item $report, "$report.out", "$report.err" -ErrorAction SilentlyContinue
    $argList = @("`"$PSScriptRoot\src\patch.js`"", "`"$res\app`"", '--report', "`"$report`"")
    $prev = $env:ELECTRON_RUN_AS_NODE
    if ($asNode) { $env:ELECTRON_RUN_AS_NODE = '1' }
    try {
        $p = Start-Process -FilePath $runtime -ArgumentList $argList -NoNewWindow -PassThru -RedirectStandardOutput "$report.out" -RedirectStandardError "$report.err"
        $null = $p.Handle   # keeps ExitCode readable after the process ends
        if (-not $p.WaitForExit(90000)) { try { $p.Kill() } catch {}; Write-Host "[!] patcher did not finish within 90 s - stopped" -ForegroundColor Yellow }
    } catch { Write-Host "[!] could not run $runtime : $($_.Exception.Message)" -ForegroundColor Yellow; return $null }
    finally { $env:ELECTRON_RUN_AS_NODE = $prev }
    if (Test-Path "$report.out") { Get-Content "$report.out" | ForEach-Object { Write-Host $_ } }
    if (Test-Path "$report.err") { Get-Content "$report.err" | ForEach-Object { Write-Host $_ -ForegroundColor Yellow } }
    if (-not (Test-Path $report)) { return $null }
    $r = Get-Content $report -Raw | ConvertFrom-Json
    $r | Add-Member -NotePropertyName exitCode -NotePropertyValue $p.ExitCode
    return $r
}

$shared = $null
if ($env:ST_PS_PATCHER -ne '1') {
    if (Test-RunAsNode "$gamePath\Sandustry.exe") { Write-Host "Patching with the game's runtime..."; $shared = Invoke-SharedPatcher "$gamePath\Sandustry.exe" $true }
    else { Write-Host "[i] Sandustry.exe can't run scripts (RunAsNode fuse off or not found)" }
    $nodeCmd = Get-Command node -ErrorAction SilentlyContinue
    if (-not $shared -and $nodeCmd) { Write-Host "Patching with node ($($nodeCmd.Source))..."; $shared = Invoke-SharedPatcher $nodeCmd.Source $false }
}
if ($shared -and $shared.ok -and $shared.exitCode -eq 0) { Show-Done; exit 0 }
if ($shared -and $shared.error) { Fail $shared.error }
if ($shared) { Write-Host "[!] the shared patcher stopped without a result - using the built-in PowerShell patcher" -ForegroundColor Yellow }
else { Write-Host "[i] using the built-in PowerShell patcher" }

# --- 6. Copy mod files ------------------------------------------------------
Copy-Item "$PSScriptRoot\src\sandtogether.js" "$res\app\dist\js\sandtogether.js" -Force
Copy-Item "$PSScriptRoot\src\st-main.js" "$res\app\st-main.js" -Force
Copy-Item "$PSScriptRoot\src\st-patch-engine.js" "$res\app\st-patch-engine.js" -Force
Write-Host "[+] mod files copied"

# --- 7. index.html ----------------------------------------------------------
$p = "$res\app\dist\index.html"
$s = [System.IO.File]::ReadAllText($p)
if ($s.Contains("js/sandtogether.js")) { Write-Host "[=] index.html (already patched)" }
else {
    $s = $s.Replace('<script type="module" src="js/bundle.js"></script>', "<script src=""js/sandtogether.js""></script>`n    <script type=""module"" src=""js/bundle.js""></script>")
    if (-not $s.Contains("js/sandtogether.js")) { Fail "index.html anchor not found" }
    [System.IO.File]::WriteAllText($p, $s)
    Write-Host "[+] index.html"
}

# --- 8. preload.js ----------------------------------------------------------
$p = "$res\app\preload.js"
$s = [System.IO.File]::ReadAllText($p)
if ($s.Contains("sandtogetherNet")) { Write-Host "[=] preload.js (already patched)" }
else {
    $s += "`n" + [System.IO.File]::ReadAllText("$PSScriptRoot\src\st-preload-append.js")
    [System.IO.File]::WriteAllText($p, $s)
    Write-Host "[+] preload.js"
}

# --- 9. main.js -------------------------------------------------------------
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

# --- 10. bundle.js anchor patches (multi-version: tries each variant) --------
$p = "$res\app\dist\js\bundle.js"
$s = [System.IO.File]::ReadAllText($p)

# Steam sometimes ships a RE-MINIFIED bundle for the same game version: identical code,
# but the FH module alias is renamed (e.g. "ie.FH" -> "se.FH") so every literal anchor
# misses and the installer wrongly says "NOT supported". Detect the alias from the bundle
# itself; when the literal anchor misses, retry with "ie.FH" rewritten to the real alias.
$fhAlias = $null
foreach ($mFH in [regex]::Matches($s, '([A-Za-z_$][A-Za-z0-9_$]{0,3})\.FH\.events\.emit\(')) {
    # must work on an ALREADY-PATCHED bundle too (the vanilla emit(e,"...") form is gone then)
    $tail = $s.Substring($mFH.Index, [Math]::Min(220, $s.Length - $mFH.Index))
    if ($tail.Contains('"frame:update"')) { $fhAlias = $mFH.Groups[1].Value; break }
}
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
if ($featureMiss -gt 8) {
    Write-Host "WARNING: $featureMiss features did not match this game build - the game likely updated and the mod needs a new release." -ForegroundColor Red
    Write-Host "Co-op will connect, but many tools will NOT sync. Check the Workshop page for a mod update and re-run install.bat after updating." -ForegroundColor Red
} elseif ($featureMiss -gt 0) { Write-Host "Note: $featureMiss optional feature(s) not available on this game build, but co-op will work." -ForegroundColor Yellow }

Show-Done
