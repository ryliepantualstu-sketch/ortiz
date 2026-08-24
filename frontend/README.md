# Frontend - Ortiz Optical

HTML/CSS/JavaScript frontend for the Ortiz Optical management system.

## Structure

```
frontend/
├── public/
│   ├── index.html          # Login/Register page
│   ├── css/
│   │   ├── auth.css        # Authentication styles
│   │   └── dashboard.css   # Dashboard styles
│   ├── js/
│   │   ├── api.js          # API communication
│   │   ├── auth.js         # Authentication logic
│   │   └── dashboard.js    # Dashboard logic
│   └── pages/
│       ├── admin-dashboard.html
│       ├── customer-dashboard.html
│       └── staff-dashboard.html
├── package.json
└── README.md
```

## How to Run

### Option 1: Using Python (built-in)

```bash
cd frontend
python -m http.server 8000
# Opens at http://localhost:8000
```

### Option 2: Using Node.js http-server

```bash
cd frontend
npm install -g http-server
http-server public -p 8000
```

### Option 3: Direct File Access

Open in browser:

```
file:///C:/Users/user/Documents/Ortiz Optical/frontend/public/index.html
```

## Requirements

- Backend API running on `http://localhost:3000`
- Modern web browser (Chrome, Firefox, Edge, Safari)

## Features

- ✅ Login/Register
- ✅ Role-based dashboards (Admin, Customer, Staff)
- ✅ Responsive design
- ✅ JWT token management
- ✅ API integration

## Usage

1. Open the frontend in your browser
2. Register a new account or login
3. System redirects to appropriate dashboard based on role
4. API calls are made with JWT token authentication

## API Integration

All API calls go to `http://localhost:3000/api`

See backend README for available endpoints.
