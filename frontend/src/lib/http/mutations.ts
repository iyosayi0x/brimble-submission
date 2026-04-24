import fetchClient from "./index";

export const deployProject = (gitUrl: string) =>
  fetchClient<BaseAPIResponse<Deployment>>("/build/deploy", {
    method: "POST",
    data: { gitUrl },
  });
