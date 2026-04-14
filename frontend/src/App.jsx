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
