# Making Changes to langchain-mcp-tools-ts

Thank you for your interest in langchain-mcp-tools-ts!  
This guide is focused on the technical aspects of making changes to this project.

## Development Environment Setup

### Prerequisites

- Node.js 18 or higher
- npm - The Node package manager
- git

### Setting Up Your Environment

The following will install all dependencies needed to develop and test:

   ```bash
   npm install
   ```

## Project Architecture Overview

The project follows a simple and focused architecture:

- **Core functionality**: The main file `src/langchain-mcp-tools.ts` contains the functionality to convert MCP server tools into LangChain tools.

- **Key components**:
  - `convertMcpToLangchainTools`: The main entry point that handles parallel initialization of MCP servers and tool conversion
  - `convertSingleMcpToLangchainTools`: Initializes a single MCP server and converts its tools into LangChain tools

- **Data flow**: 
  1. MCP server configurations are provided
  2. Servers are initialized in parallel
  3. Available tools are retrieved from each server
  4. Tools are converted to LangChain format
  5. A cleanup function is returned to handle resource management

## Development Workflow

1. **Making changes**

   When making changes, keep the following in mind:
   - Maintain type definitions for all functions and classes
   - Follow the existing code style (the project uses ESLint for TypeScript)
   - Add comments for complex logic

2. **Watch for changes**

   You can use the TypeScript compiler in watch mode to automatically compile on changes:

   ```bash
   npm run watch
   ```

3. **Test changes quickly**

   The project includes a simple usage example that can be used to test changes:

   ```bash
   npm run simple-usage
   ```

4. **Running tests**

   The tests can help identify possible bugs. Run the test suite with Vitest:

   ```bash
   npm test
   ```

   Or with watch mode:

   ```bash
   npm run test:watch
   ```

   For coverage reports:

   ```bash
   npm run test:coverage
   ```

5. **Linting**

   Check your code with ESLint:

   ```bash
   npm run lint
   ```

6. **Clean build artifacts**

   Try clean-build once you feel comfortable with your changes.
 
   The following will remove all files that aren't git-controlled, except `.env`.  
   That means it will remove files you've created that aren't checked in,
   the node_modules directory, and all generated files.

   ```bash
   npm run clean
   ```

7. **Building the package**

   To build the package:

   ```bash
   npm run build
   ```

   This will compile TypeScript to JavaScript in the `dist` directory.

8. **Test publishing**

   To test the publishing process without actually publishing to npm:

   ```bash
   npm run publish:test
   ```

## Testing Network Features

The project includes comprehensive test servers and clients for testing remote MCP server functionality. These tests help validate different transport protocols, authentication mechanisms, and connection patterns.

### Available Test Scenarios

The project provides test servers and clients for various network scenarios:

#### 1. **Streamable HTTP Stateless (Modern, Simple)**

Tests the modern Streamable HTTP transport without authentication or session management:

```bash
# Terminal 1: Start Streamable HTTP stateless test server
npm run test:streamable:stateless:server

# Terminal 2: Run Streamable HTTP stateless test client
npm run test:streamable:stateless:client
```

**Features tested:**
- Stateless Streamable HTTP transport
- No authentication complexity
- Per-request isolation
- Concurrent connection scalability
- Auto-detection transport selection
- Simple deployment model

#### 2. **Streamable HTTP with Authentication (Modern, Advanced)**

Tests the modern Streamable HTTP transport with authentication and session management:

```bash
# Terminal 1: Start Streamable HTTP auth test server
npm run test:streamable:auth:server

# Terminal 2: Run Streamable HTTP auth test client
npm run test:streamable:auth:client
```

**Features tested:**
- Streamable HTTP transport protocol
- Session-based authentication
- POST/GET/DELETE HTTP methods
- Session lifecycle management
- Auto-detection vs explicit transport selection
- Concurrent authenticated connections

#### 3. **SSE Transport with Authentication (Legacy)**

Tests the older SSE (Server-Sent Events) transport with OAuth authentication.
Note: SSE transport is deprecated; use Streamable HTTP for new projects.

```bash
# Terminal 1: Start SSE auth test server
npm run test:sse:server

# Terminal 2: Run SSE auth test client
npm run test:sse:client
```

**Features tested:**
- SSE transport protocol (deprecated)
- OAuth 2.0 authentication flow
- Bearer token validation
- Session management
- Tool execution with authentication

#### 4. **Transport Auto-Detection**

Tests the automatic transport detection feature:

```bash
npm run test:streamable:auto-detection
```

**Features tested:**
- Automatic Streamable HTTP detection
- Fallback to SSE on 4xx errors
- Transport selection logic
- Error handling for unsupported transports

### Test Server Architecture

Each test server demonstrates different architectural patterns:

**Stateless Server (Modern, Recommended):**
- Creates new server + transport instances per request
- No session management or persistent state
- Only POST HTTP method needed
- Perfect request isolation
- Horizontally scalable architecture
- Suitable for simple API wrappers and microservices

**Stateful Server (Advanced Use Cases):**
- Uses `Map` storage for session management
- Implements Bearer token authentication
- Handles POST/GET/DELETE HTTP methods
- Maintains persistent transport instances
- Suitable for complex, user-specific scenarios

**SSE Server (Legacy, Deprecated):**
- Uses persistent Server-Sent Events connections
- Requires separate endpoints for different operations
- Less flexible than Streamable HTTP
- Maintained for backward compatibility only

### What Each Test Validates

#### **Connection Establishment**
- Transport protocol negotiation
- Authentication flow (where applicable)
- Session initialization and management
- Error handling for connection failures

#### **Tool Execution**
- MCP tool discovery (`tools/list`)
- Tool invocation (`tools/call`)
- Parameter validation
- Result handling (text content)
- Error propagation

#### **Concurrent Operations**
- Multiple simultaneous connections
- Request isolation (especially important for stateless)
- Performance under load
- Resource cleanup

#### **Transport Features**
- HTTP method handling (POST, GET, DELETE)
- SSE streaming (where applicable)
- Auto-detection and fallback logic
- CORS configuration
- Request/response debugging

### Debugging Network Issues

The test clients include comprehensive debugging features:

**HTTP Request/Response Logging:**
```bash
# Enable maximum debug output
process.env.MCP_DEBUG = "true";
```

**Server-side Debug Logging:**
All test servers include detailed debug output showing:
- Request headers and body previews
- Transport creation and cleanup
- Authentication validation
- Session management events

**Client-side Debug Logging:**
Test clients log:
- HTTP requests and responses
- Tool invocation details
- Connection lifecycle events
- Error details with troubleshooting tips

### Adding New Network Tests

When adding new transport protocols or authentication methods:

1. **Create test server**: `testfiles/new-feature-test-server.ts`
2. **Create test client**: `testfiles/new-feature-test-client.ts`
3. **Add npm scripts**: Update `package.json` with new test commands
4. **Follow naming convention**: `test:protocol:variant:server/client`
5. **Include comprehensive logging**: For debugging future issues
6. **Test edge cases**: Authentication failures, network errors, concurrent access
7. **Document in README**: Update usage examples

### Performance Testing

For performance validation:

```bash
# Run concurrent connection tests
npm run test:streamable:stateless:client  # Includes concurrent testing

# Monitor server resource usage
top -p $(pgrep -f "test-server")
```

### Common Testing Patterns

**Authentication Testing:**
- Valid/invalid tokens
- Token expiration
- Missing authentication headers
- OAuth flow simulation

**Transport Testing:**
- Protocol negotiation
- Fallback mechanisms
- Method support (POST/GET/DELETE)
- Error response handling

**Scalability Testing:**
- Concurrent connections
- Resource cleanup
- Memory usage patterns
- Connection limits

---

If you have any questions about development that aren't covered here, please open an issue for discussion.
