import fetchClient from "./index";

export const deployProject = (gitUrl: string, port?: number) =>
  fetchClient<BaseAPIResponse<Deployment>>("/build/deploy", {
    method: "POST",
    data: { gitUrl, ...(port !== undefined ? { port } : {}) },
  });

export const deleteProject = (projectId: string) =>
  fetchClient<BaseAPIResponse<{ id: string }>>(`/build/projects/${projectId}`, {
    method: "DELETE",
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
