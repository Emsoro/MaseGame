param(
    [string]$Config = "Release",
    [string]$Generator = "Visual Studio 17 2022",
    [string]$Arch = "x64",
    [switch]$Clean,
    [switch]$DevMode      # 不嵌入前端资源，直接读取 frontend/ 目录，方便调试前端
)

$ErrorActionPreference = "Stop"
$ProjectDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$BuildDir = Join-Path $ProjectDir "build"

if ($Clean -and (Test-Path $BuildDir)) {
    Write-Host "Cleaning build directory..." -ForegroundColor Yellow
    Remove-Item -Recurse -Force $BuildDir
}

# 定位 MSVC 环境
$vsWhere = "${env:ProgramFiles}\Microsoft Visual Studio\2022\Enterprise\VC\Auxiliary\Build\vcvarsall.bat"
if (-not (Test-Path $vsWhere)) {
    $vsWhere = "${env:ProgramFiles}\Microsoft Visual Studio\2022\Community\VC\Auxiliary\Build\vcvarsall.bat"
}
if (-not (Test-Path $vsWhere)) {
    $vsWhere = "${env:ProgramFiles}\Microsoft Visual Studio\2022\Professional\VC\Auxiliary\Build\vcvarsall.bat"
}
if (-not (Test-Path $vsWhere)) {
    Write-Error "Visual Studio 2022 not found. Please install VS 2022 with C++ workload."
    exit 1
}

$cmakeArgs = @("-G", $Generator, "-A", $Arch, "-B", $BuildDir, "-S", $ProjectDir)
if ($DevMode) {
    $cmakeArgs += "-DEMBED_FRONTEND=OFF"
    Write-Host "Dev mode: frontend loaded from ./frontend (no rebuild needed for UI tweaks)" -ForegroundColor Yellow
}

Write-Host "Configuring: $Generator / $Arch / $Config" -ForegroundColor Cyan
& $vsWhere $Arch
cmake @cmakeArgs
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Building $Config..." -ForegroundColor Cyan
cmake --build $BuildDir --config $Config
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Build succeeded: $BuildDir\$Config\MazeGame.exe" -ForegroundColor Green
