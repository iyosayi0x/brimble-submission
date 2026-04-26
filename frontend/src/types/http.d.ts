type DeploymentStatus = "PENDING" | "BUILDING" | "RUNNING" | "FAILED";

type BaseAPIResponse<T> = {
  message: string;
  data: T;
  success: boolean;
};

type PaginatedData<T> = {
  items: T[];
  nextCursor: string | null;
  hasNextPage: boolean;
};

type Project = {
  id: string;
  name: string;
  slug: string;
  gitUrl: string;
  createdAt: string;
  port: number;
};

type Deployment = {
  id: string;
  projectId: string;
  versionNumber: number;
  status: DeploymentStatus;
  imageTag: string | null;
  containerId: string | null;
  internalIp: string | null;
  url: string | null;
  createdAt: string;
};
