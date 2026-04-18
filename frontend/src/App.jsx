// src/App.jsx
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import { AuthProvider } from "./context/AuthContext";

import ProtectedRoute from "./components/ProtectedRoute";
import Layout from "./components/Layout";
import Login from "./pages/Login";

import DeviceList from "./pages/DeviceList";
import DeviceForm from "./pages/DeviceForm";
import DeviceDetail from "./pages/DeviceDetail";
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
              <Route path="devices/new" element={<DeviceForm />} />
              <Route path="devices/:id" element={<DeviceDetail />} />
              <Route path="devices/:id/edit" element={<DeviceForm />} />
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
              </Route>
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
