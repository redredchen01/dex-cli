export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: string | number;
  method: string;
  params?: Record<string, unknown>;
}

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: string | number;
  result?: unknown;
  error?: JsonRpcError;
}

export interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

export interface AcpCapabilities {
  name: string;
  version: string;
  skills: AcpSkillInfo[];
}

export interface AcpSkillInfo {
  name: string;
  description: string;
  parameters?: Record<string, unknown>;
}

export interface AcpSession {
  id: string;
  skillName: string;
  createdAt: number;
  status: "active" | "completed" | "cancelled";
}

// Standard error codes
export const JSON_RPC_ERRORS = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
} as const;
