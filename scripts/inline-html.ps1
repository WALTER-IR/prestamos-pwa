$ErrorActionPreference = "Stop"
$root = "C:\prestamos-pwa"
$app = "$root\app"
$dest = "$root\android\project\assets\www"

$css = Get-Content "$app\css\styles.css" -Raw
$config = Get-Content "$app\js\config.js" -Raw
$db = Get-Content "$app\js\db.js" -Raw
$appjs = Get-Content "$app\js\app.js" -Raw

$html = Get-Content "$app\index.html" -Raw

$html = $html -replace '<link rel="stylesheet" href="css/styles.css"/>', "<style>$css</style>"
$html = $html -replace '<script src="js/config.js"></script>', "<script>$config</script>"
$html = $html -replace '<script src="js/db.js"></script>', "<script>$db</script>"
$html = $html -replace '<script src="js/app.js"></script>', "<script>$appjs</script>"
$html = $html -replace '<link rel="manifest" href="manifest.webmanifest"/>', ''
$html = $html -replace '<link rel="icon" type="image/png" href="icons/icon-192.png"/>', ''

[System.IO.File]::WriteAllText("$dest\index.html", $html, (New-Object System.Text.UTF8Encoding $false))

Write-Host "Inline HTML generated: $dest\index.html"
$f = Get-Item "$dest\index.html"
Write-Host "Size: $([math]::Round($f.Length/1KB,1)) KB"
