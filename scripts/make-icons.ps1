Add-Type -AssemblyName System.Drawing

function New-Icon {
  param([int]$Size, [string]$OutFile, [bool]$Rounded = $true, [double]$SafePad = 0.0)
  $bmp = New-Object System.Drawing.Bitmap($Size, $Size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.Clear([System.Drawing.Color]::Transparent)

  $c1 = [System.Drawing.Color]::FromArgb(255, 109, 40, 217)
  $c2 = [System.Drawing.Color]::FromArgb(255, 168, 85, 247)
  $c3 = [System.Drawing.Color]::FromArgb(255, 192, 132, 252)

  $rect = New-Object System.Drawing.RectangleF(0, 0, $Size, $Size)
  $brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush($rect, $c1, $c3, 45.0)

  if ($Rounded) {
    $rad = $Size * 0.20
    $gp = New-Object System.Drawing.Drawing2D.GraphicsPath
    $d = [single]$rad * 2
    $gp.AddArc(0, 0, $d, $d, 180, 90)
    $gp.AddArc($Size - $d, 0, $d, $d, 270, 90)
    $gp.AddArc($Size - $d, $Size - $d, $d, $d, 0, 90)
    $gp.AddArc(0, $Size - $d, $d, $d, 90, 90)
    $gp.CloseFigure()
    $g.FillPath($brush, $gp)
  } else {
    $g.FillRectangle($brush, $rect)
  }

  $white = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 255, 255, 255))

  $font = New-Object System.Drawing.Font("Arial", ($Size * 0.55), [System.Drawing.FontStyle]::Bold)
  $sf = New-Object System.Drawing.StringFormat
  $sf.Alignment = [System.Drawing.StringAlignment]::Center
  $sf.LineAlignment = [System.Drawing.StringAlignment]::Center
  $g.DrawString("$", $font, $white, $rect, $sf)

  $g.Dispose()
  $bmp.Save($OutFile, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
}

$app = "C:\prestamos-pwa\app\icons"
New-Icon 192 "$app\icon-192.png" $true 0.0
New-Icon 512 "$app\icon-512.png" $true 0.0
New-Icon 32 "$app\favicon-32.png" $true 0.0
Copy-Item "$app\favicon-32.png" "$app\favicon.png" -Force
Copy-Item "$app\icon-192.png" "$app\apple-touch-icon.png" -Force

$mr = "C:\prestamos-pwa\android\project\res"
New-Icon 48  "$mr\mipmap-mdpi\ic_launcher.png" $false 0.05
New-Icon 72  "$mr\mipmap-hdpi\ic_launcher.png" $false 0.05
New-Icon 96  "$mr\mipmap-xhdpi\ic_launcher.png" $false 0.05
New-Icon 144 "$mr\mipmap-xxhdpi\ic_launcher.png" $false 0.05

Write-Output "Iconos generados:"
Get-ChildItem "$app","$mr" -Recurse -Filter *.png | Select-Object FullName, Length
