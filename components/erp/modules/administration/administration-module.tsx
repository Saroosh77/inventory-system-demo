"use client";

import MasterDataPage from "../../pages/master-data-page";

export default function AdministrationModule({
  notify,
}: {
  notify: (message: string) => void;
}) {
  return <MasterDataPage notify={notify} />;
}
