require('dotenv').config();
const sequelize = require('./config/database');
const Product = require('./models/Product');
const User = require('./models/User');
const Customer = require('./models/Customer');
const Appointment = require('./models/Appointment');
const Order = require('./models/Order');
const OrderItem = require('./models/OrderItem');

const seedAdmin = async () => {
  const adminExists = await User.findOne({ where: { email: 'admin@ortizoptical.com' } });
  if (!adminExists) {
    await User.create({
      full_name: 'Admin User',
      email: 'admin@ortizoptical.com',
      password: 'admin123',
      phone: '1234567890',
      role: 'admin'
    });
    console.log('Admin user created: admin@ortizoptical.com / admin123');
  } else {
    console.log('Admin user already exists');
  }
};

const exampleProducts = [
  {
    product_name: 'Classic Aviator Sunglasses',
    category: 'Glasses',
    description: 'Timeless aviator style sunglasses with UV protection. Perfect for everyday wear.',
    frame_material: 'Metal',
    lens_type: 'UV Protection',
    frame_shape: 'Aviator',
    color_name: 'Gold',
    color_hex: '#FFD700',
    color_int: 16764057,
    price: 2500,
    stock_quantity: 25,
    min_stock_level: 10,
    supplier: 'EyeWear Plus',
    last_restock_date: new Date()
  },
  {
    product_name: 'Blue Light Blocking Glasses',
    category: 'Glasses',
    description: 'Reduce eye strain from digital screens with our blue light blocking technology.',
    frame_material: 'Acetate',
    lens_type: 'Blue Light Blocking',
    frame_shape: 'Rectangle',
    color_name: 'Navy Blue',
    color_hex: '#000080',
    color_int: 255,
    price: 2800,
    stock_quantity: 35,
    min_stock_level: 15,
    supplier: 'TechVision',
    last_restock_date: new Date()
  },
  {
    product_name: 'Prescription Reading Glasses',
    category: 'Glasses',
    description: 'Custom prescription reading glasses. Comfortable for extended reading sessions.',
    frame_material: 'Titanium',
    lens_type: 'Prescription',
    frame_shape: 'Oval',
    color_name: 'Matte Black',
    color_hex: '#000000',
    color_int: 0,
    price: 3200,
    stock_quantity: 18,
    min_stock_level: 10,
    supplier: 'OptiCare',
    last_restock_date: new Date()
  },
  {
    product_name: 'Sports Performance Sunglasses',
    category: 'Glasses',
    description: 'Lightweight and durable sunglasses designed for active sports and outdoor activities.',
    frame_material: 'Nylon',
    lens_type: 'Polarized',
    frame_shape: 'Wraparound',
    color_name: 'Sports Green',
    color_hex: '#00FF00',
    color_int: 65280,
    price: 3500,
    stock_quantity: 22,
    min_stock_level: 12,
    supplier: 'SportOptix',
    last_restock_date: new Date()
  },
  {
    product_name: 'Fashion Oversized Sunglasses',
    category: 'Glasses',
    description: 'Trendy oversized sunglasses that combine style with UV protection.',
    frame_material: 'Acetate',
    lens_type: 'UV Protection',
    frame_shape: 'Oversized',
    color_name: 'Cherry Red',
    color_hex: '#FF0000',
    color_int: 16711680,
    price: 2200,
    stock_quantity: 40,
    min_stock_level: 20,
    supplier: 'StyleFrames',
    last_restock_date: new Date()
  }
];

async function seedDatabase() {
  try {
    // Authenticate database
    await sequelize.authenticate();
    console.log('✓ Database connected');

    // Force sync models to recreate tables cleanly for seed data
    await sequelize.sync({ force: true });
    console.log('✓ Models synced and table structure recreated');

    // Check if data already exists
    const productCount = await Product.count();
    const appointmentCount = await Appointment.count();
    const orderCount = await Order.count();

    if (productCount > 0 || appointmentCount > 0 || orderCount > 0) {
      console.log(`\n⚠ Database already contains data:`);
      console.log(`  - ${productCount} products`);
      console.log(`  - ${appointmentCount} appointments`);
      console.log(`  - ${orderCount} orders`);
      
      const response = await new Promise((resolve) => {
        const readline = require('readline');
        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout
        });
        
        rl.question('\nDo you want to reseed the database? (yes/no): ', (answer) => {
          rl.close();
          resolve(answer.toLowerCase() === 'yes' || answer === 'y');
        });
      });

      if (!response) {
        console.log('✓ Seeding cancelled');
        process.exit(0);
      }

      // Delete existing data (in correct order to respect foreign keys)
      await OrderItem.destroy({ where: {} });
      await Order.destroy({ where: {} });
      await Appointment.destroy({ where: {} });
      await Product.destroy({ where: {} });
      await Customer.destroy({ where: {} });
      await User.destroy({ where: {} });
      console.log('✓ Existing data cleared');
    }

    // 1. Insert example products
    console.log('\n→ Adding products...');
    await Product.bulkCreate(exampleProducts);
    console.log(`✓ Added ${exampleProducts.length} products`);

    // 2. Create test user/customer
    console.log('\n→ Creating test customer...');
    const testUser = await User.create({
      full_name: 'Juan Dela Cruz',
      email: 'juan@example.com',
      password: 'password123',
      phone: '+63912345678',
      role: 'customer'
    });
    console.log(`✓ Created user: ${testUser.full_name}`);

    const testCustomer = await Customer.create({
      user_id: testUser.user_id
    });
    console.log(`✓ Created customer profile`);

    // 3. Create sample appointments
    console.log('\n→ Adding sample appointments...');
    const appointments = await Appointment.bulkCreate([
      {
        customer_id: testCustomer.customer_id,
        appointment_date: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000), // 5 days from now
        appointment_time: '10:00 AM',
        service_type: 'Eye Checkup',
        status: 'scheduled'
      },
      {
        customer_id: testCustomer.customer_id,
        appointment_date: new Date(Date.now() + 12 * 24 * 60 * 60 * 1000), // 12 days from now
        appointment_time: '2:30 PM',
        service_type: 'Contact Lens Fitting',
        status: 'scheduled'
      },
      {
        customer_id: testCustomer.customer_id,
        appointment_date: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000), // 3 days ago
        appointment_time: '11:00 AM',
        service_type: 'Glasses Adjustment',
        status: 'completed'
      }
    ]);
    console.log(`✓ Added ${appointments.length} sample appointments`);

    // 4. Create sample orders
    console.log('\n→ Adding sample orders...');
    const products = await Product.findAll();
    
    const order1 = await Order.create({
      customer_id: testCustomer.customer_id,
      total_amount: 5500,
      delivery_address: '123 Main Street, Manila, Philippines',
      notes: 'Please deliver between 9 AM - 5 PM',
      status: 'completed'
    });

    // Add items to order 1
    await OrderItem.bulkCreate([
      {
        order_id: order1.order_id,
        product_id: products[0].product_id,
        quantity: 1,
        price: 2500,
        subtotal: 2500
      },
      {
        order_id: order1.order_id,
        product_id: products[1].product_id,
        quantity: 2,
        price: 1500,
        subtotal: 3000
      }
    ]);

    const order2 = await Order.create({
      customer_id: testCustomer.customer_id,
      total_amount: 2800,
      delivery_address: '456 Oak Avenue, Quezon City, Philippines',
      notes: 'Standard delivery',
      status: 'processing'
    });

    // Add items to order 2
    await OrderItem.bulkCreate([
      {
        order_id: order2.order_id,
        product_id: products[2].product_id,
        quantity: 1,
        price: 1800,
        subtotal: 1800
      },
      {
        order_id: order2.order_id,
        product_id: products[3].product_id,
        quantity: 1,
        price: 1000,
        subtotal: 1000
      }
    ]);

    const order3 = await Order.create({
      customer_id: testCustomer.customer_id,
      total_amount: 3200,
      delivery_address: '789 Elm Street, Cebu City, Philippines',
      notes: 'Express delivery preferred',
      status: 'pending'
    });

    // Add items to order 3
    await OrderItem.create({
      order_id: order3.order_id,
      product_id: products[2].product_id,
      quantity: 1,
      price: 3200,
      subtotal: 3200
    });

    console.log(`✓ Added 3 sample orders with items`);

    // 5. Create test admin account
    console.log('\n→ Creating test admin account...');
    const adminUser = await User.create({
      full_name: 'Admin User',
      email: 'admin@ortizoptical.com',
      password: 'admin123',
      phone: '+63987654321',
      role: 'admin'
    });
    console.log(`✓ Created admin: ${adminUser.full_name}`);

    // 6. Create test staff account
    console.log('\n→ Creating test staff account...');
    const staffUser = await User.create({
      full_name: 'Staff Member',
      email: 'staff@ortizoptical.com',
      password: 'staff123',
      phone: '+63912345678',
      role: 'staff'
    });
    console.log(`✓ Created staff: ${staffUser.full_name}`);

    console.log('\n' + '='.repeat(50));
    console.log('✓ DATABASE SEEDING COMPLETED SUCCESSFULLY!');
    console.log('='.repeat(50));
    console.log('\n📝 Test Accounts:');
    console.log(`\n🔐 CUSTOMER ACCOUNT:`);
    console.log(`   Email: ${testUser.email}`);
    console.log(`   Password: password123`);
    console.log(`   Name: ${testUser.full_name}`);
    console.log(`\n🔴 ADMIN ACCOUNT:`);
    console.log(`   Email: ${adminUser.email}`);
    console.log(`   Password: admin123`);
    console.log(`   Name: ${adminUser.full_name}`);
    console.log(`\n🟡 STAFF ACCOUNT:`);
    console.log(`   Email: ${staffUser.email}`);
    console.log(`   Password: staff123`);
    console.log(`   Name: ${staffUser.full_name}`);
    console.log('\n📊 Data Added:');
    console.log(`   - ${exampleProducts.length} products`);
    console.log(`   - ${appointments.length} appointments`);
    console.log(`   - 3 orders (with order items)`);
    console.log('='.repeat(50) + '\n');

    process.exit(0);
  } catch (error) {
    console.error('✗ Error seeding database:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

seedDatabase();
