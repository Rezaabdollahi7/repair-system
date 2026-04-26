// src/context/ModalContext.jsx
import { createContext, useContext, useState } from "react";
import DeviceDetailModal from "../components/DeviceDetailModal";
import DeviceFormModal from "../components/DeviceFormModal";
import CustomerDetailModal from "../components/CustomerDetailModal";
import CustomerFormModal from "../components/CustomerFormModal";
import PersonnelFormModal from "../components/PersonnelFormModal";

const ModalContext = createContext();

export function ModalProvider({ children }) {
  const [modalState, setModalState] = useState({
    type: null, // 'deviceDetail', 'deviceEdit', 'customerDetail', 'customerEdit'
    id: null,
    props: {},
  });

  const openModal = (type, id, props = {}) => {
    setModalState({ type, id, props });
  };

  const closeModal = () => {
    setModalState({ type: null, id: null, props: {} });
  };

  const openPersonnelEdit = (personnelId) =>
    openModal("personnelEdit", personnelId);

  const openDeviceDetail = (deviceId) =>
    openModal("deviceDetail", deviceId, {
      onEdit: (id) => openModal("deviceEdit", id),
    });

  const openDeviceEdit = (deviceId) => openModal("deviceEdit", deviceId);

  const openCustomerDetail = (customerId) =>
    openModal("customerDetail", customerId, {
      onEdit: (id) => openModal("customerEdit", id),
    });

  const openCustomerEdit = (customerId) =>
    openModal("customerEdit", customerId);

  return (
    <ModalContext.Provider
      value={{
        openDeviceDetail,
        openDeviceEdit,
        openCustomerDetail,
        openCustomerEdit,
        openPersonnelEdit,
        closeModal,
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
    </ModalContext.Provider>
  );
}

export function useModal() {
  return useContext(ModalContext);
}
