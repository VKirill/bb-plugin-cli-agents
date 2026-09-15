import { defineRpcContract } from "@get-bb/plugin-sdk";
import { z } from "zod";
export const providerSchema = z.enum(["claude-code", "acp-opencode", "codex"]);
export const agentSchema = z.object({
  id: z.string().min(1).max(200),
  description: z.string().max(1200),
  source: z.string(),
  mode: z.string(),
});
export type Agent = z.infer<typeof agentSchema>;
export type Provider = z.infer<typeof providerSchema>;
export const catalogSchema = z.object({
  agents: z.array(agentSchema).max(2000),
  version: z.string(),
  warnings: z.array(z.string()),
  supported: z.boolean(),
});
export type Catalog = z.infer<typeof catalogSchema>;
export const targetSchema = z.object({
  projectId: z.string().min(1),
  hostId: z.string().min(1),
  providerId: providerSchema,
  environmentId: z.string().nullable().default(null),
});
export type Target = z.infer<typeof targetSchema>;
export const selectionSchema = targetSchema.extend({
  agentId: z.string().min(1).max(200),
  cwd: z.string(),
  token: z.string().uuid(),
  createdAt: z.number(),
});
export type Selection = z.infer<typeof selectionSchema>;
export const envSchema = z.array(
  z.object({ name: z.string(), value: z.string(), reason: z.string() }),
);
export const hostContract = defineRpcContract({
  discover: {
    input: z.object({ cwd: z.string(), providerId: providerSchema }),
    output: catalogSchema,
  },
  instructions: {
    input: z.object({ agentId: z.string() }),
    output: z.string().max(4096),
  },
  prepare: {
    input: z.object({
      cwd: z.string(),
      providerId: providerSchema,
      agentId: z.string().min(1).max(200),
    }),
    output: envSchema,
  },
});
export const rpcContract = defineRpcContract({
  defaults: {
    input: z.object({ projectId: z.string() }),
    output: z.object({ hostId: z.string(), providerId: z.string() }),
  },
  catalog: { input: targetSchema, output: catalogSchema },
  select: {
    input: targetSchema.extend({ agentId: z.string().min(1).max(200) }),
    output: z.object({ token: z.string(), label: z.string() }),
  },
  thread: {
    input: z.object({ threadId: z.string() }),
    output: selectionSchema.nullable(),
  },
  favorites: {
    input: z.object({ providerId: providerSchema }),
    output: z.array(z.string().max(200)).max(200),
  },
  favorite: {
    input: z.object({
      providerId: providerSchema,
      agentId: z.string().min(1).max(200),
      pinned: z.boolean(),
    }),
    output: z.array(z.string().max(200)).max(200),
  },
});
