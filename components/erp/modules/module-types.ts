import type { ErpAction, WorkspaceData } from "@/lib/erp/types";

export type WorkspaceModuleProps = {
  workspace: WorkspaceData;
  onAction: (action: ErpAction) => Promise<unknown>;
  onUploadProof: (form: FormData) => Promise<void>;
  notify: (message: string) => void;
  refreshVersion: number;
  requestRefresh: () => void;
};

export type DataModuleProps = Pick<
  WorkspaceModuleProps,
  "workspace" | "notify" | "refreshVersion" | "requestRefresh"
>;
