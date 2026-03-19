export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties?: Record<string, unknown>;
    required?: string[];
  };
}

export interface McpInitializeResult {
  protocolVersion: string;
  capabilities: {
    tools: Record<string, never>;
  };
  serverInfo: {
    name: string;
    version: string;
  };
}

export interface McpToolsListResult {
  tools: McpToolDefinition[];
}

export interface McpToolsCallResult {
  content: McpToolContent[];
  isError?: boolean;
}

export interface McpToolContent {
  type: "text";
  text: string;
}
