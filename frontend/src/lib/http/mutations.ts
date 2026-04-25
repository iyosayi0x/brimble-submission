import fetchClient from "./index";

export const deployProject = (gitUrl: string) =>
  fetchClient<BaseAPIResponse<Deployment>>("/build/deploy", {
    method: "POST",
    data: { gitUrl },
  });

export const deleteDeployment = (deploymentId: string) =>
  fetchClient<BaseAPIResponse<{ id: string }>>(
    `/build/deployments/${deploymentId}`,
    { method: "DELETE" },
  );

export const rollbackDeployment = (deploymentId: string) =>
  fetchClient<BaseAPIResponse<{ id: string; versionNumber: number }>>(
    `/build/deployments/${deploymentId}/rollback`,
    { method: "POST" },
  );
