# Quick Start Guide - Node.js Backend

## Step 1: Setup

```bash
cd backend
npm install
cp .env.example .env
```

Update `.env` with your MySQL credentials

## Step 2: Start Server

```bash
npm run dev
```

You should see:

```
Database connected successfully
Server is running on http://localhost:3000
```

## Step 3: Test the API

### Register a new user

```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "full_name": "John Doe",
    "email": "john@example.com",
    "password": "password123",
    "confirm_password": "password123",
    "phone": "1234567890",
    "role": "customer"
  }'
```

### Login

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "john@example.com",
    "password": "password123"
  }'
```

You'll get back a token like:

```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "user_id": 1,
    "full_name": "John Doe",
    "email": "john@example.com",
    "role": "customer"
  }
}
```

### Use the token

For protected endpoints, include the token in the Authorization header:

```bash
curl -X GET http://localhost:3000/api/customer/dashboard-stats \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIs..."
```

## Frontend API Usage

Use the frontend in `frontend/public` to call the Node.js endpoints directly:

### Example request

```javascript
const token = localStorage.getItem("token");

fetch("http://localhost:3000/api/customer/products", {
  headers: {
    Authorization: `Bearer ${token}`,
  },
})
  .then((res) => res.json())
  .then((data) => console.log(data.products));
```

The shared frontend API helper is in `frontend/public/js/api.js`.

## Database Migration

The existing MySQL database (`ortiz_optical_db`) will be used as-is. Sequelize will:

1. Connect to your database
2. Map existing tables to models
3. Handle relationships automatically

## Folder Structure

```
backend/
├── config/          # Database configuration
├── models/          # Sequelize models
├── routes/          # API endpoint definitions
├── middleware/      # Auth, error handling
├── package.json     # Dependencies
├── server.js        # Main Express app
├── .env             # Environment variables
└── README.md        # Documentation
```

## Next: Frontend Integration

1. Start the backend with `npm run dev`
2. Open `frontend/public/index.html` or run the frontend dev server
3. Store the JWT token after login
4. Send the token with each protected request
5. Update the UI from API responses

See the main README.md for the current project structure.
