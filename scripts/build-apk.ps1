$ErrorActionPreference = "Continue"
$ProgressPreference = "SilentlyContinue"

$root   = "C:\prestamos-pwa"
$proj   = "$root\android\project"
$sdkBase= "C:\mantenimiento-pwa\android\sdk"
$bt     = "$sdkBase\android-15"
$plat   = "$sdkBase\android-35\android.jar"
$out    = "$root\android\out"
$build  = "$root\android\build"

$javac8 = "C:\Program Files\Eclipse Foundation\jdk-8.0.302.8-hotspot\bin\javac.exe"
$jdk17  = "$sdkBase\jdk\jdk-17.0.20+8"
$env:JAVA_HOME = $jdk17
$env:Path = "$jdk17\bin;$env:Path"

New-Item -ItemType Directory -Force -Path $out, $build | Out-Null

Write-Host "== 1/6 Resources =="
& "$bt\aapt2.exe" compile --dir "$proj\res" -o "$build\compiled_res.zip"
if ($LASTEXITCODE -ne 0) { throw "aapt2 compile failed" }

Remove-Item "$build\gen" -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path "$build\gen" | Out-Null

& "$bt\aapt2.exe" link -o "$build\base.apk" -I $plat --manifest "$proj\AndroidManifest.xml" --java "$build\gen" "$build\compiled_res.zip" --auto-add-overlay
if ($LASTEXITCODE -ne 0) { throw "aapt2 link failed" }

Write-Host "== 2/6 Java =="
Remove-Item "$build\classes" -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path "$build\classes" | Out-Null
$srcFiles = Get-ChildItem "$proj\src" -Recurse -Filter *.java | ForEach-Object { $_.FullName }
$genFiles = Get-ChildItem "$build\gen" -Recurse -Filter *.java | ForEach-Object { $_.FullName }
$allFiles = @($srcFiles) + @($genFiles)
if (-not $allFiles) { throw "No .java files" }
& $javac8 -source 8 -target 8 -encoding UTF-8 -bootclasspath $plat -classpath $plat -d "$build\classes" $allFiles 2>&1 | ForEach-Object { $_.ToString() }
if ($LASTEXITCODE -ne 0) { throw "javac failed" }

Write-Host "== 3/6 Dex =="
Remove-Item "$build\dex" -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path "$build\dex" | Out-Null
$jarFile = "$build\classes.jar"
Remove-Item $jarFile -Force -ErrorAction SilentlyContinue
& "$jdk17\bin\jar.exe" cf $jarFile -C "$build\classes" .
if ($LASTEXITCODE -ne 0) { throw "jar failed" }
& "$bt\d8.bat" --release --lib $plat --min-api 24 --output "$build\dex" $jarFile
if ($LASTEXITCODE -ne 0) { throw "d8 failed" }

Write-Host "== 4/6 Package dex + assets =="
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::Open("$build\base.apk", [System.IO.Compression.ZipArchiveMode]::Update)

$entry = $zip.CreateEntry("classes.dex", [System.IO.Compression.CompressionLevel]::Optimal)
$es = $entry.Open()
$fs = [System.IO.File]::OpenRead("$build\dex\classes.dex")
$fs.CopyTo($es)
$es.Dispose(); $fs.Dispose()

$assetsDir = "$proj\assets"
Get-ChildItem $assetsDir -Recurse -File | ForEach-Object {
    $rel = $_.FullName.Substring($assetsDir.Length + 1).Replace("\", "/")
    $entry = $zip.CreateEntry("assets/$rel", [System.IO.Compression.CompressionLevel]::Optimal)
    $es = $entry.Open()
    $fs = [System.IO.File]::OpenRead($_.FullName)
    $fs.CopyTo($es)
    $es.Dispose(); $fs.Dispose()
    Write-Host "  Added: assets/$rel"
}
$zip.Dispose()

Write-Host "== 5/6 zipalign + sign =="
& "$bt\zipalign.exe" -f 4 "$build\base.apk" "$out\aligned.apk"
if ($LASTEXITCODE -ne 0) { throw "zipalign failed" }

$ks = "$root\android\prestamos.keystore"
if (-not (Test-Path $ks)) {
  & keytool -genkeypair -v -keystore $ks -alias prestamos -keyalg RSA -keysize 2048 -validity 10950 `
    -storepass prestamos2026 -keypass prestamos2026 `
    -dname "CN=Prestamos, OU=IT, O=App, L=Ciudad, ST=Estado, C=MX"
  if ($LASTEXITCODE -ne 0) { throw "keytool failed" }
}
& "$bt\apksigner.bat" sign --ks $ks --ks-key-alias prestamos --ks-pass pass:prestamos2026 `
  --key-pass pass:prestamos2026 --out "$root\android\Prestamos.apk" "$out\aligned.apk"
if ($LASTEXITCODE -ne 0) { throw "apksigner failed" }

Write-Host "== 6/6 Verify =="
& "$bt\apksigner.bat" verify "$root\android\Prestamos.apk"
if ($LASTEXITCODE -ne 0) { throw "verify failed" }

$f = Get-Item "$root\android\Prestamos.apk"
Write-Host ""
Write-Host "==========================================="
Write-Host " APK: $($f.FullName)"
Write-Host " Size: $([math]::Round($f.Length/1KB,0)) KB"
Write-Host "==========================================="
