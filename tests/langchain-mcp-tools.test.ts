import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { convertMcpToLangchainTools } from '../src/langchain-mcp-tools.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

// Get the mocked type
type MockedClass<T extends abstract new (...args: any) => any> = {
  new(...args: any[]): T;
} & { mockImplementation: (fn: () => Partial<InstanceType<T>>) => void };

const MockedClient = Client as unknown as MockedClass<typeof Client>;
const MockedStdioClientTransport = StdioClientTransport as unknown as MockedClass<typeof StdioClientTransport>;
import { DynamicStructuredTool, StructuredTool } from '@langchain/core/tools';

// Mock external dependencies
// Mock modules
vi.mock('@modelcontextprotocol/sdk/client/index.js', () => ({
  Client: vi.fn(() => {
    return {};
  }) as unknown as typeof Client,
}));

vi.mock('@modelcontextprotocol/sdk/client/stdio.js', () => ({
  StdioClientTransport: vi.fn(() => {
    return {};
  }) as unknown as typeof StdioClientTransport,
}));

describe('convertMcpToLangchainTools', () => {
  let mockConnect;
  let mockRequest;
  let mockTransportClose;

  beforeEach(() => {
    // Reset all mocks before each test
    vi.clearAllMocks();

    // Setup mock implementations
    mockConnect = vi.fn();
    mockRequest = vi.fn();
    mockTransportClose = vi.fn();

    // Mock Client implementation
    MockedClient.mockImplementation(() => ({
      connect: mockConnect,
      request: mockRequest,
    }));

    // Mock StdioClientTransport implementation
    MockedStdioClientTransport.mockImplementation(() => ({
      close: mockTransportClose,
    }));
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should handle empty config', async () => {
    const { tools, cleanup } = await convertMcpToLangchainTools({});
    expect(tools).toHaveLength(0);
    await cleanup();
  });

  it('should throw MCPInitializationError for invalid server config', async () => {
    const invalidConfig = {
      test: {
        command: 'nonexistent-command',
        args: [],
      },
    };

    await expect(convertMcpToLangchainTools(invalidConfig))
      .rejects
      .toThrow('Failed to initialize MCP server');
  });

  it('should successfully convert MCP server to LangChain tools', async () => {
    // Mock successful tool listing response
    mockRequest.mockImplementation((req) => {
      if (req.method === 'tools/list') {
        return {
          tools: [
            {
              name: 'test-tool',
              description: 'A test tool',
              inputSchema: {
                type: 'object',
                properties: {
                  input: { type: 'string' }
                }
              }
            }
          ]
        };
      }
      return { content: [{ type: 'text', text: 'test result' }] };
    });

    const config = {
      testServer: {
        command: 'test-command',
        args: ['--test'],
        env: { TEST: 'true' }
      }
    };

    const { tools, cleanup } = await convertMcpToLangchainTools(config);

    // Verify the conversion results
    expect(tools).toHaveLength(1);
    expect(tools[0]).toBeInstanceOf(StructuredTool);
    expect(tools[0].name).toBe('test-tool');

    // Test tool execution
    const result = await (tools[0] as DynamicStructuredTool).func({ input: 'test' });
    expect(result).toBe('test result');

    // Verify cleanup
    await cleanup();
    expect(mockTransportClose).toHaveBeenCalled();
  });

  it('should handle multiple servers and tools', async () => {
    mockRequest.mockImplementation((req) => {
      if (req.method === 'tools/list') {
        return {
          tools: [
            { name: 'tool1', description: 'Tool 1', inputSchema: { type: 'object' } },
            { name: 'tool2', description: 'Tool 2', inputSchema: { type: 'object' } }
          ]
        };
      }
      return { content: [{ type: 'text', text: 'result' }] };
    });

    const config = {
      server1: { command: 'cmd1', args: [] },
      server2: { command: 'cmd2', args: [] }
    };

    const { tools, cleanup } = await convertMcpToLangchainTools(config);
    expect(tools).toHaveLength(4); // 2 tools × 2 servers
    await cleanup();
  });

  it('should handle server initialization failures gracefully', async () => {
    mockConnect.mockRejectedValueOnce(new Error('Connection failed'));

    const config = {
      failingServer: { command: 'fail', args: [] },
    };

    await expect(convertMcpToLangchainTools(config))
      .rejects
      .toThrow('Failed to initialize MCP server: failingServer: Connection failed');
  });

  it('should handle empty tool results correctly', async () => {
    mockRequest.mockImplementation((req) => {
      if (req.method === 'tools/list') {
        return { tools: [] };
      }
      return { content: [] };
    });

    const config = {
      emptyServer: { command: 'empty', args: [] }
    };

    const { tools, cleanup } = await convertMcpToLangchainTools(config);
    expect(tools).toHaveLength(0);
    await cleanup();
  });

  it('should handle tool execution errors', async () => {
    mockRequest.mockImplementation((req) => {
      if (req.method === 'tools/list') {
        return {
          tools: [{ name: 'error-tool', description: 'Error Tool', inputSchema: { type: 'object' } }]
        };
      }
      throw new Error('Tool execution failed');
    });

    const config = {
      errorServer: { command: 'error', args: [] }
    };

    const { tools } = await convertMcpToLangchainTools(config);
    await expect((tools[0] as DynamicStructuredTool).func({})).resolves.toContain('Error executing MCP tool:');

  });

  it('should handle different content types in tool results', async () => {
    mockRequest.mockImplementation((req) => {
      if (req.method === 'tools/list') {
        return {
          tools: [{ name: 'mixed-content', description: 'Test Tool', inputSchema: { type: 'object' } }]
        };
      }
      return {
        content: [
          { type: 'text', text: 'text content' },
          { type: 'other', text: 'should be filtered' },
          { type: 'text', text: 'more text' }
        ]
      };
    });

    const config = {
      testServer: { command: 'test', args: [] }
    };

    const { tools } = await convertMcpToLangchainTools(config);
    const result = await (tools[0] as DynamicStructuredTool).func({ test: true });
    expect(result).toBe('text content\n\nmore text');
  });

  it('should handle cleanup failures', async () => {
    mockTransportClose.mockRejectedValueOnce(new Error('Cleanup failed'));
    mockTransportClose.mockResolvedValueOnce();

    mockRequest.mockImplementation((req) => {
      if (req.method === 'tools/list') {
        return {
          tools: [{ name: 'test-tool', description: 'Test Tool', inputSchema: { type: 'object' } }]
        };
      }
      return { content: [{ type: 'text', text: 'result' }] };
    });

    const config = {
      server1: { command: 'cmd1', args: [] },
      server2: { command: 'cmd2', args: [] }
    };

    const { cleanup } = await convertMcpToLangchainTools(config);
    await cleanup(); // Should handle the mixed success/failure case
  });

  it('should handle logger with different log levels', async () => {
    mockRequest.mockImplementation((req) => {
      if (req.method === 'tools/list') {
        return {
          tools: [{ name: 'test-tool', description: 'Test Tool', inputSchema: { type: 'object' } }]
        };
      }
      return { content: [{ type: 'text', text: 'result' }] };
    });

    const config = {
      testServer: { command: 'test', args: [] }
    };

    // Test with debug level
    await convertMcpToLangchainTools(config, { logLevel: 'debug' });
    // Test with trace level
    await convertMcpToLangchainTools(config, { logLevel: 'trace' });
  });

  it('should handle transport closure during error', async () => {
    // Mock connect to fail first
    mockConnect.mockRejectedValueOnce(new Error('Connection error'));

    // For transport closure, we should resolve it instead of reject
    // because we want the original connection error to be thrown
    mockTransportClose.mockResolvedValueOnce();

    const config = {
      errorServer: { command: 'error', args: [] }
    };

    await expect(convertMcpToLangchainTools(config))
      .rejects
      .toThrow('Failed to initialize MCP server: errorServer: Connection error');
  });

  it('should handle missing tool descriptions', async () => {
    mockRequest.mockImplementation((req) => {
      if (req.method === 'tools/list') {
        return {
          tools: [{
            name: 'no-description',
            inputSchema: { type: 'object' }
            // description intentionally omitted
          }]
        };
      }
      return { content: [{ type: 'text', text: 'result' }] };
    });

    const config = {
      testServer: { command: 'test', args: [] }
    };

    const { tools } = await convertMcpToLangchainTools(config);
    expect(tools[0].description).toBe('');
  });

  it('should handle environment variables in config', async () => {
    mockRequest.mockImplementation((req) => {
      if (req.method === 'tools/list') {
        return {
          tools: [{ name: 'test-tool', description: 'Test Tool', inputSchema: { type: 'object' } }]
        };
      }
      return { content: [{ type: 'text', text: 'result' }] };
    });

    const config = {
      testServer: {
        command: 'test',
        args: [],
        env: {
          TEST_VAR: 'test-value',
          ANOTHER_VAR: 'another-value'
        }
      }
    };

    const { tools } = await convertMcpToLangchainTools(config);
    expect(MockedStdioClientTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        env: expect.objectContaining({
          TEST_VAR: 'test-value',
          ANOTHER_VAR: 'another-value'
        })
      })
    );
  });

  it('should handle cleanup failure during initialization error', async () => {
    mockConnect.mockRejectedValueOnce(new Error('Connection error'));
    mockTransportClose.mockRejectedValueOnce(new Error('Cleanup failed'));

    const config = {
      errorServer: { command: 'error', args: [] }
    };

    // We still expect the original error to be thrown
    await expect(convertMcpToLangchainTools(config))
      .rejects
      .toThrow('Failed to initialize MCP server: errorServer: Connection error');
  });
});
