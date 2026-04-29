// src/context/ModalContext.jsx
import { createContext, useContext, useState, useRef } from "react";
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
import PurchaseInvoiceFormModal from "../components/PurchaseInvoiceFormModal.jsx";
import RepairInvoiceFormModal from "../components/RepairInvoiceFormModal";
import RepairInvoiceDetailModal from "../components/RepairInvoiceDetailModal";

const ModalContext = createContext();

export function ModalProvider({ children }) {
  const [modalState, setModalState] = useState({
    type: null, // 'deviceDetail', 'deviceEdit', 'customerDetail', 'customerEdit'
    id: null,
    props: {},
  });

  const refreshCallbackRef = useRef(null);

  const openModal = (type, id, props = {}) => {
    setModalState({ type, id, props });
  };

  const closeModal = () => {
    setModalState({ type: null, id: null, props: {} });
    if (refreshCallbackRef.current) {
      refreshCallbackRef.current();
    }
  };

  const setRefreshCallback = (callback) => {
    refreshCallbackRef.current = callback;
  };

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
        refreshList: setRefreshCallback,
      }}
    >
      {children}

      {/* Device Detail Modal */}
      {modalState.type === "deviceDetail" && (
        <DeviceDetailModal
          deviceId={modalState.id}
          isOpen={true}
          onClose={closeModal}
          onEdit={modalState.props.onEdit}
        />
      )}

      {/* Device Edit/Create Modal */}
      {modalState.type === "deviceEdit" && (
        <DeviceFormModal
          deviceId={modalState.id}
          isOpen={true}
          onClose={closeModal}
          onSuccess={closeModal}
        />
      )}

      {/* Customer Detail Modal */}
      {modalState.type === "customerDetail" && (
        <CustomerDetailModal
          customerId={modalState.id}
          isOpen={true}
          onClose={closeModal}
          onEdit={modalState.props.onEdit}
        />
      )}

      {/* Customer Edit/Create Modal */}
      {modalState.type === "customerEdit" && (
        <CustomerFormModal
          customerId={modalState.id}
          isOpen={true}
          onClose={closeModal}
          onSuccess={closeModal}
        />
      )}
      {/* Personal Edit/Create Modal */}
      {modalState.type === "personnelEdit" && (
        <PersonnelFormModal
          personnelId={modalState.id}
          isOpen={true}
          onClose={closeModal}
          onSuccess={closeModal}
        />
      )}

      {modalState.type === "itemEdit" && (
        <ItemFormModal
          itemId={modalState.id}
          isOpen={true}
          onClose={closeModal}
          onSuccess={closeModal}
        />
      )}

      {modalState.type === "itemDetail" && (
        <ItemDetailModal
          itemId={modalState.id}
          isOpen={true}
          onClose={closeModal}
        />
      )}

      {modalState.type === "saleInvoiceDetail" && (
        <SaleInvoiceDetailModal
          invoiceId={modalState.id}
          isOpen={true}
          onClose={closeModal}
        />
      )}
      {modalState.type === "saleInvoiceCreate" && (
        <SaleInvoiceFormModal
          isOpen={true}
          onClose={closeModal}
          onSuccess={closeModal}
        />
      )}

      {modalState.type === "purchaseInvoiceDetail" && (
        <PurchaseInvoiceDetailModal
          invoiceId={modalState.id}
          isOpen={true}
          onClose={closeModal}
          onSuccess={closeModal}
        />
      )}

      {modalState.type === "purchaseInvoiceCreate" && (
        <PurchaseInvoiceFormModal
          isOpen={true}
          onClose={closeModal}
          onSuccess={closeModal}
        />
      )}
      {modalState.type === "repairInvoiceDetail" && (
        <RepairInvoiceDetailModal
          invoiceId={modalState.id}
          isOpen={true}
          onClose={closeModal}
        />
      )}
      {modalState.type === "repairInvoiceCreate" && (
        <RepairInvoiceFormModal
          isOpen={true}
          onClose={closeModal}
          onSuccess={closeModal}
          initialDeviceId={modalState.id}
        />
      )}
      {modalState.type === "repairInvoiceEdit" && (
        <RepairInvoiceFormModal
          invoiceId={modalState.id}
          isOpen={true}
          onClose={closeModal}
          onSuccess={closeModal}
          initialInvoiceId={modalState.id}
        />
      )}
    </ModalContext.Provider>
  );
}

export function useModal() {
  return useContext(ModalContext);
}
