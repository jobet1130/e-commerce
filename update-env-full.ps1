@"
# Database
DB_NAME=ecommerce
DB_USER=user
DB_PASSWORD=password
DB_ROOT_PASSWORD=rootpassword
DATABASE_URL=mysql://user:password@db:3306/ecommerce

# Next.js
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your-secret-key-here
NEXT_PUBLIC_API_URL=http://localhost:3000/api

# Environment
NODE_ENV=development
"@ | Out-File -FilePath .env -Encoding utf8

Write-Host ".env file has been created with default values"
