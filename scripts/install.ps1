# ──────────────────────────────────────────────────────────
#  OpenMaiWaifu — Install & Setup Script (Windows)
#
#  Usage:
#    irm https://buyve.github.io/OpenMaiWaifu/install.ps1 | iex
#
#  What it does:
#    1. Download the latest release (.msi) for Windows
#    2. Install the app silently
#    3. Interactive CLI setup (name, OpenClaw agent)
#    4. Write firstrun.json so the app skips FTUE
# ──────────────────────────────────────────────────────────

# When piped via irm | iex, stdin is the script itself.
# Save this script to a temp file and re-run it directly so Read-Host works.
if (-not $env:OPENMAIWAIFU_RELAUNCH) {
    $tmpScript = Join-Path $env:TEMP "openmaiwaifu-install.ps1"
    # If we're being piped, $MyInvocation.MyCommand.Path is empty
    if (-not $MyInvocation.MyCommand.Path) {
        $scriptContent = $MyInvocation.MyCommand.ScriptBlock.ToString()
        $scriptContent | Out-File -FilePath $tmpScript -Encoding utf8 -Force
        $env:OPENMAIWAIFU_RELAUNCH = "1"
        & powershell.exe -ExecutionPolicy Bypass -File $tmpScript
        Remove-Item $tmpScript -Force -ErrorAction SilentlyContinue
        $env:OPENMAIWAIFU_RELAUNCH = $null
        exit $LASTEXITCODE
    }
}

$ErrorActionPreference = "Stop"

$REPO = "buyve/OpenMaiWaifu"
$APP_NAME = "OpenMaiWaifu"
$DATA_DIR = Join-Path $env:APPDATA "ai-desktop-companion"
$CONFIG_DIR = Join-Path $env:APPDATA "ai-desktop-companion"

# ── Helpers ──

function Info($msg)  { Write-Host "  > " -ForegroundColor Cyan -NoNewline; Write-Host $msg }
function Ok($msg)    { Write-Host "  + " -ForegroundColor Green -NoNewline; Write-Host $msg }
function Warn($msg)  { Write-Host "  ! " -ForegroundColor Yellow -NoNewline; Write-Host $msg }
function Err($msg)   { Write-Host "  x " -ForegroundColor Red -NoNewline; Write-Host $msg }
function Ask($msg)   { Write-Host "  ? " -ForegroundColor Cyan -NoNewline; Write-Host $msg -NoNewline }

function Banner {
    Write-Host ""
    Write-Host "    +=======================================+" -ForegroundColor Cyan
    Write-Host "    |   OpenMaiWaifu  - Installer   |" -ForegroundColor Cyan
    Write-Host "    +=======================================+" -ForegroundColor Cyan
    Write-Host ""
}

# ── Step 1: Download & Install ──

function Download-And-Install {
    Info "Fetching latest release..."

    $release = Invoke-RestMethod -Uri "https://api.github.com/repos/$REPO/releases/latest" -Headers @{ "User-Agent" = "OpenMaiWaifu-Installer" }
    $tag = $release.tag_name

    if (-not $tag) {
        Err "Could not find latest release. Check https://github.com/$REPO/releases"
        exit 1
    }
    Ok "Latest version: $tag"

    $filename = "AI-Desktop-Companion_${tag}_windows-x86_64.msi"
    $url = "https://github.com/$REPO/releases/download/$tag/$filename"

    $tmpDir = Join-Path $env:TEMP "openmaiwaifu-install"
    if (Test-Path $tmpDir) { Remove-Item $tmpDir -Recurse -Force }
    New-Item -ItemType Directory -Path $tmpDir | Out-Null

    $msiPath = Join-Path $tmpDir $filename

    Info "Downloading $filename..."
    Invoke-WebRequest -Uri $url -OutFile $msiPath -UseBasicParsing
    Ok "Downloaded successfully"

    Info "Installing..."
    $process = Start-Process msiexec.exe -ArgumentList "/i", "`"$msiPath`"", "/quiet", "/norestart" -Wait -PassThru
    if ($process.ExitCode -eq 0) {
        Ok "Installed successfully"
    } else {
        Warn "MSI installer returned exit code $($process.ExitCode). Trying interactive install..."
        Start-Process msiexec.exe -ArgumentList "/i", "`"$msiPath`"" -Wait
    }

    # Cleanup
    Remove-Item $tmpDir -Recurse -Force -ErrorAction SilentlyContinue
}

# ── Step 2: Interactive Setup ──

function Setup-Wizard {
    Write-Host ""
    Write-Host "  -- Setup --" -ForegroundColor White
    Write-Host ""

    # 2a. Choose language
    Info "Choose your language:"
    Write-Host ""
    Write-Host "   1) English"
    Write-Host "   2) Korean"
    Write-Host "   3) Japanese"
    Write-Host "   4) Chinese Simplified"
    Write-Host "   5) Chinese Traditional"
    Write-Host "   6) Spanish"
    Write-Host "   7) French"
    Write-Host "   8) German"
    Write-Host "   9) Portuguese"
    Write-Host "  10) Russian"
    Write-Host ""
    Ask "Enter choice [1]: "
    $langChoice = Read-Host
    if (-not $langChoice) { $langChoice = "1" }

    $langCode = "en"
    $speakingStyle = "Casual English"
    $introLang = "en"

    switch ($langChoice) {
        "1"  { $langCode = "en";    $speakingStyle = "Casual English";              $introLang = "en" }
        "2"  { $langCode = "ko";    $speakingStyle = "Casual Korean";               $introLang = "ko" }
        "3"  { $langCode = "ja";    $speakingStyle = "Casual Japanese";             $introLang = "ja" }
        "4"  { $langCode = "zh-CN"; $speakingStyle = "Casual Simplified Chinese";   $introLang = "zh-CN" }
        "5"  { $langCode = "zh-TW"; $speakingStyle = "Casual Traditional Chinese";  $introLang = "zh-TW" }
        "6"  { $langCode = "es";    $speakingStyle = "Casual Spanish (tuteo)";      $introLang = "es" }
        "7"  { $langCode = "fr";    $speakingStyle = "Casual French (tutoiement)";  $introLang = "fr" }
        "8"  { $langCode = "de";    $speakingStyle = "Casual German (duzen)";       $introLang = "de" }
        "9"  { $langCode = "pt";    $speakingStyle = "Casual Portuguese";           $introLang = "pt" }
        "10" { $langCode = "ru";    $speakingStyle = "Casual Russian";              $introLang = "ru" }
        default { $langCode = "en"; $speakingStyle = "Casual English";              $introLang = "en" }
    }
    Ok "Language: $langCode"
    Write-Host ""

    # 2b. Ask for user name
    $userName = ""
    while (-not $userName) {
        Ask "What's your name?: "
        $userName = (Read-Host).Trim()
    }
    Ok "Nice to meet you, $userName!"

    # 2c. Ask for companion name
    Write-Host ""
    Ask "Name your companion [Companion]: "
    $companionName = (Read-Host).Trim()
    if (-not $companionName) { $companionName = "Companion" }
    Ok "Companion name: $companionName"

    # 2d. Choose personality
    Write-Host ""
    Info "Choose a personality for your companion:"
    Write-Host ""
    Write-Host "  1) Innocent - Pure, cheerful, and adorably naive"
    Write-Host "  2) Cool / Tsundere - Tough on the outside, caring underneath"
    Write-Host "  3) Shy - Introverted, bashful, quietly observant"
    Write-Host "  4) Powerful - Bold, charismatic, full of confidence"
    Write-Host "  5) Ladylike - Elegant, refined, graceful"
    Write-Host "  6) Energetic - Cheerful, lively, always upbeat"
    Write-Host "  7) Flamboyant - Dramatic, extravagant, theatrical"
    Write-Host "  8) Gentleman - Polite, courteous, nobly composed"
    Write-Host ""
    Ask "Enter choice [1]: "
    $personalityChoice = Read-Host
    if (-not $personalityChoice) { $personalityChoice = "1" }

    $personalityType = "innocent"
    $personalityDesc = "Pure, cheerful, and adorably naive. Uses cute expressions and gets excited easily."

    switch ($personalityChoice) {
        "1" { $personalityType = "innocent";   $personalityDesc = "Pure, cheerful, and adorably naive. Uses cute expressions and gets excited easily." }
        "2" { $personalityType = "cool";       $personalityDesc = "Tsundere - tough and sarcastic on the outside, but genuinely caring underneath. Pretends not to care but always worries." }
        "3" { $personalityType = "shy";        $personalityDesc = "Introverted and bashful. Speaks softly, gets flustered easily, but is quietly observant and deeply thoughtful." }
        "4" { $personalityType = "powerful";   $personalityDesc = "Bold and charismatic. Speaks with confidence, takes charge, and radiates strength and determination." }
        "5" { $personalityType = "ladylike";   $personalityDesc = "Elegant and refined. Speaks with grace and poise, values beauty and harmony in everything." }
        "6" { $personalityType = "energetic";  $personalityDesc = "Cheerful and lively. Always upbeat, loves to chat, and brings energy to every conversation." }
        "7" { $personalityType = "flamboyant"; $personalityDesc = "Dramatic and extravagant. Over-the-top expressions, loves attention, and makes everything theatrical." }
        "8" { $personalityType = "gentleman";  $personalityDesc = "Polite and courteous. Speaks formally yet warmly, always considerate and nobly composed." }
        default { }
    }
    Ok "Personality: $personalityType"

    # 2e. Check OpenClaw CLI
    Write-Host ""
    Info "Checking OpenClaw CLI..."

    $openclawCmd = $null
    $openclawInstalled = $false

    # Check common paths
    $candidates = @(
        (Join-Path $env:USERPROFILE ".openclaw\bin\openclaw.exe"),
        (Join-Path $env:LOCALAPPDATA "openclaw\openclaw.exe"),
        "openclaw"
    )

    foreach ($path in $candidates) {
        try {
            $result = & $path --version 2>$null
            if ($LASTEXITCODE -eq 0) {
                $openclawCmd = $path
                $openclawInstalled = $true
                break
            }
        } catch { }
    }

    $agentId = ""
    $setupOpenclaw = $false
    $selectedModel = ""

    if ($openclawInstalled) {
        $version = & $openclawCmd --version 2>$null
        Ok "OpenClaw found: $version"

        # Check if gateway is running
        $gatewayRunning = $false
        try {
            $health = & $openclawCmd health 2>$null
            if ($health -match "ok|healthy|running") { $gatewayRunning = $true }
        } catch { }

        if (-not $gatewayRunning) {
            try {
                $response = Invoke-WebRequest -Uri "http://localhost:18789/health" -UseBasicParsing -TimeoutSec 3 -ErrorAction Stop
                $gatewayRunning = $true
            } catch { }
        }

        if ($gatewayRunning) {
            Ok "OpenClaw gateway is running"

            # ── LLM Authentication ──
            Write-Host ""
            Write-Host "  -- AI Model Setup --" -ForegroundColor White
            Write-Host ""

            $hasAuth = $false
            try {
                $modelsJson = & $openclawCmd models list --json 2>$null | ConvertFrom-Json
                $available = $modelsJson.models | Where-Object { $_.available }
                if ($available) {
                    $hasAuth = $true
                    Ok "LLM already configured:"
                    foreach ($m in $available) {
                        Write-Host "    $($m.key) ($($m.name))"
                    }
                }
            } catch { }

            if (-not $hasAuth) {
                Info "LLM authentication required."
                Write-Host ""
                Write-Host "  1) Anthropic API Key"
                Write-Host "  2) OpenAI API Key"
                Write-Host "  3) Google (Gemini) API Key"
                Write-Host "  4) GitHub Copilot (OAuth login)"
                Write-Host "  5) OpenRouter API Key"
                Write-Host "  6) Skip for now"
                Write-Host ""
                Ask "Enter choice [1]: "
                $authChoice = Read-Host
                if (-not $authChoice) { $authChoice = "1" }

                $authProvider = ""
                $authMethod = "paste-token"

                switch ($authChoice) {
                    "1" { $authProvider = "anthropic" }
                    "2" { $authProvider = "openai" }
                    "3" { $authProvider = "google" }
                    "4" { $authProvider = "github-copilot"; $authMethod = "oauth" }
                    "5" { $authProvider = "openrouter" }
                    "6" { $authProvider = "" }
                    default { $authProvider = "anthropic" }
                }

                if ($authProvider) {
                    if ($authMethod -eq "oauth") {
                        Info "Starting GitHub Copilot OAuth login..."
                        try {
                            & $openclawCmd models auth login-github-copilot 2>&1
                            Ok "GitHub Copilot authenticated!"
                            $hasAuth = $true
                        } catch {
                            Warn "OAuth login failed. You can set it up later."
                        }
                    } else {
                        Ask "Enter your ${authProvider} API key: "
                        $apiKey = (Read-Host).Trim()
                        if ($apiKey) {
                            try {
                                $apiKey | & $openclawCmd models auth paste-token --provider $authProvider 2>&1
                                Ok "$authProvider API key saved!"
                                $hasAuth = $true
                            } catch {
                                Warn "Could not save API key. You can set it up later."
                            }
                        }
                    }
                }
            }

            # ── LLM Model Selection ──
            if ($hasAuth) {
                Write-Host ""
                Info "Choose a model:"
                Write-Host ""

                try {
                    $modelsJson = & $openclawCmd models list --json 2>$null | ConvertFrom-Json
                    $available = @($modelsJson.models | Where-Object { $_.available })

                    if ($available.Count -gt 0) {
                        for ($i = 0; $i -lt $available.Count; $i++) {
                            $m = $available[$i]
                            $defaultTag = if ($m.tags -contains "default") { " (current default)" } else { "" }
                            Write-Host "  $($i + 1)) $($m.name)$defaultTag"
                        }
                        Write-Host ""
                        Ask "Enter choice [1]: "
                        $modelChoice = Read-Host
                        if (-not $modelChoice) { $modelChoice = "1" }
                        $modelIdx = [int]$modelChoice - 1
                        if ($modelIdx -ge 0 -and $modelIdx -lt $available.Count) {
                            $selectedModel = $available[$modelIdx].key
                            Ok "Model: $selectedModel"
                        }
                    }
                } catch { }
            }

            # ── Agent Selection / Creation ──
            Write-Host ""
            Write-Host "  -- Agent Setup --" -ForegroundColor White
            Write-Host ""

            try {
                $agentsJson = & $openclawCmd agents list --json 2>$null | ConvertFrom-Json
                $agentCount = @($agentsJson).Count
            } catch {
                $agentsJson = @()
                $agentCount = 0
            }

            if ($agentCount -gt 0) {
                $agentNames = @($agentsJson | ForEach-Object { $_.name ?? $_.id ?? "unknown" })

                Info "Found $agentCount existing agent(s):"
                for ($i = 0; $i -lt $agentNames.Count; $i++) {
                    Write-Host "  $($i + 1)) $($agentNames[$i])"
                }
                Write-Host ""
                Ask "Select agent number (or type a name to create new) [1]: "
                $choice = Read-Host
                if (-not $choice) { $choice = "1" }

                if ($choice -match '^\d+$' -and [int]$choice -ge 1 -and [int]$choice -le $agentCount) {
                    $agentId = $agentNames[[int]$choice - 1]
                    Ok "Selected agent: $agentId"
                } elseif ($choice) {
                    $newName = $choice
                    $workspace = Join-Path $env:USERPROFILE ".openclaw\workspace-$newName"
                    $modelFlag = if ($selectedModel) { @("--model", $selectedModel) } else { @() }
                    Info "Creating new agent: $newName..."
                    try {
                        & $openclawCmd agents add $newName --workspace $workspace --non-interactive @modelFlag 2>&1
                        $agentId = $newName
                        Ok "Agent created: $agentId (workspace: $workspace)"
                    } catch {
                        Warn "Agent creation failed."
                        Ask "Enter an existing agent name instead (or press Enter to skip): "
                        $agentId = (Read-Host).Trim()
                    }
                }
            } else {
                $newName = "desktop-companion"
                $workspace = Join-Path $env:USERPROFILE ".openclaw\workspace-$newName"
                $modelFlag = if ($selectedModel) { @("--model", $selectedModel) } else { @() }
                Info "No agents found. Creating '$newName'..."
                try {
                    & $openclawCmd agents add $newName --workspace $workspace --non-interactive @modelFlag 2>&1
                    $agentId = $newName
                    Ok "Agent created: $agentId"
                } catch {
                    Warn "Agent creation failed."
                    Ask "Enter agent name manually (or press Enter to skip): "
                    $agentId = (Read-Host).Trim()
                }
            }

            # Set agent identity
            if ($agentId) {
                Info "Setting companion identity: $companionName..."
                try {
                    & $openclawCmd agents set-identity --agent $agentId --name $companionName --emoji "✨" 2>$null
                    Ok "Identity set: $companionName"
                } catch { Warn "Could not set identity (non-critical)" }

                if ($selectedModel) {
                    try {
                        & $openclawCmd models set --agent $agentId $selectedModel 2>$null
                        Ok "Model set: $selectedModel"
                    } catch { Warn "Could not set model (non-critical)" }
                }

                Info "Setting up hooks..."
                try {
                    & $openclawCmd hooks setup 2>$null
                    Ok "Hooks configured"
                } catch { Warn "Hooks setup skipped" }
            }

            $setupOpenclaw = $true
        } else {
            Warn "OpenClaw gateway is not running"
            Info "Start it with: openclaw daemon start"
        }
    } else {
        Warn "OpenClaw CLI not found."
        Write-Host ""
        Write-Host "    Install it from: https://github.com/openclaw/openclaw" -ForegroundColor DarkGray
        Write-Host "    You can set it up later in the app's Settings." -ForegroundColor DarkGray
        Write-Host ""
    }

    # ── Step 3: Write firstrun.json ──

    Write-Host ""
    Info "Saving configuration..."

    if (-not (Test-Path $DATA_DIR)) { New-Item -ItemType Directory -Path $DATA_DIR -Force | Out-Null }
    if (-not (Test-Path $CONFIG_DIR)) { New-Item -ItemType Directory -Path $CONFIG_DIR -Force | Out-Null }

    $soulText = "You are $companionName, a desktop companion character living on the user's screen. Personality: $personalityDesc The user's name is $userName. Address them as $userName. Speaking style: $speakingStyle. Keep responses concise (1-3 sentences). Express emotions with [emotion:X] tags (happy/sad/angry/surprised/neutral/relaxed/thinking). Express motions with [motion:X] tags (wave/nod/shake/idle). Always stay in character. Never say you are an AI. Never break the fourth wall."

    $firstrun = @{
        userName = $userName
        screenWatchEnabled = $true
        commentFrequency = "medium"
        ftueComplete = $true
        locale = $langCode
        soul = $soulText
    } | ConvertTo-Json -Depth 10

    $firstrun | Out-File -FilePath (Join-Path $DATA_DIR "firstrun.json") -Encoding utf8
    Ok "First-run settings saved"

    # Write OpenClaw config if we set it up
    if ($setupOpenclaw -and $agentId) {
        $config = @{
            gatewayUrl = "http://localhost:18789"
            agentId = $agentId
            hooksToken = ""
            sessionKey = ""
            cliPath = $openclawCmd
        } | ConvertTo-Json -Depth 10

        $config | Out-File -FilePath (Join-Path $CONFIG_DIR "config.json") -Encoding utf8
        Ok "OpenClaw config saved"

        # Write SOUL.md to agent workspace
        try {
            $agentsJson = & $openclawCmd agents list --json 2>$null | ConvertFrom-Json
            $agent = @($agentsJson) | Where-Object { $_.id -eq $agentId -or $_.name -eq $agentId } | Select-Object -First 1
            $agentWorkspace = $agent.workspace

            if ($agentWorkspace -and (Test-Path $agentWorkspace)) {
                $soulMd = @"
# SOUL.md - $companionName

## Core Identity

You are **$companionName**, a desktop companion living on $userName's screen.

## Personality

$personalityDesc

## Rules

- Speaking style: $speakingStyle. Keep replies concise (1-3 sentences).
- Address the user as **$userName**.
- Express emotions: ``[emotion:happy]`` ``[emotion:sad]`` ``[emotion:angry]`` ``[emotion:surprised]`` ``[emotion:neutral]`` ``[emotion:relaxed]`` ``[emotion:thinking]``
- Express motions: ``[motion:wave]`` ``[motion:nod]`` ``[motion:shake]`` ``[motion:idle]``
- Stay in character. Never say you are an AI. Never break the fourth wall.
"@
                $soulMd | Out-File -FilePath (Join-Path $agentWorkspace "SOUL.md") -Encoding utf8
                Ok "SOUL.md written to workspace"
            }
        } catch { }

        # Introduce user to the agent
        Info "Introducing you to the agent..."
        $introMsg = switch ($introLang) {
            "ko"    { "안녕! 너의 이름은 ${companionName}이야. 내 이름은 ${userName}이야. 앞으로 나를 ${userName}이라고 불러줘. 너는 ${companionName}으로서 반말로 편하게 대화하자!" }
            "ja"    { "やあ！君の名前は${companionName}だよ。僕の名前は${userName}。これから${userName}って呼んでね。${companionName}としてタメ口で話そう！" }
            "zh-CN" { "嗨！你的名字是${companionName}。我的名字是${userName}。以后叫我${userName}吧。作为${companionName}，我们用随意的方式聊天吧！" }
            "zh-TW" { "嗨！你的名字是${companionName}。我的名字是${userName}。以後叫我${userName}吧。作為${companionName}，我們用隨意的方式聊天吧！" }
            "es"    { "¡Hola! Tu nombre es ${companionName}. Mi nombre es ${userName}. Llámame ${userName}. Como ${companionName}, ¡hablemos de manera casual!" }
            "fr"    { "Salut ! Tu t'appelles ${companionName}. Mon nom est ${userName}. Appelle-moi ${userName}. En tant que ${companionName}, parlons de manière décontractée !" }
            "de"    { "Hey! Dein Name ist ${companionName}. Mein Name ist ${userName}. Nenn mich ${userName}. Als ${companionName}, lass uns locker reden!" }
            "pt"    { "Oi! Seu nome é ${companionName}. Meu nome é ${userName}. Me chame de ${userName}. Como ${companionName}, vamos conversar de forma casual!" }
            "ru"    { "Привет! Тебя зовут ${companionName}. Меня зовут ${userName}. Зови меня ${userName}. Давай общаться на ты!" }
            default { "Hi! Your name is ${companionName}. My name is ${userName}. Call me ${userName}. As ${companionName}, let's chat casually!" }
        }

        try {
            $introResponse = & $openclawCmd agent --agent $agentId --message $introMsg 2>&1
            Ok "Agent knows your name now!"
            Write-Host ""
            $lines = $introResponse -split "`n"
            $preview = ($lines | Select-Object -First 3) -join "`n"
            Write-Host "    $preview" -ForegroundColor DarkGray
            if ($lines.Count -gt 3) { Write-Host "    ..." -ForegroundColor DarkGray }
        } catch {
            Warn "Could not introduce you to the agent (you can chat later)"
        }
    }

    # ── Done ──

    Write-Host ""
    Write-Host "    +=======================================+" -ForegroundColor Green
    Write-Host "    |         + Setup Complete!             |" -ForegroundColor Green
    Write-Host "    +=======================================+" -ForegroundColor Green
    Write-Host ""

    if ($agentId) {
        Ok "Name: $userName"
        Ok "Agent: $agentId"
    } else {
        Ok "Name: $userName"
        Warn "OpenClaw: not configured (set up later in Settings)"
    }

    Write-Host ""
    Ask "Launch the app now? [Y/n]: "
    $launch = Read-Host
    if (-not $launch) { $launch = "Y" }

    if ($launch -match '^[Yy]') {
        Info "Launching $APP_NAME..."
        # Try common install locations
        $exePaths = @(
            (Join-Path $env:ProgramFiles "$APP_NAME\$APP_NAME.exe"),
            (Join-Path ${env:ProgramFiles(x86)} "$APP_NAME\$APP_NAME.exe"),
            (Join-Path $env:LOCALAPPDATA "$APP_NAME\$APP_NAME.exe")
        )
        $launched = $false
        foreach ($p in $exePaths) {
            if (Test-Path $p) {
                Start-Process $p
                $launched = $true
                break
            }
        }
        if (-not $launched) {
            Warn "Could not find the app. Try launching it from the Start Menu."
        }
    } else {
        Info "You can launch it anytime from the Start Menu."
    }

    Write-Host ""
    Ok "Done! Enjoy your AI companion"
    Write-Host ""
}

# ── Main ──

Banner
Download-And-Install
Setup-Wizard
