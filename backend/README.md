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
