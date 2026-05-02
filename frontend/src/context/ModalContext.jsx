// src/context/ModalContext.jsx
import {
  createContext,
  useContext,
  useState,
  useRef,
  useCallback,
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

const ModalContext = createContext();

export function ModalProvider({ children }) {
  const [modalStack, setModalStack] = useState([]);
  const refreshCallbackRef = useRef(null);

  const openModal = useCallback((type, id, props = {}) => {
    setModalStack((prev) => [...prev, { type, id, props }]);
  }, []);

  const closeModal = useCallback(() => {
    setModalStack((prev) => {
      if (prev.length === 0) return prev;
      const newStack = [...prev];
      newStack.pop();
      return newStack;
    });
    // refresh callback فقط وقتی آخرین Modal بسته شد اجرا بشه
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

  const setRefreshCallback = useCallback((callback) => {
    refreshCallbackRef.current = callback;
  }, []);

  const openPersonnelEdit = (personnelId) =>
    openModal("personnelEdit", personnelId);
  const openDeviceDetail = (deviceId) =>
    openModal("deviceDetail", deviceId, {
      onEdit: (id) => openModal("deviceEdit", id),
    });
  const openDeviceEdit = (deviceId) => openModal("deviceEdit", deviceId);
  const openItemEdit = (itemId) => openModal("itemEdit", itemId);
  const openItemDetail = (itemId) => openModal("itemDetail", itemId);
  const openCustomerDetail = (customerId) =>
    openModal("customerDetail", customerId, {
      onEdit: (id) => openModal("customerEdit", id),
    });
  const openCustomerEdit = (customerId) =>
    openModal("customerEdit", customerId);
  const openSaleInvoiceDetail = (invoiceId) =>
    openModal("saleInvoiceDetail", invoiceId);
  const openSaleInvoiceCreate = () => openModal("saleInvoiceCreate", null);
  const openPurchaseInvoiceDetail = (invoiceId) =>
    openModal("purchaseInvoiceDetail", invoiceId);
  const openPurchaseInvoiceCreate = () =>
    openModal("purchaseInvoiceCreate", null);
  const openRepairInvoiceDetail = (id) => openModal("repairInvoiceDetail", id);
  const openRepairInvoiceCreate = (deviceId) =>
    openModal("repairInvoiceCreate", deviceId);
  const openRepairInvoiceEdit = (id) => openModal("repairInvoiceEdit", id);

  // آخرین Modal توی stack
  const current =
    modalStack.length > 0
      ? modalStack[modalStack.length - 1]
      : { type: null, id: null, props: {} };

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
                invoiceId={modal.id}
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
  return useContext(ModalContext);
}
