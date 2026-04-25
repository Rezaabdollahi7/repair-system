// src/App.jsx
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import { AuthProvider } from "./context/AuthContext";

import ProtectedRoute from "./components/ProtectedRoute";
import Layout from "./components/Layout";
import Login from "./pages/Login";

import DeviceList from "./pages/DeviceList";
import CustomerList from "./pages/CustomerList";
import CustomerForm from "./pages/CustomerForm";
import CustomerDetail from "./pages/CustomerDetail";
import PersonnelList from "./pages/PersonnelList";
import PersonnelForm from "./pages/PersonnelForm";
import ItemDetail from "./pages/ItemDetail";
import ItemForm from "./pages/ItemForm";
import ItemList from "./pages/ItemList";
import CategoryManagement from "./pages/CategoryManagement";
import PurchaseInvoiceList from "./pages/PurchaseInvoiceList";
import PurchaseInvoiceForm from "./pages/PurchaseInvoiceForm";
import PurchaseInvoiceDetail from "./pages/PurchaseInvoiceDetail";
import SaleInvoiceList from "./pages/SaleInvoiceList";
import SaleInvoiceForm from "./pages/SaleInvoiceForm";
import SaleInvoiceDetail from "./pages/SaleInvoiceDetail";
import Dashboard from "./pages/Dashboard";
import StockReport from "./pages/StockReport";
import ProfitReport from "./pages/ProfitReport";
import TransactionsReport from "./pages/TransactionsReport";
import Settings from "./pages/Settings";
import RepairInvoiceList from "./pages/RepairInvoiceList";
import RepairInvoiceForm from "./pages/RepairInvoiceForm";
import RepairInvoiceDetail from "./pages/RepairInvoiceDetail";

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Toaster position="top-center" />
        <Routes>
          <Route path="/login" element={<Login />} />

          <Route element={<ProtectedRoute />}>
            <Route path="/" element={<Layout />}>
              <Route index element={<Navigate to="/devices" replace />} />
              <Route path="devices" element={<DeviceList />} />
              <Route path="customers" element={<CustomerList />} />
              <Route path="customers/new" element={<CustomerForm />} />
              <Route path="customers/:id" element={<CustomerDetail />} />
              <Route path="customers/:id/edit" element={<CustomerForm />} />

              <Route element={<ProtectedRoute minRole="admin" />}>
                <Route path="personnel" element={<PersonnelList />} />
                <Route path="personnel/new" element={<PersonnelForm />} />
                <Route path="personnel/:id/edit" element={<PersonnelForm />} />
                //!TODO : check
                <Route path="items" element={<ItemList />} />
                <Route path="items/new" element={<ItemForm />} />
                <Route path="items/:id" element={<ItemDetail />} />
                <Route path="items/:id/edit" element={<ItemForm />} />
                <Route path="categories" element={<CategoryManagement />} />
                <Route
                  path="purchase-invoices"
                  element={<PurchaseInvoiceList />}
                />
                <Route
                  path="purchase-invoices/new"
                  element={<PurchaseInvoiceForm />}
                />
                <Route
                  path="purchase-invoices/:id"
                  element={<PurchaseInvoiceDetail />}
                />
                <Route path="sale-invoices" element={<SaleInvoiceList />} />
                <Route path="sale-invoices/new" element={<SaleInvoiceForm />} />
                <Route
                  path="sale-invoices/:id"
                  element={<SaleInvoiceDetail />}
                />
                <Route path="settings" element={<Settings />} />
                <Route path="repair-invoices" element={<RepairInvoiceList />} />
                <Route
                  path="repair-invoices/new"
                  element={<RepairInvoiceForm />}
                />
                <Route
                  path="repair-invoices/:id"
                  element={<RepairInvoiceDetail />}
                />
                <Route
                  path="repair-invoices/:id/edit"
                  element={<RepairInvoiceForm />}
                />
              </Route>

              {/* <Route index element={<Dashboard />} /> */}
              <Route path="dashboard" element={<Dashboard />} />
              <Route path="reports/stock" element={<StockReport />} />
              <Route path="reports/profit" element={<ProfitReport />} />
              <Route
                path="reports/transactions"
                element={<TransactionsReport />}
              />
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
