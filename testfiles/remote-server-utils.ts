import * as child_process from 'child_process';
import * as net from 'net';
import WebSocket from 'ws';

// NOTE: without the following, I got this error:
//   ReferenceError: WebSocket is not defined
//     at <anonymous> (.../node_modules/@modelcontextprotocol/sdk/src/client/websocket.ts:29:26)
global.WebSocket = WebSocket as any;

// NOTE: Hard-coded dependency on the Supergateway message
// to easily identify the end of initialization.
const SUPERGATEWAY_READY_MESSAGE = "[supergateway] Listening on port"

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
 * @returns A Promise resolving to [serverProcess, serverPort]
 */
export async function startRemoteMcpServerLocally(
  transportType: string,
  mcpServerRunCommand: string
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

  // Start the server process with stdout/stderr piped
  const serverProcess = child_process.spawn(
    command[0],
    command.slice(1),
    {
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  );

  console.log(`Starting ${transportType.toUpperCase()} MCP Server Process with PID: ${serverProcess.pid}`);
  
  // Return a promise that resolves when the server is ready
  return new Promise((resolve, reject) => {
    // Set a reasonable timeout as fallback (30 seconds)
    const timeoutId = setTimeout(() => {
      reject(new Error(`Timed out waiting for ${transportType.toUpperCase()} server to start`));
    }, 30000);
    
    // Listen for the specific log message that indicates server is ready
    serverProcess.stdout?.on('data', (data) => {
      const output = data.toString();
      console.log(output); // Still log the output to console

      if (output.includes(SUPERGATEWAY_READY_MESSAGE)) {
        clearTimeout(timeoutId);
        console.log(`${transportType.toUpperCase()} MCP Server is ready on port ${serverPort}`);
        resolve([serverProcess, serverPort]);
      }
    });

    // Handle errors
    serverProcess.stderr?.on('data', (data) => {
      console.error(`Server error: ${data}`);
    });

    serverProcess.on('error', (err) => {
      clearTimeout(timeoutId);
      reject(new Error(`Failed to start server: ${err.message}`));
    });

    serverProcess.on('exit', (code) => {
      if (code !== 0 && code !== null) {
        clearTimeout(timeoutId);
        reject(new Error(`Server process exited with code ${code}`));
      }
    });
  });
}
