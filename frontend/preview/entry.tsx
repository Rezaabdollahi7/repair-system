import { createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes, Navigate } from "react-router-dom";
import "../src/index.css";
import Layout from "../src/components/Layout";
import Dashboard from "../src/pages/Dashboard";
import DeviceList from "../src/pages/DeviceList";
import CustomerList from "../src/pages/CustomerList";
import PersonnelList from "../src/pages/PersonnelList";
import ItemList from "../src/pages/ItemList";
import RepairInvoiceList from "../src/pages/RepairInvoiceList";
import StockReport from "../src/pages/StockReport";
import ProfitReport from "../src/pages/ProfitReport";
import TransactionsReport from "../src/pages/TransactionsReport";
import Settings from "../src/pages/Settings";
import Subscription from "../src/pages/Subscription";
import Referral from "../src/pages/Referral";
import ExportList from "../src/pages/ExportList";
import PersonnelDetail from "../src/pages/PersonnelDetail";

const path = new URLSearchParams(location.search).get("path") ?? "/dashboard";

createRoot(document.getElementById("root")!).render(
  <MemoryRouter initialEntries={[path]}>
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="devices" element={<DeviceList />} />
        <Route path="customers" element={<CustomerList />} />
        <Route path="personnel" element={<PersonnelList />} />
        <Route path="personnel/:id" element={<PersonnelDetail />} />
        <Route path="items" element={<ItemList />} />
        <Route path="repair-invoices" element={<RepairInvoiceList />} />
        <Route path="reports/stock" element={<StockReport />} />
        <Route path="reports/profit" element={<ProfitReport />} />
        <Route path="reports/transactions" element={<TransactionsReport />} />
        <Route path="settings" element={<Settings />} />
        <Route path="subscription" element={<Subscription />} />
        <Route path="referral" element={<Referral />} />
        <Route path="exports" element={<ExportList />} />
      </Route>
    </Routes>
  </MemoryRouter>,
);
