# Ortiz Optical - Node.js Backend

A modern Express.js REST API backend for the Ortiz Optical management system with Sequelize ORM.

## Features

- ✅ Express.js server with CORS support
- ✅ Sequelize ORM for database management
- ✅ JWT authentication
- ✅ Role-based access control (Admin, Staff, Customer)
- ✅ Bcrypt password hashing
- ✅ QR code generation
- ✅ RESTful API endpoints

## Prerequisites

- Node.js (v14+)
- npm or yarn
- MySQL database (already created: ortiz_optical_db)

## Installation

1. **Install dependencies:**

   ```bash
   npm install
   ```

2. **Configure environment variables:**

   ```bash
   cp .env.example .env
   ```

   Edit `.env` and update the database credentials:

   ```env
   DB_HOST=localhost
   DB_USER=root
   DB_PASSWORD=your_password
   DB_NAME=ortiz_optical_db
   PORT=3000
   JWT_SECRET=your_secret_key
   ```

3. **Start the server:**

   **Development mode with auto-reload:**

   ```bash
   npm run dev
   ```

   **Production mode:**

   ```bash
   npm start
   ```

   The server will be available at `http://localhost:3000`

## API Endpoints

### Authentication

- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user

### Admin Routes (`/api/admin`)

- `GET /dashboard-stats` - Get dashboard statistics
- `GET /users` - Get all users
- `GET /products` - Get all products
- `POST /products` - Create product
- `PUT /products/:id` - Update product
- `DELETE /products/:id` - Delete product
- `GET /appointments` - Get all appointments
- `GET /orders` - Get all orders
- `GET /inventory` - Get inventory status

### Customer Routes (`/api/customer`)

- `GET /dashboard-stats` - Get customer dashboard stats
- `GET /products` - Get products
- `POST /cart/add` - Add to cart
- `GET /cart` - Get shopping cart
- `DELETE /cart/:cartId` - Remove from cart
- `POST /appointments/book` - Book appointment
- `GET /appointments` - Get customer's appointments
- `POST /orders/checkout` - Create order
- `GET /orders` - Get customer's orders

### Staff Routes (`/api/staff`)

- `GET /dashboard-stats` - Get dashboard stats
- `GET /appointments/today` - Get today's appointments
- `GET /appointments` - Get all appointments
- `PUT /appointments/:id` - Update appointment status
- `GET /orders` - Get all orders
- `PUT /orders/:id` - Update order status

## Database Models

- **User** - User accounts with roles
- **Customer** - Customer profiles
- **Product** - Product catalog
- **Appointment** - Appointment bookings
- **Order** - Customer orders
- **OrderItem** - Items in orders
- **Cart** - Shopping cart items
- **QRCode** - Generated QR codes

## Error Handling

All endpoints return consistent JSON responses:

**Success Response:**

```json
{
  "success": true,
  "message": "Operation successful",
  "data": {}
}
```

**Error Response:**

```json
{
  "success": false,
  "message": "Error description",
  "error": ""
}
```

## Authentication

All protected endpoints require a JWT token in the Authorization header:

```
Authorization: Bearer <token>
```

Tokens are returned after login and contain user information including role for authorization checks.

### Google Sign-In and customer email notifications

The login page supports Google Sign-In when `GOOGLE_CLIENT_ID` is configured. Create a **Web application** OAuth client in Google Cloud Console and add the exact site origin (for local development, `http://localhost:3000`) to its authorized JavaScript origins. Add the client ID to `backend/.env`:

```env
GOOGLE_CLIENT_ID=your_web_client_id.apps.googleusercontent.com
```

Users can sign in with an existing account whose email matches their verified Google email. A new Google account is created as a customer; existing email/password login continues to work.

Customer appointment and order updates are sent from the configured business Gmail account. Enable 2-Step Verification for that Gmail account, create an App Password in Google Account security settings, then configure:

```env
GMAIL_USER=business@gmail.com
GMAIL_APP_PASSWORD=your_16_character_app_password
```

Use an App Password, not the account's normal Gmail password. Keep both values private in the backend environment, never in frontend code or source control. Restart the backend after updating `.env`. Emails are not marked as sent when no email provider is configured.

## Development

- API runs on port 3000
- Uses nodemon for auto-reload during development
- Sequelize logging enabled in development mode
- Error handling middleware catches all errors

## Next Steps

1. Update the frontend to use the new API endpoints
2. Refine the static frontend pages in `frontend/public/pages`
3. Deploy to production server
4. Set up SSL/TLS certificate

## License

ISC
