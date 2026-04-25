import express from "express";
import http from "http";
import CONFIGS from "./config";

const app = express();
const httpServer = http.createServer(app);

// Pre-route middlewares
import preRouteMiddleware from "./middlewares/pre-route-middleware";
preRouteMiddleware(app);

// routes
import routes from "./routes";
app.use(routes);

// Error middlewares
import errorMiddleware from "./middlewares/error-middleware";
import deploymentService from "./services/deployment.service";
errorMiddleware(app);

// Listen to server port
const { PORT } = CONFIGS;
httpServer.listen(PORT, async () => {
  console.log(`:::> Server listening on port @ http://localhost:${PORT}`);
});

// On server error
httpServer.on("error", (error) => {
  console.error(`<::: An error occurred on the server: \n ${error}`);
});

httpServer.on("close", async () => {
  await deploymentService.shutDownRunningDeployments();
});

const gracefulShutdown = async () => {
  await deploymentService.shutDownRunningDeployments();
  console.log(":::> Received kill signal, shutting down gracefully");
  process.exit(0);
};

process.on("SIGTERM", gracefulShutdown);
process.on("SIGINT", gracefulShutdown);
