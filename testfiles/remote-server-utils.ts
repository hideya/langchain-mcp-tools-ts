import * as child_process from 'child_process';
import * as net from 'net';

/**
 * Find and return a free port on localhost.
 * @returns A Promise resolving to an available port number
 */
export async function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, () => {
      const port = (server.address() as net.AddressInfo).port;
      server.close(() => {
        resolve(port);
      });
    });
  });
}

/**
 * Start an MCP server process via supergateway with the specified transport
 * type. Supergateway runs MCP stdio-based servers over SSE or WebSockets
 * and is used here to run local SSE/WS servers for connection testing.
 * Ref: https://github.com/supercorp-ai/supergateway
 *
 * @param transportType - The transport type, either 'SSE' or 'WS'
 * @param mcpServerRunCommand - The command to run the MCP server
 * @param waitTime - Time to wait for the server to start listening on its port
 * @returns A Promise resolving to [serverProcess, serverPort]
 */
export async function startRemoteMcpServerLocally(
  transportType: string,
  mcpServerRunCommand: string,
  waitTime: number = 2
): Promise<[child_process.ChildProcess, number]> {
  const serverPort = await findFreePort();

  // Base command common to both server types
  const command = [
    "npx",
    "-y",
    "supergateway",
    "--stdio",
    mcpServerRunCommand,
    "--port", serverPort.toString(),
  ];

  // Add transport-specific arguments
  if (transportType.toLowerCase() === 'sse') {
    command.push(
      "--baseUrl", `http://localhost:${serverPort}`,
      "--ssePath", "/sse",
      "--messagePath", "/message"
    );
  } else if (transportType.toLowerCase() === 'ws') {
    command.push(
      "--outputTransport", "ws",
      "--messagePath", "/message"
    );
  } else {
    throw new Error(`Unsupported transport type: ${transportType}`);
  }

  // Start the server process
  const serverProcess = child_process.spawn(
    command[0],
    command.slice(1),
    {
      stdio: ['inherit', 'inherit', 'inherit'],
    }
  );

  console.log(`Started ${transportType.toUpperCase()} MCP Server Process with PID: ${serverProcess.pid}`);
  
  // Wait until the server starts listening on the port
  await new Promise(resolve => setTimeout(resolve, waitTime * 1000));

  return [serverProcess, serverPort];
}
