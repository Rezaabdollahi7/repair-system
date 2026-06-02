<div align="center">

# 🔧 Repair Management System

### Professional Repair Shop Management

[![React](https://img.shields.io/badge/React-18.2-blue)](https://reactjs.org/)
[![Node.js](https://img.shields.io/badge/Node.js-20-green)](https://nodejs.org/)
[![SQLite](https://img.shields.io/badge/SQLite-3-lightblue)](https://www.sqlite.org/)
[![TailwindCSS](https://img.shields.io/badge/TailwindCSS-3.4-06B6D4)](https://tailwindcss.com/)
[![License](https://img.shields.io/badge/License-MIT-yellow)](./LICENSE)

[📚 API Docs](./docs/API.md) | [🗄️ Database Schema](./docs/DATABASE.md) | [📋 Changelog](./CHANGELOG.md)

[English](./README.md) | [فارسی](./README.fa.md)

</div>

---

## 📋 About

**Repair Management System** is a comprehensive, all-in-one solution designed for repair shops of any kind. From accepting devices and tracking repair status to managing inventory, invoicing, and financial reporting — everything your team needs in one place.

**Key Focus:**

- Streamlined device acceptance and tracking
- Real-time repair status monitoring
- Complete inventory and parts management
- Professional invoicing with tax and discount calculations
- Team collaboration with role-based access

---

## ✨ Features

### 📋 Device Management

- Fast device registration (under 30 seconds)
- Search by acceptance number, customer name, brand, or model
- Advanced filtering by status, date range, and personnel
- One-click status change (Pending → Diagnosing → Repairing → Repaired → Delivered)
- Assign repair technicians to devices
- Upload and view device images with fullscreen slider
- Click-to-view detail modals

### 👥 Customer Management

- Complete customer profiles with contact information
- Full device repair history per customer
- Statistics: total devices, successful repairs, average repair time
- Customer timeline with all devices
- Quick search by name or phone number

### 👨‍🔧 Personnel Management

- Role-based user management (Super Admin, Admin, Technician)
- User activation/deactivation
- Role-restricted access to sensitive sections
- Password management and profile settings

### 📦 Inventory Management

- Parts catalog with code, name, category, and unit
- Real-time stock tracking
- Low stock alerts with visual indicators
- Category management with inline editing
- Initial stock registration on item creation
- Quick purchase and quick sale from item detail

### 🛒 Purchase Invoices

- Record parts purchases from suppliers
- Automatic stock increase upon purchase
- Weighted average purchase price calculation
- Payment status tracking (Pending / Partial / Paid)
- Quick item creation during invoice creation

### 💰 Sale Invoices

- Direct parts sales to customers
- Automatic stock decrease with validation
- Custom line items alongside inventory items
- Suggested selling price (avg purchase + 20%)
- Printable invoice with company branding

### 🔧 Repair Invoices

- Create repair invoices linked to devices
- Three item types: Inventory, Service, Custom
- Auto-fill customer from selected device (read-only)
- Discount (percentage or fixed) and tax calculation
- Warranty period tracking
- Technician assignment
- Printable invoice with logo, stamp, and signature
- Payment tracking with history

### 📊 Dashboard & Reports

- Real-time KPIs: devices, revenue, profit
- Stock status overview
- Device status distribution
- Monthly and daily financial summaries
- Low stock warnings
- Recent transaction feed
- Top-selling items ranking
- Profit/Loss report by item with date filtering
- Inventory status report with category filter

### ⚙️ Settings & Customization

- Company profile (name, address, contacts)
- Upload logo, stamp, and signature images
- Default tax rate and warranty period
- Invoice prefix customization
- Sale invoice template settings (A4/A5/Thermal, show/hide sections)

### 💾 Backup & Restore

- Manual backup creation
- Optional inclusion of uploaded files
- Backup download
- One-click restore with auto-backup before restore
- Weekly automatic backup scheduler
- Backup history with metadata

### 🔐 Security & Access Control

- JWT-based authentication
- Role-based access (Super Admin / Admin / Technician)
- Route-level protection
- Password encryption with bcrypt

### 🌐 Multi-Device Access

- Server runs on one machine
- Team access via local network (LAN)
- Works on desktop, laptop, tablet, and mobile
- PWA support for mobile installation

### 🎨 UI/UX

- Persian (RTL) interface with full localization
- Persian numbers and date formatting
- Collapsible sidebar navigation
- Floating action button for quick actions
- Loading spinners and empty states
- Confirmation modals for destructive actions
- Responsive design for all screen sizes

---

## ⚙️ Tech Stack

### Backend

- **Node.js (v20.x)** - JavaScript Runtime
- **Express.js (v4.18)** - Web Framework
- **SQL.js** - SQLite in JavaScript/WebAssembly
- **JWT (jsonwebtoken)** - Authentication
- **bcryptjs** - Password Hashing
- **multer** - File Uploads
- **node-cron** - Scheduled Tasks (Auto Backup)
- **archiver** - ZIP File Creation
- **adm-zip** - ZIP File Extraction
- **csv-parse** - CSV Parsing for Data Migration
- **jalaali-js** - Persian Calendar Conversion

### Frontend

- **React (v18.2)** - UI Library
- **Vite (v5.4)** - Build Tool & Dev Server
- **React Router (v6)** - Client-side Routing
- **TailwindCSS (v3.4)** - Utility-first CSS
- **Axios** - HTTP Client
- **Heroicons** - Icon Library
- **react-to-print** - Print & PDF Export
- **react-hot-toast** - Toast Notifications

### Database

- **SQLite** - Local File-based Database
- No server installation required
- Portable - database is a single file

---

## 🏗️ Project Structure

```
repair-management-system/
├── backend/ # Node.js API Server
│ ├── src/
│ │ ├── config/
│ │ │ └── database.js # SQLite connection & schema
│ │ ├── controllers/ # Route controllers (14 files)
│ │ ├── middleware/ # Auth & authorization
│ │ ├── routes/ # API routes (14 files)
│ │ ├── jobs/
│ │ │ └── backupScheduler.js # Weekly auto-backup
│ │ ├── utils/ # Helper functions
│ │ ├── scripts/ # Utility scripts
│ │ └── server.js # Express server entry
│ ├── uploads/ # Uploaded files
│ │ ├── devices/ # Device images
│ │ └── settings/ # Logo, stamp, signature
│ ├── backups/ # Backup files
│ └── package.json
│
├── frontend/ # React Application
│ ├── src/
│ │ ├── components/ # Reusable components (25+ files)
│ │ ├── pages/ # Page components (14 files)
│ │ ├── context/ # React Context (Auth & Modal)
│ │ ├── api/ # Axios API client
│ │ ├── utils/ # Formatters & helpers
│ │ ├── App.jsx
│ │ └── main.jsx
│ ├── public/
│ │ ├── favicon.svg
│ │ ├── manifest.json # PWA manifest
│ │ └── sw.js # Service Worker
│ ├── index.html
│ └── package.json
│
├── start.bat # Windows quick-start script
└── README.md

```

---

## 🚀 Quick Start

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or higher)
- npm (comes with Node.js)

### Installation

```bash
# 1. Clone the repository
git clone https://github.com/Rezaabdollahi7/repair-management-system.git
cd repair-management-system

# 2. Install backend dependencies
cd backend
npm install

# 3. Install frontend dependencies
cd ../frontend
npm install

# 4. Create frontend environment file
echo "VITE_API_URL=http://localhost:5001" > .env
```

### Running the Application

```bash
# Terminal 1 - Backend
cd backend/src
node server.js
# Server starts at http://localhost:5001

# Terminal 2 - Frontend
cd frontend
npm run dev
# Frontend starts at http://localhost:5173
```

### Default Login Credentials

```
Username: superadmin
Password: password
```

⚠️ **IMPORTANT:** Change the default password immediately after first login!

---

## 🌐 Network Setup (Team Access)

To make the application accessible to your team on the local network:

```bash
# 1. Find your computer's IP address (e.g., 192.168.1.150)

# 2. Update frontend environment
# frontend/.env.development
VITE_API_URL=http://192.168.1.150:5001

# 3. Start backend
cd backend/src
node server.js

# 4. Start frontend (accessible to network)
cd frontend
npm run dev -- --host

# 5. Team members access via browser:
# http://192.168.1.150:5173
```

---

## 📱 Mobile Installation (PWA)

1. Open the application in Chrome on your mobile device
2. Tap the menu (⋮) → "Add to Home Screen" or "Install App"
3. The app will install and open like a native app

## 📡 API Endpoints

### Authentication

```
POST   /api/auth/login              # User login
GET    /api/auth/me                 # Get current user
PUT    /api/auth/change-password    # Change password
```

### Devices

```
GET    /api/devices                 # List devices (search, filter, paginate)
GET    /api/devices/:id             # Get device details
POST   /api/devices                 # Create device
PUT    /api/devices/:id             # Update device
DELETE /api/devices/:id             # Delete device
POST   /api/devices/:id/images      # Upload images
DELETE /api/devices/:id/images/:img # Delete image
```

### Customers

```
GET    /api/customers               # List customers
GET    /api/customers/:id           # Get customer details
POST   /api/customers               # Create customer
PUT    /api/customers/:id           # Update customer
DELETE /api/customers/:id           # Delete customer
GET    /api/customers/:id/devices   # Get customer's devices
GET    /api/customers/:id/stats     # Get customer statistics
```

### Personnel

```
GET    /api/personnel               # List personnel
GET    /api/personnel/:id           # Get personnel details
POST   /api/personnel               # Create personnel
PUT    /api/personnel/:id           # Update personnel
PUT    /api/personnel/:id/toggle-active # Toggle active status
DELETE /api/personnel/:id           # Delete personnel
```

### Items (Inventory)

```
GET    /api/items                   # List items
GET    /api/items/:id               # Get item details
POST   /api/items                   # Create item
PUT    /api/items/:id               # Update item
DELETE /api/items/:id               # Delete item
GET    /api/items/search            # Search items
GET    /api/items/low-stock         # Low stock items
GET    /api/items/:id/transactions  # Item transaction history
POST   /api/items/:id/quick-purchase # Quick purchase
POST   /api/items/:id/quick-sale    # Quick sale
```

### Purchase Invoices

```
GET    /api/purchase-invoices       # List invoices
GET    /api/purchase-invoices/:id   # Get invoice details
POST   /api/purchase-invoices       # Create invoice
PUT    /api/purchase-invoices/:id/payment # Update payment
DELETE /api/purchase-invoices/:id   # Delete invoice
```

### Sale Invoices

```
GET    /api/sale-invoices           # List invoices
GET    /api/sale-invoices/:id       # Get invoice details
POST   /api/sale-invoices           # Create invoice
PUT    /api/sale-invoices/:id/payment # Update payment
DELETE /api/sale-invoices/:id       # Delete invoice
```

### Repair Invoices

```
GET    /api/repair-invoices         # List invoices
GET    /api/repair-invoices/:id     # Get invoice details
POST   /api/repair-invoices         # Create invoice
PUT    /api/repair-invoices/:id     # Update invoice (draft only)
DELETE /api/repair-invoices/:id     # Delete invoice
PUT    /api/repair-invoices/:id/status # Change status (issue/cancel)
POST   /api/repair-invoices/:id/payments # Add payment
```

### Reports

```
GET    /api/reports/dashboard       # Dashboard statistics
GET    /api/reports/stock           # Stock report
GET    /api/reports/purchases       # Purchase report
GET    /api/reports/sales           # Sales report
GET    /api/reports/profit          # Profit/Loss report
```

### Settings

```
GET    /api/settings               # Get settings
PUT    /api/settings               # Update settings
POST   /api/settings/upload/:type  # Upload image (logo/stamp/signature)
```

### Backups

```
GET    /api/backups                 # List backups
POST   /api/backups                 # Create backup
GET    /api/backups/:id/download    # Download backup
POST   /api/backups/:id/restore     # Restore backup
DELETE /api/backups/:id             # Delete backup
```

---

## 🔒 Security

### Implemented Security Measures

- ✅ **Password Security** - bcrypt hashing with cost factor 10
- ✅ **Authentication** - JWT token-based (72h expiry)
- ✅ **Authorization** - Role-based access control (3 roles)
- ✅ **CORS Protection** - Configured allowed origins
- ✅ **SQL Injection Prevention** - Parameterized queries
- ✅ **Input Validation** - Server-side validation
- ✅ **Error Handling** - No sensitive data in responses
- ✅ **Weekly Backups** - Automatic backup scheduling

---

## 👨‍💻 Credits

**Developer:** Reza Abdollahi  
**Company:** Siemens Part  
**Email:** srezaabdollahi7@gmail.com  
**GitHub:** [@Rezaabdollahi7](https://github.com/Rezaabdollahi7)

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 🔗 Quick Links

- 📚 [API Documentation](./docs/API.md)
- 🗄️ [Database Schema](./docs/DATABASE.md)
- 📋 [Changelog](./CHANGELOG.md)
- 🐛 [Report Issues](https://github.com/Rezaabdollahi7/repair-management-system/issues)

---

<div align="center">

**Version:** 1.0.0  
**Last Updated:** May 2026  
**Status:** ✅ Production Ready

Made with ❤️ for repair shops everywhere

</div>
```
