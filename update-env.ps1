# Read the current .env file content
$envPath = ".env"
$envContent = Get-Content -Path $envPath -Raw

# Update the DATABASE_URL to use port 3307
$newEnvContent = $envContent -replace 'DATABASE_URL=.*', 'DATABASE_URL=mysql://user:password@localhost:3307/ecommerce'

# Save the updated content back to .env
$newEnvContent | Set-Content -Path $envPath

Write-Host ".env file has been updated to use MySQL on port 3307"
