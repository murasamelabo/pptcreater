import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createPptcreaterMcpServer } from "./server.js";

const server = createPptcreaterMcpServer();
await server.connect(new StdioServerTransport());
