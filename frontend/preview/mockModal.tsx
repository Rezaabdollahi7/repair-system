import type { ReactNode } from "react";
const noop = () => {};
export function useModal() {
  return {
    openDeviceDetail: noop, openDeviceEdit: noop, openCustomerDetail: noop,
    openCustomerEdit: noop, openPersonnelEdit: noop, openItemEdit: noop,
    openItemDetail: noop, openSaleInvoiceDetail: noop, openSaleInvoiceCreate: noop,
    openSaleInvoiceEdit: noop, openPurchaseInvoiceDetail: noop,
    openPurchaseInvoiceCreate: noop, openRepairInvoiceDetail: noop,
    openRepairInvoiceCreate: noop, openRepairInvoiceEdit: noop,
    closeModal: noop, closeAllModals: noop, refreshList: noop,
  };
}
export function ModalProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
