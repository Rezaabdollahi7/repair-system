// src/App.jsx
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { MotionConfig } from "framer-motion";
import { Toaster } from "react-hot-toast";
import { AuthProvider } from "./context/AuthContext";

import ProtectedRoute from "./components/ProtectedRoute";
import CustomerDetail from "./pages/CustomerDetail";
import PersonnelDetail from "./pages/PersonnelDetail";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import Register from "./pages/Register";
import ForgotPassword from "./pages/ForgotPassword";
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
import ExportList from "./pages/ExportList";
import Subscription from "./pages/Subscription";
import Referral from "./pages/Referral";
import PaymentCallback from "./pages/PaymentCallback";
import SmsWallet from "./pages/SmsWallet";
import SmsWalletCallback from "./pages/SmsWalletCallback";
import { ThemeProvider } from "./context/ThemeContext";
import { ModalProvider } from "./context/ModalContext";
import { SubscriptionProvider } from "./context/SubscriptionContext";
function App() {
  return (
    /*
      One switch for every animation in the app. `reducedMotion="user"` makes
      framer-motion drop transform and layout animations — the ones that move
      things across the screen — for anyone whose system asks for reduced
      motion, while opacity and colour still cross-fade so nothing appears
      or vanishes without warning.

      Set here rather than component by component: eight of the thirty-three
      animated files called useReducedMotion, which means the other
      twenty-five ignored the preference. A per-component hook is still the
      right tool where the fallback has to differ (AuthLayout's looping
      blobs, for one, must stop entirely rather than move less) — this is the
      floor beneath those, not a replacement for them.
    */
    <MotionConfig reducedMotion="user">
      <ThemeProvider>
        {/* Router outside the provider: AuthContext navigates on logout and on
          an expired session, and useNavigate only works inside one. */}
        <BrowserRouter>
          <AuthProvider>
            {/* Inside AuthProvider: it only fetches for an admin, which means
              it has to know who is signed in. */}
            <SubscriptionProvider>
              <ModalProvider>
                {/* Themed here rather than per-call: react-hot-toast paints a
                  white card by default, which in the dark theme arrives as a
                  bright rectangle over a dark page. Reading the same tokens
                  as everything else keeps it part of the interface. */}
                <Toaster
                  position="top-center"
                  toastOptions={{
                    duration: 4000,
                    style: {
                      background: "var(--surface)",
                      color: "var(--text-primary)",
                      border: "1px solid var(--border)",
                      borderRadius: "var(--radius-field)",
                      boxShadow: "var(--shadow-lg)",
                      fontFamily: "Peyda, sans-serif",
                      fontSize: "0.875rem",
                      maxWidth: "26rem",
                    },
                    success: {
                      iconTheme: {
                        primary: "var(--success)",
                        secondary: "var(--surface)",
                      },
                    },
                    error: {
                      iconTheme: {
                        primary: "var(--danger)",
                        secondary: "var(--surface)",
                      },
                    },
                  }}
                />
                <Routes>
                  <Route path="/login" element={<Login />} />
                  {/* Linked from dofixo.ir, so the marketing site can point
                  straight at app.dofixo.ir/register. */}
                  <Route path="/register" element={<Register />} />
                  <Route path="/forgot-password" element={<ForgotPassword />} />

                  {/* Outside Layout: the customer arrives here from Zibal, and a
                  sidebar with a countdown banner is not what they want to see
                  while their payment is being confirmed. Still protected —
                  verifying needs their session. */}
                  <Route element={<ProtectedRoute />}>
                    <Route
                      path="/subscription/callback"
                      element={<PaymentCallback />}
                    />
                    {/* Its own callback, not the subscription one: the
                        trackId belongs to sms_topups, and verifying it
                        against payments would find nothing. */}
                    <Route
                      path="/sms-wallet/callback"
                      element={<SmsWalletCallback />}
                    />
                  </Route>

                  <Route element={<ProtectedRoute />}>
                    <Route path="/" element={<Layout />}>
                      <Route
                        index
                        element={<Navigate to="/devices" replace />}
                      />
                      <Route path="devices" element={<DeviceList />} />
                      <Route path="customers" element={<CustomerList />} />
                      {/* A customer's details are a page, not a modal: the
                          shop reaches one from four different lists and
                          wants a back button that goes to the list, not a
                          dialog that closes onto wherever they came from. */}
                      <Route
                        path="customers/:id"
                        element={<CustomerDetail />}
                      />

                      <Route element={<ProtectedRoute minRole="admin" />}>
                        <Route path="personnel" element={<PersonnelList />} />
                        {/* Same reasoning as the customer page: reached from the
                            personnel list and from a technician's name elsewhere, and
                            «back» has to mean the list. */}
                        <Route
                          path="personnel/:id"
                          element={<PersonnelDetail />}
                        />
                        <Route path="items" element={<ItemList />} />
                        <Route
                          path="purchase-invoices"
                          element={<PurchaseInvoiceList />}
                        />
                        <Route
                          path="sale-invoices"
                          element={<SaleInvoiceList />}
                        />
                        <Route path="settings" element={<Settings />} />
                        <Route
                          path="repair-invoices"
                          element={<RepairInvoiceList />}
                        />
                        <Route path="exports" element={<ExportList />} />
                        <Route path="subscription" element={<Subscription />} />
                        <Route path="sms-wallet" element={<SmsWallet />} />
                        <Route path="referral" element={<Referral />} />

                        {/* Admin-only to match the sidebar, and to match the
                            server: /api/reports is guarded there too
                            (AUTH.1), so leaving these open meant a technician
                            reaching an error page instead of a redirect. The
                            dashboard stays admin-only rather than serving a
                            reduced payload — that is a phase 9 product
                            decision, and if it is taken, the filtering
                            belongs in the controller. */}
                        <Route path="dashboard" element={<Dashboard />} />
                        <Route path="reports/stock" element={<StockReport />} />
                        <Route
                          path="reports/profit"
                          element={<ProfitReport />}
                        />
                        {/* No sidebar link, but a real route that calls the
                            dashboard endpoint — it has to move too. */}
                        <Route
                          path="reports/transactions"
                          element={<TransactionsReport />}
                        />
                      </Route>
                    </Route>
                  </Route>

                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </ModalProvider>
            </SubscriptionProvider>
          </AuthProvider>
        </BrowserRouter>
      </ThemeProvider>
    </MotionConfig>
  );
}

export default App;
