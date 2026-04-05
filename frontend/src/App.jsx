import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import Layout from "./components/Layout";
import DeviceList from "./pages/DeviceList";
import DeviceForm from "./pages/DeviceForm";
import DeviceDetail from "./pages/DeviceDetail";
import CustomerList from "./pages/CustomerList";
import CustomerForm from "./pages/CustomerForm";

function App() {
  return (
    <BrowserRouter>
      <Toaster position="top-left" />
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Navigate to="/devices" replace />} />
          <Route path="devices" element={<DeviceList />} />
          <Route path="devices/new" element={<DeviceForm />} />
          <Route path="devices/:id" element={<DeviceDetail />} />
          <Route path="devices/:id/edit" element={<DeviceForm />} />
          <Route path="customers" element={<CustomerList />} />
          <Route path="customers/new" element={<CustomerForm />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
