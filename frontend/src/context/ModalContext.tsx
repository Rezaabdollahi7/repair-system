import {
  createContext,
  useContext,
  useState,
  useRef,
  useCallback,
  type ReactNode,
} from "react";
import DeviceDetailModal from "../components/DeviceDetailModal";
import DeviceFormModal from "../components/DeviceFormModal";
import CustomerDetailModal from "../components/CustomerDetailModal";
import CustomerFormModal from "../components/CustomerFormModal";
import PersonnelFormModal from "../components/PersonnelFormModal";
import ItemFormModal from "../components/ItemFormModal";
import ItemDetailModal from "../components/ItemDetailModal";
import SaleInvoiceDetailModal from "../components/SaleInvoiceDetailModal";
import SaleInvoiceFormModal from "../components/SaleInvoiceFormModal";
import PurchaseInvoiceDetailModal from "../components/PurchaseInvoiceDetailModal";
import PurchaseInvoiceFormModal from "../components/PurchaseInvoiceFormModal";
import RepairInvoiceFormModal from "../components/RepairInvoiceFormModal";
import RepairInvoiceDetailModal from "../components/RepairInvoiceDetailModal";
import type { Id } from "../types/api";

/**
 * Which modal a stack entry renders. The strings are matched in the switch
 * below, so a typo is a compile error rather than a modal that never opens.
 */
type ModalType =
  | "deviceDetail"
  | "deviceEdit"
  | "customerDetail"
  | "customerEdit"
  | "personnelEdit"
  | "itemEdit"
  | "itemDetail"
  | "saleInvoiceDetail"
  | "saleInvoiceCreate"
  | "saleInvoiceEdit"
  | "purchaseInvoiceDetail"
  | "purchaseInvoiceCreate"
  | "repairInvoiceDetail"
  | "repairInvoiceCreate"
  | "repairInvoiceEdit";

/**
 * The detail modals hand an edit action back so the stack can push the form
 * on top of them rather than replacing what the user was looking at.
 */
interface ModalProps {
  onEdit?: (id: Id) => void;
}

interface ModalEntry {
  type: ModalType;
  id: Id | null;
  props: ModalProps;
}

interface ModalContextValue {
  openDeviceDetail: (deviceId: Id) => void;
  openDeviceEdit: (deviceId: Id | null) => void;
  openCustomerDetail: (customerId: Id) => void;
  openCustomerEdit: (customerId: Id | null) => void;
  openPersonnelEdit: (personnelId: Id | null) => void;
  openItemEdit: (itemId: Id | null) => void;
  openItemDetail: (itemId: Id) => void;
  openSaleInvoiceDetail: (invoiceId: Id) => void;
  openSaleInvoiceCreate: (deviceId?: Id | null) => void;
  openSaleInvoiceEdit: (invoiceId: Id) => void;
  openPurchaseInvoiceDetail: (invoiceId: Id) => void;
  openPurchaseInvoiceCreate: () => void;
  openRepairInvoiceDetail: (invoiceId: Id) => void;
  openRepairInvoiceCreate: (deviceId?: Id | null) => void;
  openRepairInvoiceEdit: (invoiceId: Id) => void;
  closeModal: () => void;
  closeAllModals: () => void;
  refreshList: (callback: (() => void) | null) => void;
}

const ModalContext = createContext<ModalContextValue | null>(null);

export function ModalProvider({ children }: { children: ReactNode }) {
  const [modalStack, setModalStack] = useState<ModalEntry[]>([]);
  const refreshCallbackRef = useRef<(() => void) | null>(null);

  const openModal = useCallback(
    (type: ModalType, id: Id | null, props: ModalProps = {}) => {
      setModalStack((prev) => [...prev, { type, id, props }]);
    },
    [],
  );

  const closeModal = useCallback(() => {
    setModalStack((prev) => {
      if (prev.length === 0) return prev;
      const newStack = [...prev];
      newStack.pop();
      return newStack;
    });
    // Only once the last modal has closed: refreshing under a modal that is
    // still open would reload a list nobody is looking at.
    if (modalStack.length <= 1 && refreshCallbackRef.current) {
      refreshCallbackRef.current();
    }
  }, [modalStack.length]);

  const closeAllModals = useCallback(() => {
    setModalStack([]);
    if (refreshCallbackRef.current) {
      refreshCallbackRef.current();
    }
  }, []);

  const setRefreshCallback = useCallback((callback: (() => void) | null) => {
    refreshCallbackRef.current = callback;
  }, []);

  const openPersonnelEdit = (personnelId: Id | null) =>
    openModal("personnelEdit", personnelId);
  const openDeviceDetail = (deviceId: Id) =>
    openModal("deviceDetail", deviceId, {
      onEdit: (id) => openModal("deviceEdit", id),
    });
  const openDeviceEdit = (deviceId: Id | null) =>
    openModal("deviceEdit", deviceId);
  const openItemEdit = (itemId: Id | null) => openModal("itemEdit", itemId);
  const openItemDetail = (itemId: Id) => openModal("itemDetail", itemId);
  const openCustomerDetail = (customerId: Id) =>
    openModal("customerDetail", customerId, {
      onEdit: (id) => openModal("customerEdit", id),
    });
  const openCustomerEdit = (customerId: Id | null) =>
    openModal("customerEdit", customerId);
  const openSaleInvoiceDetail = (invoiceId: Id) =>
    openModal("saleInvoiceDetail", invoiceId);
  const openSaleInvoiceCreate = (deviceId?: Id | null) =>
    openModal("saleInvoiceCreate", deviceId ?? null);
  const openSaleInvoiceEdit = (invoiceId: Id) =>
    openModal("saleInvoiceEdit", invoiceId);
  const openPurchaseInvoiceDetail = (invoiceId: Id) =>
    openModal("purchaseInvoiceDetail", invoiceId);
  const openPurchaseInvoiceCreate = () =>
    openModal("purchaseInvoiceCreate", null);
  const openRepairInvoiceDetail = (id: Id) =>
    openModal("repairInvoiceDetail", id);
  const openRepairInvoiceCreate = (deviceId?: Id | null) =>
    openModal("repairInvoiceCreate", deviceId ?? null);
  const openRepairInvoiceEdit = (id: Id) => openModal("repairInvoiceEdit", id);
  return (
    <ModalContext.Provider
      value={{
        openDeviceDetail,
        openDeviceEdit,
        openCustomerDetail,
        openCustomerEdit,
        openPersonnelEdit,
        openItemEdit,
        openItemDetail,
        openSaleInvoiceDetail,
        openSaleInvoiceCreate,
        openSaleInvoiceEdit, // ← اضافه شد
        openPurchaseInvoiceDetail,
        openPurchaseInvoiceCreate,
        openRepairInvoiceDetail,
        openRepairInvoiceCreate,
        openRepairInvoiceEdit,
        closeModal,
        closeAllModals,
        refreshList: setRefreshCallback,
      }}
    >
      {children}

      {/* Render all modals in stack (not just the last one) */}
      {modalStack.map((modal, index) => {
        const isTop = index === modalStack.length - 1;
        const zIndex = 50 + index;

        switch (modal.type) {
          case "deviceDetail":
            return (
              <DeviceDetailModal
                key={`${modal.type}-${modal.id}-${index}`}
                deviceId={modal.id}
                isOpen={true}
                onClose={closeModal}
                onEdit={modal.props?.onEdit}
                zIndex={zIndex}
              />
            );
          case "deviceEdit":
            return (
              <DeviceFormModal
                key={`${modal.type}-${modal.id}-${index}`}
                deviceId={modal.id}
                isOpen={true}
                onClose={closeModal}
                onSuccess={closeModal}
                zIndex={zIndex}
              />
            );
          case "customerDetail":
            return (
              <CustomerDetailModal
                key={`${modal.type}-${modal.id}-${index}`}
                customerId={modal.id}
                isOpen={true}
                onClose={closeModal}
                onEdit={modal.props?.onEdit}
                zIndex={zIndex}
              />
            );
          case "customerEdit":
            return (
              <CustomerFormModal
                key={`${modal.type}-${modal.id}-${index}`}
                customerId={modal.id}
                isOpen={true}
                onClose={closeModal}
                onSuccess={closeModal}
                zIndex={zIndex}
              />
            );
          case "personnelEdit":
            return (
              <PersonnelFormModal
                key={`${modal.type}-${modal.id}-${index}`}
                personnelId={modal.id}
                isOpen={true}
                onClose={closeModal}
                onSuccess={closeModal}
                zIndex={zIndex}
              />
            );
          case "itemEdit":
            return (
              <ItemFormModal
                key={`${modal.type}-${modal.id}-${index}`}
                itemId={modal.id}
                isOpen={true}
                onClose={closeModal}
                onSuccess={closeModal}
                zIndex={zIndex}
              />
            );
          case "itemDetail":
            return (
              <ItemDetailModal
                key={`${modal.type}-${modal.id}-${index}`}
                itemId={modal.id}
                isOpen={true}
                onClose={closeModal}
                zIndex={zIndex}
              />
            );
          case "saleInvoiceDetail":
            return (
              <SaleInvoiceDetailModal
                key={`${modal.type}-${modal.id}-${index}`}
                invoiceId={modal.id}
                isOpen={true}
                onClose={closeModal}
                zIndex={zIndex}
              />
            );
          case "saleInvoiceCreate":
            return (
              <SaleInvoiceFormModal
                key={`${modal.type}-${modal.id}-${index}`}
                isOpen={true}
                onClose={closeModal}
                onSuccess={closeModal}
                deviceId={modal.id}
                zIndex={zIndex}
              />
            );
          // ===== کیس جدید برای ویرایش فاکتور فروش =====
          case "saleInvoiceEdit":
            return (
              <SaleInvoiceFormModal
                key={`${modal.type}-${modal.id}-${index}`}
                isOpen={true}
                onClose={closeModal}
                onSuccess={closeModal}
                invoiceId={modal.id}
                zIndex={zIndex}
              />
            );
          case "purchaseInvoiceDetail":
            return (
              <PurchaseInvoiceDetailModal
                key={`${modal.type}-${modal.id}-${index}`}
                invoiceId={modal.id}
                isOpen={true}
                onClose={closeModal}
                onSuccess={closeModal}
                zIndex={zIndex}
              />
            );
          case "purchaseInvoiceCreate":
            return (
              <PurchaseInvoiceFormModal
                key={`${modal.type}-${modal.id}-${index}`}
                isOpen={true}
                onClose={closeModal}
                onSuccess={closeModal}
                zIndex={zIndex}
              />
            );
          case "repairInvoiceDetail":
            return (
              <RepairInvoiceDetailModal
                key={`${modal.type}-${modal.id}-${index}`}
                invoiceId={modal.id}
                isOpen={true}
                onClose={closeModal}
                zIndex={zIndex}
              />
            );
          case "repairInvoiceCreate":
            return (
              <RepairInvoiceFormModal
                key={`${modal.type}-${modal.id}-${index}`}
                isOpen={true}
                onClose={closeModal}
                onSuccess={closeModal}
                initialDeviceId={modal.id}
                zIndex={zIndex}
              />
            );
          case "repairInvoiceEdit":
            return (
              <RepairInvoiceFormModal
                key={`${modal.type}-${modal.id}-${index}`}
                isOpen={true}
                onClose={closeModal}
                onSuccess={closeModal}
                initialInvoiceId={modal.id}
                zIndex={zIndex}
              />
            );
          default:
            return null;
        }
      })}
    </ModalContext.Provider>
  );
}

export function useModal() {
  const ctx = useContext(ModalContext);
  // Guarded like useAuth and useTheme: without it a caller outside the
  // provider gets `undefined` and fails one line later on a property access,
  // which says nothing about what actually went wrong.
  if (!ctx) throw new Error("useModal must be used inside ModalProvider");
  return ctx;
}
