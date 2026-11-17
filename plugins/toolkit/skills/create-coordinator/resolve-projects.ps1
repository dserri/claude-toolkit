# resolve-projects.ps1 - uso: resolve-projects.ps1 <nome-o-percorso> [altro ...]
# Trasforma nomi di progetto in percorsi di cartelle. Stampa JSON: un elemento per argomento con
#   input, status (ok | ambiguous | notfound), path (se ok), candidates (percorsi trovati), source.
# Fonti, in ordine:
#   1. l'argomento e' gia' una cartella esistente (percorso assoluto o relativo);
#   2. le cartelle progetto note a Claude Code (chiavi "projects" di ~/.claude.json);
#   3. le sottocartelle dirette di ogni progetto noto e della sua cartella padre;
#   4. le cartelle radice elencate in roots.txt, accanto a questo script (una per riga, facoltativo),
#      esplorate fino a 3 livelli di profondita'.
# Corrispondenze, dalla piu' stretta: nome finale identico; suffisso di percorso (es. "Rehlko/backoffices");
# nome finale che contiene l'argomento. Si passa al criterio successivo solo se il precedente non trova nulla.
param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Names)
$ErrorActionPreference = 'Stop'
if (-not $Names) { throw "Indica almeno un nome o percorso." }

function Norm([string]$p) { ($p -replace '/', '\').TrimEnd('\') }

# --- Fonte 2: progetti noti a Claude Code -------------------------------------
$known = @()
$cfg = Join-Path $env:USERPROFILE '.claude.json'
if (Test-Path -LiteralPath $cfg) {
    $raw = [IO.File]::ReadAllText($cfg)
    try {
        if ($PSVersionTable.PSVersion.Major -ge 6) {
            $known = @((ConvertFrom-Json $raw -AsHashtable).projects.Keys)
        } else {
            # ConvertFrom-Json di PowerShell 5.1 fallisce su chiavi che differiscono solo per maiuscole.
            Add-Type -AssemblyName System.Web.Extensions
            $js = New-Object System.Web.Script.Serialization.JavaScriptSerializer
            $js.MaxJsonLength = [int]::MaxValue
            $known = @($js.DeserializeObject($raw)['projects'].Keys)
        }
    } catch { Write-Warning "Impossibile leggere ${cfg}: $($_.Exception.Message)" }
}

# --- Fonte 3: radici configurate ----------------------------------------------
$scanned = @()
$rootsFile = Join-Path $PSScriptRoot 'roots.txt'
if (Test-Path -LiteralPath $rootsFile) {
    $skip = '^(node_modules|\.git|bin|obj|dist|build|\.venv|venv|__pycache__)$'
    foreach ($r in Get-Content -LiteralPath $rootsFile) {
        $r = $r.Trim()
        if (-not $r -or $r.StartsWith('#') -or -not (Test-Path -LiteralPath $r -PathType Container)) { continue }
        $scanned += $r
        $queue = @(@{ P = $r; D = 0 })
        while ($queue.Count) {
            $cur = $queue[0]; $queue = @($queue | Select-Object -Skip 1)
            if ($cur.D -ge 3) { continue }
            foreach ($c in @(Get-ChildItem -LiteralPath $cur.P -Directory -Force -ErrorAction SilentlyContinue)) {
                if ($c.Name -match $skip) { continue }
                $scanned += $c.FullName
                $queue += @{ P = $c.FullName; D = $cur.D + 1 }
            }
        }
    }
}

# Vicinato dei progetti noti: sottocartelle dirette di ogni progetto noto e della sua cartella
# padre (copre i progetti "fratelli" o "figli" di uno gia' aperto con Claude Code).
$near = @{}
foreach ($k in $known) {
    $p = Norm $k
    foreach ($base in @($p, (Split-Path $p -Parent))) {
        if (-not $base -or $near.ContainsKey($base.ToLowerInvariant())) { continue }
        $near[$base.ToLowerInvariant()] = $true
        $scanned += @(Get-ChildItem -LiteralPath $base -Directory -Force -ErrorAction SilentlyContinue |
            Where-Object { $_.Name -notmatch '^(node_modules|\.git|bin|obj|dist|build|\.venv|venv|__pycache__)$' } |
            ForEach-Object { $_.FullName })
    }
}

# Elenco unico (senza distinzione di maiuscole) delle cartelle esistenti.
$seen = @{}; $pool = @()
foreach ($p in @($known | ForEach-Object { Norm $_ }) + @($scanned | ForEach-Object { Norm $_ })) {
    $k = $p.ToLowerInvariant()
    if ($seen.ContainsKey($k)) { continue }
    $seen[$k] = $true
    if (Test-Path -LiteralPath $p -PathType Container) { $pool += $p }
}

$out = foreach ($n in $Names) {
    $q = Norm $n
    # Un nome semplice (senza separatori) non viene mai interpretato come percorso relativo alla
    # cartella corrente: altrimenti una cartella omonima li' nasconderebbe gli altri candidati.
    $looksLikePath = [IO.Path]::IsPathRooted($q) -or $q.Contains('\') -or $q.StartsWith('.')
    if ($q -and $looksLikePath -and (Test-Path -LiteralPath $q -PathType Container)) {
        $full = (Resolve-Path -LiteralPath $q).Path.TrimEnd('\')
        [pscustomobject]@{ input = $n; status = 'ok'; path = $full; candidates = @($full); source = 'percorso' }
        continue
    }
    $leaf = Split-Path $q -Leaf
    $hits = @($pool | Where-Object { (Split-Path $_ -Leaf) -ieq $q }); $how = 'nome identico'
    if (-not $hits -and $q.Contains('\')) { $hits = @($pool | Where-Object { $_.ToLowerInvariant().EndsWith('\' + $q.ToLowerInvariant()) }); $how = 'suffisso di percorso' }
    if (-not $hits) { $hits = @($pool | Where-Object { (Split-Path $_ -Leaf).ToLowerInvariant().Contains($leaf.ToLowerInvariant()) }); $how = 'nome parziale' }
    $status = if ($hits.Count -eq 1 -and $how -ne 'nome parziale') { 'ok' } elseif ($hits.Count -ge 1) { 'ambiguous' } else { 'notfound' }
    [pscustomobject]@{ input = $n; status = $status; path = $(if ($status -eq 'ok') { $hits[0] } else { $null }); candidates = @($hits | Sort-Object); source = $how }
}
ConvertTo-Json -InputObject @($out) -Depth 4
