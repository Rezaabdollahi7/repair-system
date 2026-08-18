// src/App.jsx
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import { AuthProvider } from "./context/AuthContext";

import ProtectedRoute from "./components/ProtectedRoute";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import Register from "./pages/Register";

import DeviceList from "./pages/DeviceList";
import CustomerList from "./pages/CustomerList";
import PersonnelList from "./pages/PersonnelList";
import ItemList from "./pages/ItemList";
import PurchaseInvoiceList from "./pages/PurchaseInvoiceList";
import SaleInvoiceList from "./pages/SaleInvoiceList";
import Dashboard from "./pages/Dashboard";
import StockReport from "./pages/StockReport";
import ProfitReport from "./pages/ProfitReport";
import TransactionsReport from "./pages/TransactionsReport";
import Settings from "./pages/Settings";
import RepairInvoiceList from "./pages/RepairInvoiceList";
import BackupList from "./pages/BackupList";
import { ThemeProvider } from "./context/ThemeContext";
import { ModalProvider } from "./context/ModalContext";

function App() {
  return (
    <ThemeProvider>
      {/* Router outside the provider: AuthContext navigates on logout and on
          an expired session, and useNavigate only works inside one. */}
      <BrowserRouter>
        <AuthProvider>
          <ModalProvider>
            <Toaster position="top-center" />
            <Routes>
              <Route path="/login" element={<Login />} />
              {/* Linked from dofixo.ir, so the marketing site can point
                  straight at app.dofixo.ir/register. */}
              <Route path="/register" element={<Register />} />

              <Route element={<ProtectedRoute />}>
                <Route path="/" element={<Layout />}>
                  <Route index element={<Navigate to="/devices" replace />} />
                  <Route path="devices" element={<DeviceList />} />
                  <Route path="customers" element={<CustomerList />} />

                  <Route element={<ProtectedRoute minRole="admin" />}>
                    <Route path="personnel" element={<PersonnelList />} />
                    <Route path="items" element={<ItemList />} />
                    <Route
                      path="purchase-invoices"
                      element={<PurchaseInvoiceList />}
                    />
                    <Route path="sale-invoices" element={<SaleInvoiceList />} />
                    <Route path="settings" element={<Settings />} />
                    <Route
                      path="repair-invoices"
                      element={<RepairInvoiceList />}
                    />
                    <Route path="backups" element={<BackupList />} />
                  </Route>

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
          </ModalProvider>
        </AuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  );
}

export default App;
