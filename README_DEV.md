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
   npm run test-publish
   ```

---

If you have any questions about development that aren't covered here, please open an issue for discussion.
