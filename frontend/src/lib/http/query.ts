import CONFIGS from "../config";
import fetchClient from "./index";

export const fetchProjects = () =>
  fetchClient<BaseAPIResponse<PaginatedData<Project>>>("/build/projects");

export const fetchDeploymentVersions = (projectId: string) =>
  fetchClient<BaseAPIResponse<PaginatedData<Deployment>>>(
    `/build/projects/${projectId}/deployments`,
  );

export const subscribeToLogs = (
  deploymentId: string,
  onMessage: (msg: string) => void,
  onDone?: () => void,
): (() => void) => {
  const url = `${CONFIGS.BASE_URL}/logs/deployment/${deploymentId}/logs`;
  const es = new EventSource(url, { withCredentials: true });

  es.onmessage = (event) => {
    try {
      const parsed = JSON.parse(event.data) as { message: string };
      onMessage(parsed.message);
    } catch {
      onMessage(event.data);
    }
  };

  es.onerror = () => {
    es.close();
    onDone?.();
  };

  return () => es.close();
};
