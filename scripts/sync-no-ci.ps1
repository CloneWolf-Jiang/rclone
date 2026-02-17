Param(
  [string]$Message = "",
  [switch]$Amend
)

if ([string]::IsNullOrWhiteSpace($Message)) {
  $Message = Read-Host "Commit message"
}

$commitMsg = "$Message [skip ci]"

Write-Host "Staging changes..."
git add -A
if (-not $?) { Write-Error "git add failed"; exit 1 }

if ($Amend) {
  Write-Host "Amending last commit with: $commitMsg"
  git commit --amend -m $commitMsg
  if (-not $?) { Write-Error "git commit --amend failed"; exit 1 }
} else {
  Write-Host "Committing: $commitMsg"
  # Try to commit; if there are no changes, exit normally
  git commit -m $commitMsg
  $rc = $LASTEXITCODE
  if ($rc -ne 0) {
    Write-Host "No changes to commit or commit failed (exit $rc)."
    exit 0
  }
}

Write-Host "Pushing to remote..."
git push
if (-not $?) { Write-Error "git push failed"; exit 1 }

Write-Host "Done: pushed with message '$commitMsg'"
